"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const guard = require("../bash-frontmatter-guard.cjs");
const editGuard = require("../pre-edit-frontmatter-immutable.cjs");

// --- Edit 側ガードとの一致 ------------------------------------------------
//
// 本ガードは pre-edit-frontmatter-immutable.cjs を require しない(ディスパッチャの
// sha256 ピンは実行する 1 ファイルしか照合しないので、require した先は無検査で走る)。
// 代わりに複製した定義が Edit 側とずれていないことをここで固定する。

test("PROTECTED_KEYS が Edit 側ガードと一致する", () => {
  assert.deepEqual(guard.PROTECTED_KEYS, editGuard.PROTECTED_KEYS);
});

test("保護キーの抽出が実データ全件で Edit 側ガードと一致する", () => {
  // キーごとの正規表現は関数の中で組み立てているので、export の比較では固定できない。
  // 実データに両方をかけて出力を比べる。
  const root = path.resolve(__dirname, "..", "..", "..");
  let compared = 0;
  for (const dir of guard.CONTENT_DIRS) {
    for (const name of fs.readdirSync(path.join(root, dir))) {
      const text = fs.readFileSync(path.join(root, dir, name), "utf8");
      const fm = editGuard.extractFrontmatter(text);
      assert.equal(guard.extractFrontmatter(text), fm, name);
      assert.deepEqual(
        guard.captureProtectedFields(fm),
        editGuard.captureProtectedFields(fm),
        name
      );
      compared++;
    }
  }
  assert.ok(compared >= 100, `比較が ${compared} 件しかない`);

  // 実データに無い形(リスト形・値が空・全角空白のインデント・CRLF)も比べる。
  // 実データだけだと、前置きの `(?:-[ \t]*)?` を落とす変異が緑のまま通る。
  for (const fm of [
    "authors:\n  - Smith\n  - url: https://example.org/x",
    "sourceUrl:\nmonthsGained: 5",
    "　sourceUrl: https://example.org/a\ncost: 2",
    "monthsGained: 5\r\nsourceUrl: 'https://example.org/q'\r\n",
    // 値の前後の空白・空白だけの値・空の値(値の取り方は valueAfterColon の複製が決める)
    "url: a  b \t\nsourceUrl:  \t\ncost:\nyear:'2020'",
  ]) {
    assert.deepEqual(
      guard.captureProtectedFields(fm),
      editGuard.captureProtectedFields(fm),
      JSON.stringify(fm)
    );
  }
});

test("require するのは node の組み込みだけ", () => {
  // 組み込み以外を require すると、その先はディスパッチャの sha256 照合を通らずに走る。
  const src = fs.readFileSync(
    path.join(__dirname, "..", "bash-frontmatter-guard.cjs"),
    "utf8"
  );
  const required = [...src.matchAll(/\brequire\s*\(\s*([^)]*)\)/g)].map((m) =>
    m[1].trim()
  );
  assert.ok(required.length > 0);
  for (const r of required) assert.match(r, /^"node:[a-z_/]+"$/);
});

// --- fixture ------------------------------------------------------------

const BODY =
  "---\ntitle: a\nmonthsGained: 5\nsourceUrl: https://example.org/a\n---\n\n本文\n";
const X = "src/content/strategies/x.md";

function git(cwd, ...args) {
  const res = spawnSync(
    "git",
    [
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@example.com",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { cwd, encoding: "utf8" }
  );
  assert.equal(res.status, 0, res.stderr);
  return res.stdout;
}

// 1 回の実行で git リポを 20 個以上作るので、終わったら消す
const tmpDirs = [];
const tmp = (prefix) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
};
test.after(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** 保護キーを持つ strategies / columns のファイルが 1 本ずつある git リポと、未作成の状態置き場 */
function makeRepo() {
  const root = tmp("bash-fm-repo-");
  for (const d of guard.CONTENT_DIRS)
    fs.mkdirSync(path.join(root, d), { recursive: true });
  fs.writeFileSync(path.join(root, X), BODY);
  fs.writeFileSync(path.join(root, "src/content/columns/y.md"), BODY);
  git(root, "init", "-q");
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "init");
  const stateDir = path.join(tmp("bash-fm-state-"), "guard");
  return { root, stateDir };
}

