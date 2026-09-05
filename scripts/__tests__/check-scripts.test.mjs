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
import { spawnSync } from "node:child_process";
import fs from "node:fs";
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
  for (const gate of ["test:scripts", "test:workflows", "test:hooks"]) {
    assert.ok(all.includes(gate), `check:all に ${gate} が無い`);
  }
});
