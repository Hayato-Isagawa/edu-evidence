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

/**
 * @param script   scripts/ 配下のファイル名
 * @param fixture  fixtures/ 配下のディレクトリ名
 * @param expect   violating 側の出力に現れるべき文字列
 */
function gate(script, fixture, expect) {
  test(`${script} は違反を検出して落ちる`, () => {
    const r = run(script, `${fixture}/violating`);
    assert.notEqual(
      r.status,
      0,
      `違反入力を通してしまった。ゲートが素通りしている:\n${r.output}`,
    );
    assert.match(r.output, expect, "違反箇所を出力していない");
  });

  test(`${script} は正常な入力を通す`, () => {
    const r = run(script, `${fixture}/clean`);
    assert.equal(
      r.status,
      0,
      `正常な入力を落としてしまった。誤検出している:\n${r.output}`,
    );
  });
}

gate("check-consistency.ts", "consistency", /mismatch\.md/);
gate("check-evidence-strength.ts", "evidence-strength", /star-mismatch\.md/);
gate("check-reader-literacy.ts", "reader-literacy", /jargon\.md/);
gate("check-sentence-length.ts", "sentence-length", /critical:\s*1/);
gate("check-tokens.ts", "tokens", /no-palette-literal/);
gate("check-stale.ts", "stale", /stale-one\.md/);