const call = (ctx, event, command, toolUseId = "toolu_01") =>
  guard.run(
    JSON.stringify({
      hook_event_name: event,
      session_id: "sess-1",
      tool_use_id: toolUseId,
      tool_name: "Bash",
      tool_input: { command },
    }),
    { root: ctx.root, stateDir: ctx.stateDir }
  );

const parsed = (out) => (out.stdout ? JSON.parse(out.stdout) : {});
const decisionOf = (out) => parsed(out).hookSpecificOutput?.permissionDecision;

// --- PreToolUse: 事前 ask(コマンド文字列の補助の網) --------------------

test("Pre: コンテンツへの sed -i は ask", () => {
  const ctx = makeRepo();
  for (const cmd of [
    `sed -i '' 's/monthsGained: 5/monthsGained: 9/' ${X}`,
    `sed -E -i.bak 's/a/b/' src/content/columns/y.md`,
    `perl -pi -e 's/5/9/' ${X}`,
  ]) {
    assert.equal(decisionOf(call(ctx, "PreToolUse", cmd)), "ask", cmd);
  }
});

test("Pre: インタプリタの書き込み・tee・リダイレクト・mv/cp の宛先・git の復元は ask", () => {
  const ctx = makeRepo();
  for (const cmd of [
    `python3 -c "import pathlib; p=pathlib.Path('${X}'); p.write_text(p.read_text().replace('5','9'))"`,
    `python3 - <<'PY'\nwith open("${X}", "w") as f:\n    f.write("x")\nPY`,
    `node -e "require('fs').writeFileSync('${X}', 'x')"`,
    `ruby -e 'File.write("${X}", "x")'`,
    `echo x | tee ${X}`,
    `printf 'x' > ${X}`,
    `cat <<'EOF2' >> src/content/columns/y.md\nx\nEOF2`,
    `mv /tmp/x.md ${X}`,
    `cp -f /tmp/x.md src/content/columns/`,
    `git checkout origin/main -- ${X}`,
    `git restore --source=HEAD~1 src/content/strategies/`,
  ]) {
    assert.equal(decisionOf(call(ctx, "PreToolUse", cmd)), "ask", cmd);
  }
});

test("Pre: 読むだけのコマンドと無関係なコマンドは ask しない", () => {
  const ctx = makeRepo();
  for (const cmd of [
    `grep -n monthsGained ${X}`,
    `sed -n '1,20p' ${X}`,
    `python3 -c "import pathlib; print(pathlib.Path('${X}').read_text()[:200])"`,
    `node -e "console.log(require('fs').readFileSync('${X}','utf8'))"`,
    `cp ${X} /tmp/backup.md`,
    `git diff -- src/content/strategies/`,
    `grep -rl sourceUrl src/content/columns > /tmp/list.txt`,
    `npm run check:all`,
    `sed -i '' 's/a/b/' docs/notes.md`,
    // 書き換えの形とコンテンツのパスが別の区切り・別の書き込み先にある
    `git checkout -q main && grep -h "^sourceUrl" src/content/strategies/*.md`,
    `sed -i '' s/a/b/ /tmp/p.html; grep -c x src/content/columns/y.md`,
    `git -C ~/edu-evidence checkout -b x && ls src/content/columns`,
    `python3 -c "import json,glob; json.dump([open(p).read() for p in glob.glob('src/content/strategies/*.md')], open('/tmp/fm.json','w'))"`,
    `node -e "const fs=require('fs'); fs.writeFileSync('/tmp/l.txt', fs.readdirSync('src/content/columns').join())"`,
    `grep -n x ${X} 2>&1 | head`,
  ]) {
    assert.equal(decisionOf(call(ctx, "PreToolUse", cmd)), undefined, cmd);
  }
});

