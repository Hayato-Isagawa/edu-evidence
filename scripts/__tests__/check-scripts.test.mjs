// CI の品質ゲート（scripts/check-*.ts）が「壊れた入力で確実に落ちる」ことを固定する。
//
// これらは required check として毎 PR 走るが、いずれも「不一致は見つかりませんでした」
// と出れば通る。検出部がバグで何も拾わなくなっても、出力は成功と区別がつかない。
// 実際に 2026-08-08、同じ「動いているつもりで動いていない」状態が
// branch-guard.sh・vendor した block-no-verify・auto-merge ワークフローの
// 3 箇所で見つかっている。ゲート自体にも同じ危険がある。
//
// スクリプト本体には手を入れない。各スクリプトは cwd 基準で入力を読むので
// （`path.resolve("src/content/strategies")`）、cwd を fixture に向けるだけで
// 任意の入力を食わせられる。動いている required check を「テストしやすくするため」に
// リファクタすると、ゲートを壊すリスクを自分で作ることになる。
//
// clean 側のケースも必ず置く。常に落ちるスクリプトも同じく壊れているため。
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");

/** fixture を cwd にして check スクリプトを実行する。 */
function run(script, fixture) {
  const r = spawnSync("npx", ["tsx", path.join(REPO, "scripts", script)], {
    cwd: path.join(HERE, "fixtures", fixture),
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
    timeout: 120_000,
  });
  return { status: r.status, output: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/** fixture ディレクトリ配下のファイル数。空の入力で緑になるのを防ぐ。 */
function fixtureFileCount(dir) {
  return fs
    .readdirSync(path.join(HERE, "fixtures", dir), {
      recursive: true,
      withFileTypes: true,
    })
    .filter((e) => e.isFile()).length;
}

/**
 * @param script   scripts/ 配下のファイル名
 * @param fixture  fixtures/ 配下のディレクトリ名
 * @param expect   violating 側の出力に現れるべき文字列。配列なら全部が現れること
 */
function gate(script, fixture, expect) {
  const expected = Array.isArray(expect) ? expect : [expect];

  test(`${script} は ${fixture} の違反を検出して落ちる`, () => {
    // 入力が空でも「違反なし」で緑になるので、まず中身があることを確かめる。
    assert.ok(
      fixtureFileCount(`${fixture}/violating`) > 0,
      `${fixture}/violating が空。検査対象 0 件でも exit 0 になる`
    );
    const r = run(script, `${fixture}/violating`);
    assert.notEqual(
      r.status,
      0,
      `違反入力を通してしまった。ゲートが素通りしている:\n${r.output}`
    );
    // 全部を突き合わせる。1 つでも「非 0 で落ちたこと」に寄りかかると、
    // 同じ fixture 内の別の検査が落ちているだけで緑になる。
    // 行番号まで見るのは、ファイル名だけだと「錨が当たらなかった戦略」の
    // 一覧に出た名前を不一致の報告と取り違えるため。
    for (const e of expected) {
      assert.match(r.output, e, `違反箇所を出力していない: ${e}`);
    }
  });

  test(`${script} は ${fixture} の正常な入力を通す`, () => {
    assert.ok(
      fixtureFileCount(`${fixture}/clean`) > 0,
      `${fixture}/clean が空。誤検出していなくても意味が無い`
    );
    const r = run(script, `${fixture}/clean`);
    assert.equal(
      r.status,
      0,
      `正常な入力を落としてしまった。誤検出している:\n${r.output}`
    );
  });
}

// check-consistency.ts は検査の層ごとに fixture を分ける。1 つの fixture に
// 全部を入れると、層を 1 つ壊しても別の層が非 0 で落ち続けるので殺せない。
gate("check-consistency.ts", "consistency", /mismatch\.md:\d+/);
gate("check-consistency.ts", "consistency-anchor", [
  /anchor-spaced\.md:\d+/,
  /anchor-negative\.md:\d+/,
  /anchor-plain\.md:\d+/,
]);
gate("check-consistency.ts", "consistency-column", [
  /name-ref-mismatch\.md:\d+/,
  /link-ref-mismatch\.md:\d+/,
]);
gate("check-consistency.ts", "consistency-glossary", [
  /glossary\.ts:\d+/,
  /glossary\.astro:\d+/,
]);
gate("check-evidence-strength.ts", "evidence-strength", /star-mismatch\.md/);

// 不変条件 A は strength を持つ出典が無いページを判定できず飛ばす。飛ばした事実を
// 名前で出さないと、strength を外しただけでそのページは黙って保護範囲から抜ける
// (2026-09 時点で 74 ページ中 23 がこの状態)。clean 側に置くのは、対象外は
// 違反ではなく exit 0 のままであるべきだから。
// 対象外は 2 種類(evidence はあるが strength が無い / evidence ブロック自体が無い)
// で、片方だけ黙って飛ばす退行を捕まえるため両方を fixture に置く。
// 件数は clean 側のファイル数に結合しているので、fixture を足したらここも直す。
test("check-evidence-strength.ts は不変条件 A の対象外ページを件数と名前で出す", () => {
  const r = run("check-evidence-strength.ts", "evidence-strength/clean");
  assert.equal(
    r.status,
    0,
    `対象外ページを違反として落としている:\n${r.output}`
  );
  assert.match(
    r.output,
    /不変条件 A の対象外[^\n]*: 2 \/ 3/,
    "件数を出していない"
  );
  assert.match(
    r.output,
    /^\s+unrated\.md$/m,
    "対象外ページの名前を出していない"
  );
  assert.match(
    r.output,
    /^\s+no-evidence-block\.md$/m,
    "evidence 無しページの名前を出していない"
  );
});
gate("check-reader-literacy.ts", "reader-literacy", /jargon\.md/);
gate("check-sentence-length.ts", "sentence-length", /critical:\s*1/);
gate("check-tokens.ts", "tokens", [
  /no-palette-literal/,
  /src\/components\/Bad\.astro:3/,
  /src\/data\/bad\.ts:2/,
]);
gate("check-stale.ts", "stale", /stale-one\.md/);

// --- ワークフロー側の口が CI から外れていないか ---
//
// **この 2 件をここに置くのは、自己参照では捕まらないから。**
// `scripts/__tests__/workflows/` のテストは自分が CI に配線されているかを見ているが、
// checks.yml からそのステップを消すと**そもそも実行されない**ので赤くならない。
// このファイルは `test:scripts` 経由で checks.yml と check:all の両方に載っているので、
// 向こうの口が外れたことをこちらから観測できる。

const WORKFLOWS = path.resolve(REPO, ".github/workflows");
const checksYml = () =>
  fs.readFileSync(path.join(WORKFLOWS, "checks.yml"), "utf8");

test("test:workflows の口が checks.yml に配線されている", () => {
  const b = checksYml();
  // ステップ名では探さない(改名だけで赤くなるため)。守りたいのは
  // 「この run: が !cancelled() の下にある」こと。
  assert.match(
    b,
    /^ {8}run: npm run test:workflows$/m,
    "checks.yml から外れている"
  );
  assert.match(
    b,
    /^ {8}if: \$\{\{ !cancelled\(\) \}\}\n {8}run: npm run test:workflows$/m,
    "前段が落ちると走らない形になっている"
  );
  // continue-on-error が付くと赤が job に伝わらない。キーとして探す(字面だと
  // ステップに掛かるコメントで偽陽性になる)。
  const step = b
    .split(/^ {6}(?=- name: )/m)
    .find((s) => s.includes("run: npm run test:workflows"));
  assert.ok(
    step && !/^\s+continue-on-error:/m.test(step),
    "test:workflows のステップに continue-on-error が付いている"
  );
});

test("oxlint と oxfmt の口が checks.yml に配線されている", () => {
  // oxlint は warning でも exit 0、oxfmt --check は差分があれば exit 1。どちらも
  // ワークフローから外れると黙って検査が消える(ADR 0037)。
  const b = checksYml();
  for (const script of ["lint", "format:check"]) {
    assert.match(
      b,
      new RegExp(
        `^ {8}if: \\$\\{\\{ !cancelled\\(\\) \\}\\}\\n {8}run: npm run ${script.replace(":", "\\:")}$`,
        "m"
      ),
      `checks.yml に ${script} が無い、または前段が落ちると走らない形になっている`
    );
    // continue-on-error が付くと赤が job に伝わらない。
    const step = b
      .split(/^ {6}(?=- name: )/m)
      .find((s) => s.includes(`run: npm run ${script}`));
    assert.ok(
      step && !step.includes("continue-on-error"),
      `${script} のステップに continue-on-error が付いている`
    );
  }
  const pkg = JSON.parse(
    fs.readFileSync(path.join(REPO, "package.json"), "utf8")
  );
  assert.equal(
    pkg.scripts.lint,
    "oxlint --deny-warnings",
    "warning で止まらない形になっている"
  );
  assert.equal(pkg.scripts["format:check"], "oxfmt --check");
});

test("checks.yml は main 向けの PR で必ず起動する", () => {
  // 不変条件「壊れたら PR の CI が赤くなる」は on: に依存しているのに、
  // そこを見ているテストが無かった。paths フィルタが付くと、
  // ワークフローだけを触った PR で検査が丸ごと skip されうる。
  const b = checksYml();
  assert.match(
    b,
    /^ {2}pull_request:\n {4}branches: \[main\]$/m,
    "PR トリガが変わっている"
  );
});

test("check:all は CI が走らせる回帰テストを全部含む", () => {
  // #453 が閉じた「手元の一括検査だけが緩い」状態を、口を足すたびに開け直さないため。
  const pkg = JSON.parse(
    fs.readFileSync(path.join(REPO, "package.json"), "utf8")
  );
  const all = pkg.scripts["check:all"];
  // check:links:source は今回「check:all に残る唯一のリンクゲート」になったので、
  // 配線が外れたら気づけるようにここへ足す（CI 側には無いので、外れても赤くならない）。
  for (const gate of [
    "lint",
    "format:check",
    "test:gate",
    "test:scripts",
    "test:workflows",
    "test:hooks",
    "check:links:source",
  ]) {
    assert.ok(all.includes(gate), `check:all に ${gate} が無い`);
  }
});

// `check-source-links.ts` は 404 / 410 だけで落ち、到達不能では落ちない。
//
// 以前は network error も「確定した消滅」と同じ error に入れていたため、同じツリーで
// 3 回走らせると exit 1 / 0 / 1 と割れ、落ちる URL も毎回変わった（実測 2026-09-08。
// いずれも `eric.ed.gov` の `fetch failed` で、404 / 410 は 0 件）。**赤が一過性の
// ネットワーク事情で出ると、赤そのものが意味を失う。**
//
// fixture の URL は `.invalid`（RFC 2606 の予約 TLD）で、名前解決に必ず失敗する。
// ネットワークの状態に関わらず同じ結果になるので、この分類をネットワーク非依存で固定できる。
test("check-source-links.ts は到達できない URL で落ちない", () => {
  assert.ok(
    fixtureFileCount("source-links-unreachable") > 0,
    "fixture が空 — 0 件で緑になっている"
  );
  const r = run("check-source-links.ts", "source-links-unreachable");
  assert.equal(r.status, 0, `到達不能で落ちている:\n${r.output}`);
  // .invalid は名前解決に失敗する = ENOTFOUND なので、一過性ではなく DNS 側の節に出る。
  assert.match(
    r.output,
    /🔎 名前解決に失敗したリンク/,
    "名前解決の失敗として報告していない"
  );
  assert.match(
    r.output,
    /ENOTFOUND/,
    "原因コードを出していない（cause.code を落としている）"
  );
  assert.match(
    r.output,
    /this-host-does-not-resolve\.invalid/,
    "該当 URL を挙げていない"
  );
});

test("check-source-links.ts は到達不能を 404 / 410 の件数に数えない", () => {
  // 「落ちない」だけだと、分類ごと消して全部 ok にしても通る。件数の側も見る。
  const r = run("check-source-links.ts", "source-links-unreachable");
  assert.match(
    r.output,
    /- 📡 到達できなかった \(失敗にしない\): 1$/m,
    "到達不能の件数が 1 でない"
  );
  assert.match(r.output, /- ❌ 404 \/ 410: 0$/m, "404 / 410 の件数が 0 でない");
});

/** 任意のディレクトリを cwd にして check スクリプトを実行する（一時 fixture 用）。 */
function runIn(script, cwd) {
  const r = spawnSync("npx", ["tsx", path.join(REPO, "scripts", script)], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
    timeout: 120_000,
  });
  return { status: r.status, output: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

// 404 / 410 は今も落とす。**これを固定しないと、緩めた側だけを守ることになる** —
// 実際、上の 2 本だけでは `categorize` の 404 / 410 を `unreachable` に変える変異が
// 緑のまま通った（実測）。
//
// 外部の 404 URL に頼るとネットワーク次第で結果が変わるので、ローカルに 404 を返す
// サーバを立ててその URL を食わせる。外へは 1 度も出ない。
// **サーバは別プロセスに置く** — `spawnSync` は親のイベントループを止めるので、
// 同じプロセスで listen すると接続を受け付けられずタイムアウトする（実測 32 秒で abort）。
test("check-source-links.ts は 404 を検出して落ちる", async () => {
  const server = spawn(
    process.execPath,
    [
      "-e",
      "const h=require('node:http');const s=h.createServer((q,r)=>{r.writeHead(404);r.end('gone')});" +
        "s.listen(0,'127.0.0.1',()=>console.log(s.address().port));",
    ],
    { stdio: ["ignore", "pipe", "ignore"] }
  );
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("404 サーバが起動しない")),
      10_000
    );
    server.stdout.once("data", (b) => {
      clearTimeout(timer);
      resolve(Number(String(b).trim()));
    });
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "source-links-404-"));
  try {
    const md = path.join(dir, "src", "content", "strategies");
    fs.mkdirSync(md, { recursive: true });
    fs.writeFileSync(
      path.join(md, "dead-source.md"),
      `---\ntitle: 消えた出典\nsummary: 404 を返す出典を持つ。\n---\n\n出典: <http://127.0.0.1:${port}/gone>\n`
    );
    const r = runIn("check-source-links.ts", dir);
    assert.equal(r.status, 1, `404 で落ちていない:\n${r.output}`);
    assert.match(r.output, /- ❌ 404 \/ 410: 1$/m, "404 の件数が 1 でない");
    assert.match(
      r.output,
      /❌ 壊れているリンク/,
      "壊れているリンクとして報告していない"
    );
  } finally {
    server.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** 引数つきで check スクリプトを fixture 上で実行する。 */
function runWithArgs(script, fixture, args) {
  const r = spawnSync(
    "npx",
    ["tsx", path.join(REPO, "scripts", script), ...args],
    {
      cwd: path.join(HERE, "fixtures", fixture),
      encoding: "utf8",
      env: { ...process.env, FORCE_COLOR: "0" },
      timeout: 120_000,
    }
  );
  return { status: r.status, output: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

// `check-source-sync.ts` は `evidence.eef.archivedAt` を持つ出典を同期対象から外す(#618)。
// 出典側で値が固定された(strand 廃止で Wayback に固定した)ものは同期しようがなく、
// 30 日ごとに stale として列挙され続けていた。外したものは黙って消さず「凍結」として
// 列挙する — 対象から外す判定が広がっても、レポートを読めば気づけるようにするため。
test("check-source-sync.ts は archivedAt を持つ出典を対象数から外し、frozen に載せる", () => {
  assert.ok(
    fixtureFileCount("source-sync-frozen") > 0,
    "fixture が空 — 0 件で緑になっている"
  );
  const r = runWithArgs("check-source-sync.ts", "source-sync-frozen", [
    "--section",
    "eef",
    "--json",
  ]);
  const eef = JSON.parse(r.output).sections.eef;
  assert.deepEqual(
    eef.frozen.map((e) => e.file),
    ["frozen.md"]
  );
  assert.deepEqual(
    eef.stale.map((e) => e.file),
    ["stale.md"]
  );
  assert.equal(eef.totalTargets, 1);
  // exit code は stale の合計のまま(凍結は数えない)
  assert.equal(r.status, 1);
});

test("check-source-sync.ts は凍結した出典を text 出力に列挙する(黙って消さない)", () => {
  assert.ok(
    fixtureFileCount("source-sync-frozen") > 0,
    "fixture が空 — 0 件で緑になっている"
  );
  const r = runWithArgs("check-source-sync.ts", "source-sync-frozen", [
    "--section",
    "eef",
  ]);
  assert.match(r.output, /^凍結\(対象外\): 1 件$/m);
  assert.match(
    r.output,
    /^- `strategies\/frozen\.md` — archivedAt 2020-01-01$/m
  );
  // stale 側の見出しは凍結を数えない(計 1 件 = stale.md だけ)
  assert.match(r.output, /^## §1 EEF \(30 日超過: 1 件 \/ 計 1 件\)$/m);
});

// 凍結を読むのは eef だけ(#620。理由は `check-source-sync.ts` の `archivedAtOf` 直前)。
// 他の § でも読むと、schema に無い凍結が報告に出て対象数が静かに減る。
test("check-source-sync.ts は evidence.hattie.archivedAt を凍結として読まない", () => {
  assert.ok(
    fixtureFileCount("source-sync-frozen") > 0,
    "fixture が空 — 0 件で緑になっている"
  );
  const r = runWithArgs("check-source-sync.ts", "source-sync-frozen", [
    "--section",
    "hattie",
    "--json",
  ]);
  const hattie = JSON.parse(r.output).sections.hattie;
  assert.deepEqual(hattie.frozen, []);
  assert.deepEqual(
    hattie.stale.map((e) => e.file),
    ["hattie-archived.md"]
  );
  assert.equal(hattie.totalTargets, 1);
});

// hattie 側だけ固定すると「hattie だけ読まない(japan は読む)」への書き換えが緑のまま通る(#626)
test("check-source-sync.ts は evidence.japan.archivedAt を凍結として読まない", () => {
  assert.ok(
    fixtureFileCount("source-sync-frozen") > 0,
    "fixture が空 — 0 件で緑になっている"
  );
  const r = runWithArgs("check-source-sync.ts", "source-sync-frozen", [
    "--section",
    "japan",
    "--json",
  ]);
  const japan = JSON.parse(r.output).sections.japan;
  assert.deepEqual(japan.frozen, []);
  assert.deepEqual(
    japan.stale.map((e) => e.file),
    ["japan-archived.md"]
  );
  assert.equal(japan.totalTargets, 1);
});

// 内部リンク切れを per-PR で見る口はこれだけ。
//
// `check:links`（外部込み）を `check:all` から外したとき、内部リンクを見るものも一緒に
// 消えた。`check-source-links.ts` は md の外部 URL しか見ず、`check-consistency.ts` は
// 未知 slug を黙って捨て、E2E は固定 URL しか踏まない。**外した理由（外部 URL の非決定性）は
// 内部リンクには当たらない**ので、内部だけを見るモードを戻した。
//
// 外部を skip するので**ネットワークへ出ない** = 決定的（実測 3/3 で 11669 リンク・約 7 秒）。
test("check-links.ts --internal-only は死んだ内部リンクを検出して落ちる", () => {
  assert.ok(
    fixtureFileCount("links-internal/violating") > 0,
    "fixture が空 — 0 件で緑になっている"
  );
  const r = runWithArgs("check-links.ts", "links-internal/violating", [
    "--internal-only",
  ]);
  assert.equal(r.status, 1, `死んだ内部リンクで落ちていない:\n${r.output}`);
  assert.match(r.output, /does-not-exist/, "該当リンクを挙げていない");
});

test("check-links.ts --internal-only は生きている内部リンクを通す", () => {
  // 常に落ちるスクリプトも同じく壊れているので、clean 側も置く。
  assert.ok(fixtureFileCount("links-internal/clean") > 0, "fixture が空");
  const r = runWithArgs("check-links.ts", "links-internal/clean", [
    "--internal-only",
  ]);
  assert.equal(r.status, 0, `正常な内部リンクで落ちている:\n${r.output}`);
  assert.match(r.output, /検査リンク: [1-9]/, "リンクを 1 本も検査していない");
  // 外部 URL が SKIPPED に入っていること。ここを見ないと --internal-only を
  // 無視する変異（skip を外す）が緑のまま通る（実測）。
  assert.match(r.output, /SKIPPED [1-9]/, "外部 URL を skip していない");
});

// ---------------------------------------------------------------------------
// check-source-links.ts の Wayback 補助判定
//
// 既知ボット対策ドメインは生存ページにも撤退ページにも 403 を返すので、本体の判定では
// 区別できない。Wayback CDX から「403 以外の最新の記録」を引き、404 / 410 なら落とす。
// CDX は日によって 2/9〜7/10 しか答えない(2026-09-13 実測)ので fail-open にしてある —
// **緩めた側だけを固定すると、誰かが fail-closed に倒したときも、逆に判定ごと外した
// ときも気づけない**ので、落ちる側・落ちない側・切る側・キャッシュの 4 面を全部置く。
//
// stub は 1 プロセスで 2 役: `/cdx` は CDX、それ以外は 403 を返す「既知ボット対策ドメイン」。
// `LINK_CHECK_KNOWN_HOSTS_EXTRA=127.0.0.1` で stub を known 扱いにする(実ホスト名を
// ローカルへ向ける手段が Node 標準に無い)。受けたリクエストはログファイルに 1 行ずつ書く —
// `spawnSync` が親のループを止めるので stdout 経由の集計は使えない。
// ---------------------------------------------------------------------------

const CDX_STUB_SOURCE = `
const fs=require('node:fs');const h=require('node:http');const log=process.argv[1];
const rows=(ts,st)=>JSON.stringify([["timestamp","statuscode"],[ts,st]]);
const s=h.createServer((q,r)=>{
  fs.appendFileSync(log,q.method+' '+q.url+'\\n');
  const u=new URL(q.url,'http://127.0.0.1');
  if(u.pathname==='/cdx'){
    const target=new URL(u.searchParams.get('url')).pathname;
    if(target==='/gone'){r.writeHead(200,{'content-type':'application/json'});return r.end(rows('20260518015827','404'));}
    if(target==='/alive'){r.writeHead(200,{'content-type':'application/json'});return r.end(rows('20260910210436','200'));}
    if(target==='/none'){r.writeHead(200,{'content-type':'application/json'});return r.end('[]');}
    if(target==='/html'){r.writeHead(200,{'content-type':'text/html'});return r.end('<html>Temporarily Offline</html>');}
    r.writeHead(503);return r.end('offline');
  }
  r.writeHead(403);r.end('forbidden');
});
s.listen(0,'127.0.0.1',()=>console.log(s.address().port));
`;

async function startCdxStub() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "source-links-cdx-"));
  const logPath = path.join(dir, "requests.log");
  const server = spawn(process.execPath, ["-e", CDX_STUB_SOURCE, logPath], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("CDX stub が起動しない")),
      10_000
    );
    server.stdout.once("data", (b) => {
      clearTimeout(timer);
      resolve(Number(String(b).trim()));
    });
  });
  const md = path.join(dir, "src", "content", "strategies");
  fs.mkdirSync(md, { recursive: true });
  return {
    dir,
    port,
    logPath,
    md,
    cdxRequests: () =>
      fs.existsSync(logPath)
        ? fs
            .readFileSync(logPath, "utf8")
            .split("\n")
            .filter((l) => l.includes(" /cdx?")).length
        : 0,
    env: (extra = {}) => ({
      LINK_CHECK_CDX_ENDPOINT: `http://127.0.0.1:${port}/cdx`,
      LINK_CHECK_KNOWN_HOSTS_EXTRA: "127.0.0.1",
      LINK_CHECK_CDX_CACHE: path.join(dir, "cache.json"),
      ...extra,
    }),
    close: () => {
      server.kill();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** 任意の cwd と環境変数で check スクリプトを実行する。 */
function runInWithEnv(script, cwd, env) {
  const r = spawnSync("npx", ["tsx", path.join(REPO, "scripts", script)], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0", ...env },
    timeout: 120_000,
  });
  return { status: r.status, output: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function writeSource(md, name, urls) {
  const body = urls.map((u) => `出典: <${u}>`).join("\n");
  fs.writeFileSync(
    path.join(md, `${name}.md`),
    `---\ntitle: ${name}\nsummary: 403 を返す既知ドメインの出典。\n---\n\n${body}\n`
  );
}

test("check-source-links.ts は Wayback に撤退の記録がある既知ドメインのリンクで落ちる", async () => {
  const stub = await startCdxStub();
  try {
    const base = `http://127.0.0.1:${stub.port}`;
    writeSource(stub.md, "gone-source", [`${base}/gone`, `${base}/alive`]);
    const r = runInWithEnv("check-source-links.ts", stub.dir, stub.env());
    assert.equal(r.status, 1, `撤退の記録で落ちていない:\n${r.output}`);
    assert.match(
      r.output,
      /Wayback に撤退の記録がある既知ボット対策ドメインのリンク/,
      "見出しが出ていない"
    );
    // 行単位で列挙し、記録の時刻を添える(サマリに埋めない)
    assert.match(
      r.output,
      /- src\/content\/strategies\/gone-source\.md:\d+ — http:\/\/127\.0\.0\.1:\d+\/gone → HTTP 403\(Wayback 20260518015827 に HTTP 404\)/,
      "撤退 URL を行単位で挙げていない"
    );
    assert.match(r.output, /- ❌ Wayback に撤退の記録あり: 1$/m);
    // 生存側は known サマリに残る(撤退側は二重計上しない)
    assert.match(r.output, /- ℹ️ 既知ボット対策ドメイン: 1$/m);
    assert.match(
      r.output,
      /- 127\.0\.0\.1: 1 件\(Wayback 生存 1 \/ 記録なし 0 \/ 照会できず 0\)/
    );
    // 本体の 404 / 410 は 0 のまま(403 の分類は変えていない)
    assert.match(r.output, /- ❌ 404 \/ 410: 0$/m);
  } finally {
    stub.close();
  }
});

test("check-source-links.ts は Wayback が生存 / 記録なしの既知ドメインを通す", async () => {
  // 常に落ちるスクリプトも同じく壊れているので、clean 側も置く。
  const stub = await startCdxStub();
  try {
    const base = `http://127.0.0.1:${stub.port}`;
    writeSource(stub.md, "alive-source", [`${base}/alive`, `${base}/none`]);
    const r = runInWithEnv("check-source-links.ts", stub.dir, stub.env());
    assert.equal(r.status, 0, `生存 / 記録なしで落ちている:\n${r.output}`);
    assert.match(r.output, /- ❌ Wayback に撤退の記録あり: 0$/m);
    assert.match(
      r.output,
      /- 127\.0\.0\.1: 2 件\(Wayback 生存 1 \/ 記録なし 1 \/ 照会できず 0\)/
    );
    assert.equal(stub.cdxRequests(), 2, "URL ごとに 1 回ずつ照会していない");
  } finally {
    stub.close();
  }
});

test("check-source-links.ts は Wayback が答えなくても落ちない(fail-open)", async () => {
  // 503 と「200 だが HTML」の 2 経路。後者は JSON.parse の例外が main().catch へ抜けると
  // exit 2 = fail-closed に化けるので、503 だけでは変異を捕まえられない。
  const stub = await startCdxStub();
  try {
    const base = `http://127.0.0.1:${stub.port}`;
    writeSource(stub.md, "flaky-source", [`${base}/flaky`, `${base}/html`]);
    const r = runInWithEnv("check-source-links.ts", stub.dir, stub.env());
    assert.equal(r.status, 0, `照会できないだけで落ちている:\n${r.output}`);
    assert.match(
      r.output,
      /Wayback に照会できなかった URL/,
      "照会できなかったことを明示していない"
    );
    assert.match(
      r.output,
      /- 🔎 Wayback に照会できなかった \(失敗にしない\): 2$/m
    );
    assert.match(
      r.output,
      /- 127\.0\.0\.1: 2 件\(Wayback 生存 0 \/ 記録なし 0 \/ 照会できず 2\)/
    );
    // 503 は 1 回リトライする(2 URL × 2 回 = 4 リクエスト)
    assert.equal(
      stub.cdxRequests(),
      4,
      "unavailable を 1 回リトライしていない"
    );
    // 答えなかった結果はキャッシュに残さない(次回に再照会する)
    assert.ok(
      !fs.existsSync(path.join(stub.dir, "cache.json")),
      "unavailable をキャッシュに書いている"
    );
  } finally {
    stub.close();
  }
});

test("check-source-links.ts は LINK_CHECK_CDX=0 で Wayback に一切アクセスしない", async () => {
  // 偽陽性の逃がし(docs/CONTENT_GUIDELINES.md §7)。切ったつもりで照会が走ると、
  // その回の逃がしにならないうえ IA に負荷をかける。
  const stub = await startCdxStub();
  try {
    const base = `http://127.0.0.1:${stub.port}`;
    writeSource(stub.md, "gone-source", [`${base}/gone`]);
    const r = runInWithEnv(
      "check-source-links.ts",
      stub.dir,
      stub.env({ LINK_CHECK_CDX: "0" })
    );
    assert.equal(r.status, 0, `無効化したのに落ちている:\n${r.output}`);
    assert.equal(stub.cdxRequests(), 0, "無効化しても CDX を叩いている");
    assert.match(r.output, /- ❌ Wayback に撤退の記録あり: 0$/m);
    assert.match(
      r.output,
      /- 🔎 Wayback に照会できなかった \(失敗にしない\): 0$/m
    );
    // 内訳を付けない(照会していないのに「記録なし」と読まれないため)
    assert.match(
      r.output,
      /- 127\.0\.0\.1: 1 件$/m,
      "照会していないのに内訳を出している"
    );
  } finally {
    stub.close();
  }
});

test("check-source-links.ts は Wayback の答えをキャッシュし、次回は照会せずに同じ判定をする", async () => {
  // CDX は 1 件 7〜28 秒かかるので、答えた結果は 30 日保持する。
  // 2 回目はエンドポイントを閉じたポートに向ける — キャッシュを読まない変異は
  // 「照会できず」に落ちて exit 0 になるので、ここで赤になる。
  const stub = await startCdxStub();
  try {
    const base = `http://127.0.0.1:${stub.port}`;
    writeSource(stub.md, "gone-source", [`${base}/gone`]);
    const first = runInWithEnv("check-source-links.ts", stub.dir, stub.env());
    assert.equal(first.status, 1, `1 回目が落ちていない:\n${first.output}`);
    const cachePath = path.join(stub.dir, "cache.json");
    const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    assert.equal(
      cache[`${base}/gone`]?.answer?.kind,
      "gone",
      "撤退の記録がキャッシュに無い"
    );
    assert.equal(stub.cdxRequests(), 1);

    const second = runInWithEnv(
      "check-source-links.ts",
      stub.dir,
      stub.env({ LINK_CHECK_CDX_ENDPOINT: "http://127.0.0.1:9/cdx" })
    );
    assert.equal(
      second.status,
      1,
      `2 回目がキャッシュで落ちていない:\n${second.output}`
    );
    assert.match(second.output, /- ❌ Wayback に撤退の記録あり: 1$/m);
    assert.equal(stub.cdxRequests(), 1, "2 回目も照会している");
  } finally {
    stub.close();
  }
});

test("check-source-links.ts は Wayback が連続して答えないと残りの照会を打ち切る", async () => {
  // 全断のまま回すと 1 URL あたり最大 2 × タイムアウトを待ち、70 URL で 1 時間近く止まる。
  // 連続 5 件で打ち切り、残りは照会せず「照会できず」に数える(次回に再照会する)。
  const stub = await startCdxStub();
  try {
    const base = `http://127.0.0.1:${stub.port}`;
    // 並列 3 なので、境界の前後で件数が揺れないよう十分に多く置く
    writeSource(
      stub.md,
      "outage-source",
      Array.from({ length: 12 }, (_, i) => `${base}/flaky${i}`)
    );
    const r = runInWithEnv("check-source-links.ts", stub.dir, stub.env());
    assert.equal(r.status, 0, `打ち切りで落ちている:\n${r.output}`);
    assert.match(
      r.output,
      /- 🔎 Wayback に照会できなかった \(失敗にしない\): 12$/m
    );
    // 打ち切らなければ 12 × 2(リトライ)= 24 リクエスト。並列 3 で連続 5 件を数えるので、
    // 打ち切り後に既に走っていた分を含めても 24 には届かない
    const n = stub.cdxRequests();
    assert.ok(n < 24, `打ち切っていない(CDX リクエスト ${n} 件)`);
    assert.ok(
      n >= 10,
      `連続 5 件に達する前に打ち切っている(CDX リクエスト ${n} 件)`
    );
  } finally {
    stub.close();
  }
});

// ---------------------------------------------------------------------------
// もう一方の口(`test:workflows`)の npm script と下限を固定する。自分自身を縛ると、
// ファイルごと消えたときに縛りも一緒に消える。逆向き(`test:scripts` / `test:hooks` / `test:gate`)は
// `scripts/__tests__/workflows/vrt-targets.test.mjs` にある。edu-law の同型を移植。
//
// **塞げるのは「片方だけを静かに薄める」まで**(限界は CLAUDE.md「下限の決め方」)。
// ---------------------------------------------------------------------------

const WORKFLOW_TEST_FILES = [
  "ci-summary-workflow.test.mjs",
  "link-check-workflow.test.mjs",
  "vrt-baseline.test.mjs",
  "vrt-targets.test.mjs",
];

/** `test:workflows` の口で走るべきテストの総数。**守る対象から導出しない**(下記) */
const WORKFLOW_TESTS = 100;

test("test:workflows の口にあるテストファイルが 4 本である", () => {
  // ファイルを足すと下限に静かな余裕が生まれる(edu-law の実測: ダミーを 3 本足しても
  // 下限つきの口は緑のまま通った)。消したときは下の完全一致も ENOENT で落ちるが、
  // **足したときに落ちるのはここだけ**。
  const files = fs
    .readdirSync(path.join(REPO, "scripts/__tests__/workflows"), {
      withFileTypes: true,
    })
    .filter((e) => e.isFile() && e.name.endsWith(".test.mjs"))
    .map((e) => e.name)
    .sort();
  assert.deepEqual(files, WORKFLOW_TEST_FILES);
});

test("npm script test:workflows が、実測ちょうどの下限で 2 段を通す", () => {
  // **完全一致で縛る。** `match` だと ` || true` を後ろに足すだけで恒久 no-op に
  // でき、下限も 1 まで静かに下げられる(`assert-test-results.mjs` は 1 以上しか
  // 要求しない)。
  //
  // **下限を守る対象から導出しない。** ファイルの `test(` を数えて突き合わせる形だと、
  // 中身を消せば数も一緒に下がるので、`中身を空にする + 下限を巻き戻す` の 2 手が
  // 素通りする(edu-law の実測)。**塞いでいるのは、この定数がここに直接書いてあること**。
  // 静的数との照合は「テストを足したのに定数を上げていない」を赤にするためにある。
  // テストを足したら npm script とこの定数の両方を直す。
  const measured = WORKFLOW_TEST_FILES.map((name) =>
    fs.readFileSync(
      path.join(REPO, "scripts/__tests__/workflows", name),
      "utf8"
    )
  ).reduce((sum, text) => sum + (text.match(/^test\(/gm) ?? []).length, 0);
  assert.equal(measured, WORKFLOW_TESTS, "実測と定数がずれている");
  const pkg = JSON.parse(
    fs.readFileSync(path.join(REPO, "package.json"), "utf8")
  );
  assert.equal(
    pkg.scripts["test:workflows"],
    'node scripts/assert-test-files.mjs "scripts/__tests__/workflows/*.test.mjs" && ' +
      `node scripts/assert-test-results.mjs ${WORKFLOW_TESTS} "scripts/__tests__/workflows/*.test.mjs"`
  );
});

/**
 * 行頭以外の `test(` 呼び出し(トリム済みの行)。`vrt-targets.test.mjs` の同名関数の複製 —
 * 共有ヘルパにすると 1 編集で両口を同時に無力化できるので、相互固定の対称性のまま
 * 各口に置く。除外と限界も同じ(コメント行と正規表現リテラル直後の `.test(` だけ除外、
 * 引用符内も区別しない、パターンは正規表現リテラルで書く)。
 */
function nonTopLevelTestCalls(text) {
  return (
    text
      // oxfmt は 80 桁を超える取り込み文を複数行に折る(`import {\n  it,\n} from` /
      // `} =\n  require(`)ので、宣言を 1 行に戻してから見る。引用符・`;` は越えない。
      // 起点は行頭の `import` に限る — コメント中の語 `import` から本物の `from` までを
      // 潰すと、取り込み行がコメント行に吸われて除外され、既定形でない取り込みが見えなくなる(実測)
      .replace(/^[ \t\uFEFF]*import\b[^;'"`]*?\bfrom\b/gm, (m) =>
        m.replace(/\s+/g, " ")
      )
      .replace(/\{[^}]*\}\s*=\s*(await\s+import|require)\s*\(/g, (m) =>
        m.replace(/\s+/g, " ")
      )
      .split("\n")
      // 除くのは行コメント・`*` で続くブロックコメント・同じ行で閉じないブロックコメントの
      // 開始行・空行。同じ行で閉じる `/* c */ test(` や `*/ test(` は除かない(素通りした実測あり)。
      .filter((line) => !/^\s*(\/\/|\*(?!\/)|\/\*(?!.*\*\/)|$)/.test(line))
      .filter((line) => {
        // インデントを見る前にトリムすると、ブロック内の `test(` が行頭に化ける
        const rest = line.replace(/^test\(/, "");
        return (
          /(?<![\w`.])test\(/.test(rest) ||
          /(?<!\/[a-z]*)\.test\(/.test(rest) ||
          /\btest\.(only|it|describe|call|apply|bind)\(/.test(rest) ||
          /(?<![\w`.])test\)\(/.test(rest) ||
          /(?<![\w`.])test\?\.\(/.test(rest) ||
          // `node:test` を取り込む宣言行は、既定の 2 形と完全一致しなければ赤(`import` /
          // `const` 等で始まらない fixture 文字列の行は見ない)
          (/node:test/.test(line) &&
            /^\s*(import|const|let|var)\b/.test(line) &&
            !/^import test from "node:test";$/.test(line) &&
            !/^const test = require\("node:test"\);$/.test(line))
        );
      })
      .map((line) => line.trim())
  );
}

test("test:workflows の口で、テストの登録は行頭にしか書かれていない", () => {
  // 静的数と定数の照合(上)は行頭の `test(` しか見ない。行頭以外(ブロック・ループ・
  // `t.test(` の subtest・`test.only(`)に書けば実行数だけが増え、以後その 1 本ぶんの
  // 削除が無音になる(#592 で実測)。テスト名・メッセージに `test(` の字面を書くと、この
  // 検査自身が相手の口で赤になる。
  for (const name of WORKFLOW_TEST_FILES) {
    const text = fs.readFileSync(
      path.join(REPO, "scripts/__tests__/workflows", name),
      "utf8"
    );
    assert.deepEqual(
      nonTopLevelTestCalls(text),
      [],
      `${name} に行頭以外のテスト登録か、既定形でない node:test の取り込みがある`
    );
  }
});
