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
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");

/** fixture を cwd にして check スクリプトを実行する。 */
function run(script, fixture) {
  const r = spawnSync(
    "npx",
    ["tsx", path.join(REPO, "scripts", script)],
    {
      cwd: path.join(HERE, "fixtures", fixture),
      encoding: "utf8",
      env: { ...process.env, FORCE_COLOR: "0" },
      timeout: 120_000,
    },
  );
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
      `${fixture}/violating が空。検査対象 0 件でも exit 0 になる`,
    );
    const r = run(script, `${fixture}/violating`);
    assert.notEqual(
      r.status,
      0,
      `違反入力を通してしまった。ゲートが素通りしている:\n${r.output}`,
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
      `${fixture}/clean が空。誤検出していなくても意味が無い`,
    );
    const r = run(script, `${fixture}/clean`);
    assert.equal(
      r.status,
      0,
      `正常な入力を落としてしまった。誤検出している:\n${r.output}`,
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
  assert.equal(r.status, 0, `対象外ページを違反として落としている:\n${r.output}`);
  assert.match(r.output, /不変条件 A の対象外[^\n]*: 2 \/ 3/, "件数を出していない");
  assert.match(r.output, /^\s+unrated\.md$/m, "対象外ページの名前を出していない");
  assert.match(r.output, /^\s+no-evidence-block\.md$/m, "evidence 無しページの名前を出していない");
});
gate("check-reader-literacy.ts", "reader-literacy", /jargon\.md/);
gate("check-sentence-length.ts", "sentence-length", /critical:\s*1/);
gate("check-tokens.ts", "tokens", /no-palette-literal/);
gate("check-stale.ts", "stale", /stale-one\.md/);

// --- ワークフロー側の口が CI から外れていないか ---
//
// **この 2 件をここに置くのは、自己参照では捕まらないから。**
// `scripts/__tests__/workflows/` のテストは自分が CI に配線されているかを見ているが、
// checks.yml からそのステップを消すと**そもそも実行されない**ので赤くならない。
// このファイルは `test:scripts` 経由で checks.yml と check:all の両方に載っているので、
// 向こうの口が外れたことをこちらから観測できる。

const WORKFLOWS = path.resolve(REPO, ".github/workflows");
const checksYml = () => fs.readFileSync(path.join(WORKFLOWS, "checks.yml"), "utf8");

test("test:workflows の口が checks.yml に配線されている", () => {
  const b = checksYml();
  // ステップ名では探さない(改名だけで赤くなるため)。守りたいのは
  // 「この run: が !cancelled() の下にある」こと。
  assert.match(b, /^ {8}run: npm run test:workflows$/m, "checks.yml から外れている");
  assert.match(
    b,
    /^ {8}if: \$\{\{ !cancelled\(\) \}\}\n {8}run: npm run test:workflows$/m,
    "前段が落ちると走らない形になっている",
  );
});

test("checks.yml は main 向けの PR で必ず起動する", () => {
  // 不変条件「壊れたら PR の CI が赤くなる」は on: に依存しているのに、
  // そこを見ているテストが無かった。paths フィルタが付くと、
  // ワークフローだけを触った PR で検査が丸ごと skip されうる。
  const b = checksYml();
  assert.match(b, /^ {2}pull_request:\n {4}branches: \[main\]$/m, "PR トリガが変わっている");
});

test("check:all は CI が走らせる回帰テストを全部含む", () => {
  // #453 が閉じた「手元の一括検査だけが緩い」状態を、口を足すたびに開け直さないため。
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8"));
  const all = pkg.scripts["check:all"];
  // check:links:source は今回「check:all に残る唯一のリンクゲート」になったので、
  // 配線が外れたら気づけるようにここへ足す（CI 側には無いので、外れても赤くならない）。
  for (const gate of ["test:scripts", "test:workflows", "test:hooks", "check:links:source"]) {
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
    "fixture が空 — 0 件で緑になっている",
  );
  const r = run("check-source-links.ts", "source-links-unreachable");
  assert.equal(r.status, 0, `到達不能で落ちている:\n${r.output}`);
  // .invalid は名前解決に失敗する = ENOTFOUND なので、一過性ではなく DNS 側の節に出る。
  assert.match(r.output, /🔎 名前解決に失敗したリンク/, "名前解決の失敗として報告していない");
  assert.match(r.output, /ENOTFOUND/, "原因コードを出していない（cause.code を落としている）");
  assert.match(r.output, /this-host-does-not-resolve\.invalid/, "該当 URL を挙げていない");
});