test("Pre: 判定の境界(引用符の中の改行・open の空白と mode・入れ子の write_text)", () => {
  for (const cmd of [
    // sed / perl の直後の空白の連続と、フラグの直前の 1 文字は改行でもよい
    `bash -c "sed x\n-i s/a/b/ ${X}"`,
    `bash -c "sed a sed\n\n-i s/a/b/ ${X}"`,
    `bash -c "perl x\n-pi -e s/a/b/ ${X}"`,
    `python3 -c "p='${X}'; open(p , 'w').write('x')"`,
    `python3 -c "open(p, mode='a')" ${X}`,
    // 書き込みでないモードの一致が、引用符の中の次の open( を飲み込まない
    `python3 -c "open(p, 'open(q, 'w')')" ${X}`,
    `python3 -c "import os; from pathlib import Path; Path(os.path.join('src/content/columns','y.md')).write_text('x')"`,
  ]) {
    assert.equal(guard.looksLikeContentWrite(cmd), true, cmd);
  }
  for (const cmd of [
    // フラグまでの間に改行を挟む(空白の連続の後)
    `bash -c "sed x\n\ny -i ${X}"`,
    `python3 -c "open( '/tmp/x' , 'w')" ${X}`,
    `python3 -c "open(p, 'r')" ${X}`,
  ]) {
    assert.equal(guard.looksLikeContentWrite(cmd), false, cmd);
  }
});

test("Pre: 長いコマンドでも判定が線形時間で終わる", () => {
  // settings.json の `timeout: 5`(秒)を超えると kill され、ask が出ない。
  // 正規表現の量指定子が重なると、sed + 空白 40k 字で 2.8 秒(2 乗)、
  // open( + 空白 2k 字で 4.3 秒(3 乗)かかっていた。
  // 3 乗の形は 64k 字だと数十分かかり、赤にならずに固まる。先に小さい入力で落とす
  const small = `python3 -c 'open(${" ".repeat(2048)}x)' ${X}`;
  const s0 = process.hrtime.bigint();
  guard.looksLikeContentWrite(small);
  const smallMs = Number(process.hrtime.bigint() - s0) / 1e6;
  assert.ok(
    smallMs < 500,
    `open( + 空白 2k 字に ${smallMs.toFixed(0)}ms かかった`
  );

  const n = 64 * 1024;
  const starts = [
    "sed ",
    "perl ",
    "python3 -c 'open(",
    "python3 -c 'x.write_text(",
    "python3 -c '",
    "node -e 'writeFileSync(",
    "tee ",
    "echo >",
    "git -C ",
    "mv ",
    "cat <<A\n",
  ];
  const fills = [" ", "\t", "a", ".", "(", "-", "'", "a(", "-i", "\n"];
  const slow = [];
  for (const start of starts) {
    for (const fill of fills) {
      const run = fill.repeat(Math.ceil(n / fill.length));
      for (const cmd of [`${start}${run} ${X}`, `${start} ${X} ${run}`]) {
        const t0 = process.hrtime.bigint();
        guard.looksLikeContentWrite(cmd);
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        if (ms >= 500)
          slow.push(
            `${JSON.stringify(start)} × ${JSON.stringify(fill)}: ${ms.toFixed(0)}ms`
          );
      }
    }
  }
  const k = 16 * 1024;
  for (const [label, cmd] of [
    ["70k 字 + リダイレクト", `echo ${" ".repeat(70000)} > ${X}`],
    // 入れ子の受け手を 1 つずつ後ろへ辿ると 2 乗になる
    [
      "入れ子の write_text",
      `python3 -c '${"(".repeat(k)}p${").write_text()".repeat(k)}' ${X}`,
    ],
  ]) {
    const t0 = process.hrtime.bigint();
    guard.looksLikeContentWrite(cmd);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (ms >= 500) slow.push(`${label}: ${ms.toFixed(0)}ms`);
  }
  assert.deepEqual(slow, []);
});

// --- 事後照合: 書き方に依存しない本命の網 --------------------------------

/** Pre → (Bash の実行を模して) mutate → Post の順に走らせ、Post の出力を返す */
function roundTrip(
  ctx,
  mutate,
  { event = "PostToolUse", command = "true" } = {}
) {
  call(ctx, "PreToolUse", command);
  mutate();
  return parsed(call(ctx, event, command));
}

const rewrite = (ctx, rel, from, to) => {
  const p = path.join(ctx.root, rel);
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(from, to));
};

