// zizmor.yml の、検査を黙って無効にできる設定のうち、下の 5 つを固定する(job / workflow の env での
// offline 指定などは見ていない)。どれが崩れても workflow は緑のまま検査だけが効かなくなる —
// advanced-security が true なら指摘があっても job は落ちず、config: が外れればリポに置いた設定が CI に効き、
// collect: が既定に戻れば .gitignore に書いた workflow が検査から外れ、continue-on-error や if: は job を落とさない。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const WORKFLOW = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  ".github",
  "workflows",
  "zizmor.yml"
);

// マージキー(`<<:`)は GitHub Actions が展開しないので、展開せずに読み、使っていること自体を下で落とす
const source = () => fs.readFileSync(WORKFLOW, "utf8");
const doc = () => YAML.parse(source(), { merge: false });
const job = () => doc().jobs.zizmor;

test("ステップは checkout・CI 用の設定を書く・zizmor-action の 3 つで、この順", () => {
  assert.deepEqual(
    job().steps.map((s) => s.name),
    ["Checkout", "Write the CI zizmor config", "Run zizmor"]
  );
});

test("CI 用の設定(rules: {})を書くステップは、このとおり", () => {
  assert.deepEqual(job().steps[1], {
    name: "Write the CI zizmor config",
    run: `printf 'rules: {}\\n' > "$RUNNER_TEMP/zizmor-ci.yml"\n`,
  });
});

test("zizmor-action のステップは、advanced-security: false・CI 用の config・collect: all だけを渡す", () => {
  // uses: の SHA は Dependabot が上げるので、形だけを見る
  const { uses, ...rest } = job().steps[2];
  assert.match(uses, /^zizmorcore\/zizmor-action@[0-9a-f]{40}$/);
  assert.deepEqual(rest, {
    name: "Run zizmor",
    with: {
      "advanced-security": false,
      config: "${{ runner.temp }}/zizmor-ci.yml",
      collect: "all",
    },
  });
});

test("job に continue-on-error と if: が無い", () => {
  assert.equal(Object.hasOwn(job(), "continue-on-error"), false);
  assert.equal(Object.hasOwn(job(), "if"), false);
});

// 判定は ci-summary-workflow.test.mjs の mergeKeyPaths と同じ。yaml が展開する形
// (`!!merge`・`%YAML 1.1`)と、キーをエイリアスで書いた形も拾う
const isMergeKey = (key) =>
  YAML.isScalar(key) &&
  (key.value === "<<" ||
    (typeof key.value === "symbol" && key.value.description === "<<") ||
    key.tag === "tag:yaml.org,2002:merge");

test("トリガーは pull_request・週 1 回の schedule・workflow_dispatch で、マージキーを使っていない", () => {
  assert.deepEqual(doc().on, {
    pull_request: { branches: ["main"], paths: [".github/**"] },
    schedule: [{ cron: "17 0 * * 1" }],
    workflow_dispatch: null,
  });
  const parsed = YAML.parseDocument(source(), { merge: false });
  let found = 0;
  YAML.visit(parsed, {
    Pair(_, pair) {
      const key = YAML.isAlias(pair.key) ? pair.key.resolve(parsed) : pair.key;
      if (isMergeKey(key)) found++;
    },
  });
  assert.equal(found, 0, "zizmor.yml がマージキーを使っている");
});