test("check-source-links.ts は到達不能を 404 / 410 の件数に数えない", () => {
  // 「落ちない」だけだと、分類ごと消して全部 ok にしても通る。件数の側も見る。
  const r = run("check-source-links.ts", "source-links-unreachable");
  assert.match(r.output, /- 📡 到達できなかった \(失敗にしない\): 1$/m, "到達不能の件数が 1 でない");
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
    { stdio: ["ignore", "pipe", "ignore"] },
  );
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("404 サーバが起動しない")), 10_000);
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
      `---\ntitle: 消えた出典\nsummary: 404 を返す出典を持つ。\n---\n\n出典: <http://127.0.0.1:${port}/gone>\n`,
    );
    const r = runIn("check-source-links.ts", dir);
    assert.equal(r.status, 1, `404 で落ちていない:\n${r.output}`);
    assert.match(r.output, /- ❌ 404 \/ 410: 1$/m, "404 の件数が 1 でない");
    assert.match(r.output, /❌ 壊れているリンク/, "壊れているリンクとして報告していない");
  } finally {
    server.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** 引数つきで check スクリプトを fixture 上で実行する。 */
function runWithArgs(script, fixture, args) {
  const r = spawnSync("npx", ["tsx", path.join(REPO, "scripts", script), ...args], {
    cwd: path.join(HERE, "fixtures", fixture),
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
    timeout: 120_000,
  });
  return { status: r.status, output: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

// 内部リンク切れを per-PR で見る口はこれだけ。
//
// `check:links`（外部込み）を `check:all` から外したとき、内部リンクを見るものも一緒に
// 消えた。`check-source-links.ts` は md の外部 URL しか見ず、`check-consistency.ts` は
// 未知 slug を黙って捨て、E2E は固定 URL しか踏まない。**外した理由（外部 URL の非決定性）は
// 内部リンクには当たらない**ので、内部だけを見るモードを戻した。
//
// 外部を skip するので**ネットワークへ出ない** = 決定的（実測 3/3 で 11669 リンク・約 7 秒）。
test("check-links.ts --internal-only は死んだ内部リンクを検出して落ちる", () => {
  assert.ok(fixtureFileCount("links-internal/violating") > 0, "fixture が空 — 0 件で緑になっている");
  const r = runWithArgs("check-links.ts", "links-internal/violating", ["--internal-only"]);
  assert.equal(r.status, 1, `死んだ内部リンクで落ちていない:\n${r.output}`);
  assert.match(r.output, /does-not-exist/, "該当リンクを挙げていない");
});

test("check-links.ts --internal-only は生きている内部リンクを通す", () => {
  // 常に落ちるスクリプトも同じく壊れているので、clean 側も置く。
  assert.ok(fixtureFileCount("links-internal/clean") > 0, "fixture が空");
  const r = runWithArgs("check-links.ts", "links-internal/clean", ["--internal-only"]);
  assert.equal(r.status, 0, `正常な内部リンクで落ちている:\n${r.output}`);
  assert.match(r.output, /検査リンク: [1-9]/, "リンクを 1 本も検査していない");
  // 外部 URL が SKIPPED に入っていること。ここを見ないと --internal-only を
  // 無視する変異（skip を外す）が緑のまま通る（実測）。
  assert.match(r.output, /SKIPPED [1-9]/, "外部 URL を skip していない");
});