test("Post: 保護キーの変化を Claude とユーザーの両方へ出す", () => {
  const ctx = makeRepo();
  const out = roundTrip(ctx, () =>
    rewrite(ctx, X, "monthsGained: 5", "monthsGained: 9")
  );
  const context = out.hookSpecificOutput?.additionalContext ?? "";
  assert.equal(out.hookSpecificOutput?.hookEventName, "PostToolUse");
  assert.match(context, /strategies\/x\.md/);
  assert.match(context, /monthsGained/);
  assert.match(context, /5/);
  assert.match(context, /9/);
  assert.match(out.systemMessage ?? "", /monthsGained/);

  const removed = roundTrip(ctx, () =>
    rewrite(ctx, X, "sourceUrl: https://example.org/a\n", "")
  );
  assert.match(
    removed.hookSpecificOutput?.additionalContext ?? "",
    /sourceUrl:\n\s+before: https:\/\/example\.org\/a\n\s+after:  ∅/
  );
});

test("Post: 保護キー以外の変更だけなら何も出さず、控えも残さない", () => {
  const ctx = makeRepo();
  const out = roundTrip(ctx, () => rewrite(ctx, X, "title: a", "title: b"));
  assert.deepEqual(out, {});
  assert.deepEqual(fs.readdirSync(ctx.stateDir), []);
});

test("PostToolUseFailure: 失敗したコマンドの途中の書き換えも出す", () => {
  const ctx = makeRepo();
  const out = roundTrip(
    ctx,
    () =>
      rewrite(
        ctx,
        X,
        "sourceUrl: https://example.org/a",
        "sourceUrl: https://example.org/b"
      ),
    { event: "PostToolUseFailure" }
  );
  assert.equal(out.hookSpecificOutput?.hookEventName, "PostToolUseFailure");
  assert.match(out.hookSpecificOutput?.additionalContext ?? "", /sourceUrl/);
});

test("Post: worktree の中の書き換えと、既存 worktree の新規ファイルも出す", () => {
  const ctx = makeRepo();
  const wt = path.join(ctx.root, ".claude", "worktrees", "w1");
  git(ctx.root, "worktree", "add", "-q", wt, "-b", "w1");
  const out = roundTrip(ctx, () => {
    rewrite({ root: wt }, X, "monthsGained: 5", "monthsGained: 7");
    fs.writeFileSync(
      path.join(wt, "src/content/columns/new.md"),
      "---\ntitle: n\nsourceUrl: https://example.org/n\n---\n"
    );
  });
  const context = out.hookSpecificOutput?.additionalContext ?? "";
  assert.match(
    context,
    /worktrees\/w1\/src\/content\/strategies\/x\.md monthsGained/
  );
  assert.match(
    context,
    /worktrees\/w1\/src\/content\/columns\/new\.md sourceUrl/
  );
});

test("Post: Bash で作った worktree のファイルは変化に数えず、同時の本物の変化は出す", () => {
  // メインは `.claude/worktrees/*` の接頭辞でもある。前方一致で帰属を決めると、新しい
  // worktree の全ファイルがメインの新規ファイルに化け、本物の変化が切り詰めの外に落ちる
  const ctx = makeRepo();
  const out = roundTrip(ctx, () => {
    git(
      ctx.root,
      "worktree",
      "add",
      "-q",
      path.join(ctx.root, ".claude/worktrees/new"),
      "-b",
      "new"
    );
    rewrite(ctx, X, "monthsGained: 5", "monthsGained: 8");
  });
  const context = out.hookSpecificOutput?.additionalContext ?? "";
  assert.match(
    context,
    /^\[bash-frontmatter-guard\] 1 protected frontmatter value\(s\) changed in 1 file\(s\)/
  );
  assert.match(context, /^  src\/content\/strategies\/x\.md monthsGained:$/m);
  assert.doesNotMatch(context, /worktrees\/new/);
});

test("settings.json が Bash の 3 イベントにこのガードを配線している", () => {
  // 配線が消えるとガード全体が黙って無効になるが、他のどのテストも赤にならない
  const settings = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "..", "settings.json"), "utf8")
  );
  for (const event of ["PreToolUse", "PostToolUse", "PostToolUseFailure"]) {
    const wired = (settings.hooks?.[event] ?? []).some(
      (group) =>
        group.matcher === "Bash" &&
        (group.hooks ?? []).some(
          (h) =>
            h.type === "command" &&
            h.timeout === 5 &&
            h.async !== true &&
            h.command ===
              'node "$CLAUDE_PROJECT_DIR"/.claude/hooks/bash-frontmatter-guard.cjs'
        )
    );
    assert.ok(wired, event);
    // 全フックを止める設定があると、配線が残っていても何も走らない
    assert.notEqual(settings.disableAllHooks, true);
  }
});

// --- 照合できないときは無音にしない --------------------------------------

test("Post: Pre の控えが無ければ、照合できなかったことを両方へ出す", () => {
  const ctx = makeRepo();
  for (const event of ["PostToolUse", "PostToolUseFailure"]) {
    const out = parsed(call(ctx, event, "true", "toolu_never_pre"));
    assert.match(out.systemMessage ?? "", /not verified/, event);
    assert.match(
      out.hookSpecificOutput?.additionalContext ?? "",
      /not verified/,
      event
    );
  }
});

test("二重に走った Pre / Post では、どちらの Post も照合して警告しない", () => {
  // このリポの配線とユーザー環境のディスパッチャの両方が同じ Bash でこのガードを走らせる
  // 経路がある。1 本目の Post が控えを消すと、2 本目が「not verified」と誤って警告していた
  const ctx = makeRepo();
  for (const event of ["PostToolUse", "PostToolUseFailure"]) {
    call(ctx, "PreToolUse", "true");
    call(ctx, "PreToolUse", "true");
    rewrite(ctx, X, /monthsGained: \d+/, `monthsGained: ${event.length}`);
    for (const n of [1, 2]) {
      const out = parsed(call(ctx, event, "true"));
      assert.doesNotMatch(
        out.systemMessage ?? "",
        /not verified|could not verify/,
        `${event} #${n}`
      );
      assert.match(
        out.hookSpecificOutput?.additionalContext ?? "",
        /monthsGained/,
        `${event} #${n}`
      );
    }
    assert.deepEqual(fs.readdirSync(ctx.stateDir), [], event);
  }
});

test("Pre が 1 本で Post が 2 本なら、2 本目は照合できなかったことを出す", () => {
  const ctx = makeRepo();
  call(ctx, "PreToolUse", "true");
  assert.doesNotMatch(
    parsed(call(ctx, "PostToolUse", "true")).systemMessage ?? "",
    /not verified/
  );
  assert.match(
    parsed(call(ctx, "PostToolUse", "true")).systemMessage ?? "",
    /not verified/
  );
});

test("同時に走る 2 本の Post も、どちらも照合して控えと印を残さない", async () => {
  // 印を unlink で取ると、同時の 2 本がどちらも成功して同じ印を取り、控えが残る(APFS で実測)
  const ctx = makeRepo();
  const script = [
    "const [guardPath, root, stateDir, at] = process.argv.slice(1);",
    "let d = '';",
    "process.stdin.on('data', (c) => (d += c)).on('end', () => {",
    "  while (Date.now() < Number(at));",
    "  const out = require(guardPath).run(d, { root, stateDir });",
    "  process.stdout.write(out.stdout || '');",
    "});",
  ].join("\n");
  const input = JSON.stringify({
    hook_event_name: "PostToolUse",
    session_id: "sess-1",
    tool_use_id: "toolu_01",
    tool_name: "Bash",
    tool_input: { command: "true" },
  });
  const guardPath = path.join(__dirname, "..", "bash-frontmatter-guard.cjs");
  const post = (at) =>
    new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        ["-e", script, guardPath, ctx.root, ctx.stateDir, String(at)],
        { stdio: ["pipe", "pipe", "inherit"] }
      );
      let out = "";
      child.stdout.on("data", (c) => (out += c));
      child.on("close", () => resolve(out));
      child.stdin.end(input);
    });
  const problems = [];
  for (let i = 0; i < 20; i++) {
    call(ctx, "PreToolUse", "true");
    call(ctx, "PreToolUse", "true");
    const at = Date.now() + 150;
    const outs = await Promise.all([post(at), post(at)]);
    for (const out of outs)
      if (/not verified|could not verify/.test(out))
        problems.push(`${i}: ${out}`);
    const left = fs.readdirSync(ctx.stateDir);
    if (left.length) problems.push(`${i}: ${left.join(", ")}`);
    for (const name of left) fs.rmSync(path.join(ctx.stateDir, name));
  }
  assert.deepEqual(problems, []);
});

test("Pre: tool_use_id が不正な形なら控えを取らずに警告する", () => {
  const ctx = makeRepo();
  const out = parsed(call(ctx, "PreToolUse", "true", "../../etc/x"));
  assert.match(out.systemMessage ?? "", /malformed/);
  assert.equal(fs.existsSync(ctx.stateDir), false);
});

test("Pre: 状態置き場が他人に開いている・symlink なら控えを取らずに警告する", () => {
  const loose = makeRepo();
  fs.mkdirSync(loose.stateDir, { mode: 0o755 });
  fs.chmodSync(loose.stateDir, 0o755);
  assert.match(
    parsed(call(loose, "PreToolUse", "true")).systemMessage ?? "",
    /accessible by others/
  );
  assert.deepEqual(fs.readdirSync(loose.stateDir), []);

  const linked = makeRepo();
  const target = tmp("bash-fm-target-");
  fs.symlinkSync(target, linked.stateDir);
  assert.match(
    parsed(call(linked, "PreToolUse", "true")).systemMessage ?? "",
    /not a directory/
  );
  assert.deepEqual(fs.readdirSync(target), []);
});

test("Pre: 1 日より古い控えの残骸を消す(権限拒否では Post が発火しない)", () => {
  const ctx = makeRepo();
  const age = (id, ms) => {
    const at = new Date(Date.now() - ms);
    for (const name of [`sess-1-${id}.json`, `sess-1-${id}.t0`])
      fs.utimesSync(path.join(ctx.stateDir, name), at, at);
  };
  call(ctx, "PreToolUse", "true", "toolu_old");
  age("toolu_old", 25 * 60 * 60 * 1000);
  call(ctx, "PreToolUse", "true", "toolu_recent");
  age("toolu_recent", 23 * 60 * 60 * 1000);
  call(ctx, "PreToolUse", "true", "toolu_new");
  assert.deepEqual(fs.readdirSync(ctx.stateDir).sort(), [
    "sess-1-toolu_new.json",
    "sess-1-toolu_new.t0",
    "sess-1-toolu_recent.json",
    "sess-1-toolu_recent.t0",
  ]);
});

// --- 時間予算と CLI 配線 --------------------------------------------------
//
// settings.json の `timeout: 5`(秒)を超えると kill され、stdout が出ない = 素通りする。
// Pre と Post はそれぞれ全 worktree の全コンテンツを読むので、実データで測る。

test("実データの控えが 500ms に収まる", () => {
  const root = path.resolve(__dirname, "..", "..", "..");
  const started = process.hrtime.bigint();
  const { snapshot } = guard.takeSnapshot(root);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(Object.keys(snapshot.files).length >= 100);
  assert.ok(ms < 500, `控えに ${ms.toFixed(0)}ms かかった`);

  // 抽出の正規表現が二次挙動に戻ると、空白 32KB で数秒かかる(Edit 側ガードの実測)
  const t0 = process.hrtime.bigint();
  guard.captureProtectedFields(" ".repeat(32 * 1024));
  const ws = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ws < 500, `32KB の空白に ${ws.toFixed(0)}ms かかった`);
  const t1 = process.hrtime.bigint();
  guard.captureProtectedFields(`url: a${" ".repeat(32 * 1024)}b`);
  const inLine = Number(process.hrtime.bigint() - t1) / 1e6;
  assert.ok(
    inLine < 500,
    `値の中の 32KB の空白に ${inLine.toFixed(0)}ms かかった`
  );
});

const HOOK = path.join(__dirname, "..", "bash-frontmatter-guard.cjs");
const runCli = (payload) =>
  spawnSync(process.execPath, [HOOK], { input: payload, encoding: "utf8" });

test("CLI: 書き換えの形の Bash で ask を stdout に出し、壊れた入力でも 0 で終わる", () => {
  const res = runCli(
    JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: `sed -i '' 's/5/9/' ${X}` },
    })
  );
  assert.equal(res.status, 0);
  assert.equal(
    JSON.parse(res.stdout).hookSpecificOutput.permissionDecision,
    "ask"
  );
  assert.equal(runCli("{not json").status, 0);
  assert.equal(runCli("").status, 0);
});
