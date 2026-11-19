// zizmor.yml の、検査を黙って無効にできる設定を固定する。どれが崩れても workflow は緑のまま検査だけが効かなく
// なる — advanced-security が true なら指摘があっても job は落ちず、config: が外れればリポに置いた設定が CI に効き、
// collect: が既定に戻れば .gitignore に書いた workflow が検査から外れ、env の ZIZMOR_OFFLINE は online の audit を
// 飛ばし、continue-on-error や if: は job を落とさない。「workflow 全体が決まった形」のテストで全体を固定する。
// uses: は形(SHA で pin した同じ action)だけを見て SHA の中身は見ないので、同じ action の古い SHA や fork にある
// 別の SHA への差し替えは通る。行区切りに使われうる単独の CR・U+0085・U+2028・U+2029・yaml の警告・タグ・
// ディレクティブのように yaml と GitHub で読みが食い違いうる書き方は、全体の固定を素通りするので、ファイルに置くこと
// 自体を落とす(../helpers/workflow-yaml.mjs の ambiguousYaml)。その判定の fixture と、`.github/workflows/` の
// 全部の workflow に判定を当てるテストも、このファイルの末尾に置く。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { ambiguousYaml, mergeKeyPaths } from "../helpers/workflow-yaml.mjs";

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

test("workflow 全体が決まった形(env・continue-on-error・if・defaults も checkout の中身も足せない)", () => {
  assert.deepEqual(ambiguousYaml(source()), []);
  // uses: は SHA で pin した同じ action であることだけを見て、比べる前に名前に置き換える(Dependabot が上げるため)
  const wf = doc();
  for (const step of wf?.jobs?.zizmor?.steps ?? []) {
    if (typeof step?.uses !== "string") continue;
    const m =
      /^(actions\/checkout|zizmorcore\/zizmor-action)@[0-9a-f]{40}$/.exec(
        step.uses
      );
    if (m) step.uses = `<${m[1]}>`;
  }
  assert.deepEqual(wf, {
    name: "zizmor",
    on: {
      pull_request: { branches: ["main"], paths: [".github/**"] },
      schedule: [{ cron: "17 0 * * 1" }],
      workflow_dispatch: null,
    },
    concurrency: {
      group: "zizmor-${{ github.ref }}",
      "cancel-in-progress": true,
    },
    permissions: { contents: "read" },
    jobs: {
      zizmor: {
        name: "zizmor",
        "runs-on": "ubuntu-latest",
        "timeout-minutes": 10,
        steps: [
          {
            name: "Checkout",
            uses: "<actions/checkout>",
            with: { "persist-credentials": false },
          },
          {
            name: "Write the CI zizmor config",
            run: `printf 'rules: {}\\n' > "$RUNNER_TEMP/zizmor-ci.yml"\n`,
          },
          {
            name: "Run zizmor",
            uses: "<zizmorcore/zizmor-action>",
            with: {
              "advanced-security": false,
              config: "${{ runner.temp }}/zizmor-ci.yml",
              collect: "all",
            },
          },
        ],
      },
    },
  });
});

test("トリガーは pull_request・週 1 回の schedule・workflow_dispatch で、マージキーを使っていない", () => {
  assert.deepEqual(doc().on, {
    pull_request: { branches: ["main"], paths: [".github/**"] },
    schedule: [{ cron: "17 0 * * 1" }],
    workflow_dispatch: null,
  });
  // yaml が展開する形(`!!merge`・`%YAML 1.1`)と、キーをエイリアスで書いた形も拾う
  assert.deepEqual(
    mergeKeyPaths(source()),
    [],
    "zizmor.yml がマージキーを使っている"
  );
});

test("全部の workflow に、手元の yaml と GitHub で読みが食い違いうる書き方を置かない", () => {
  // テストが読む workflow だけに当てると、判定を当てない workflow が残る(checks・audit・e2e・stale-check は
  // 別のテストが字面やパース結果で読むのに、判定を当てていなかった)。判定と理由は ambiguousYaml
  const dir = path.dirname(WORKFLOW);
  const files = fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
  assert.ok(files.length > 0, ".github/workflows に workflow が無い");
  for (const f of files)
    assert.deepEqual(
      ambiguousYaml(fs.readFileSync(path.join(dir, f), "utf8")),
      [],
      f
    );
});

test("fixture: ambiguousYaml は区切り文字・制御文字・yaml のエラーと警告・タグ・ディレクティブ・コレクション・エイリアス・文字列でないものをキーにした形・キーの重複を拾い、ふつうの書き方は拾わない", () => {
  // 実ファイルでは「何も無い」ことしか見えず、判定が no-op に落ちても緑のまま通るので、書き方ごとに発火を見る
  const base = "name: x\non:\n  push:\n    branches: [main]\n";
  assert.deepEqual(ambiguousYaml(base), [], "ふつうの書き方");
  assert.deepEqual(
    ambiguousYaml(base.replace(/\n/g, "\r\n")),
    [],
    "ファイル全体の CRLF"
  );
  assert.deepEqual(
    ambiguousYaml(`a: "q"\nb: 'r'\nc: {d: [1, 2]}\ne: &x 1\nf: *x\n`),
    [],
    "引用符・フロー形・アンカー"
  );
  assert.deepEqual(
    ambiguousYaml('a: "x\ty"\nb: |\n  c\td\n'),
    [],
    "値の中のタブ"
  );
  for (const [label, src] of [
    ["単独の CR", "# c\rname: x\n"],
    ["U+0085", "# c\u0085name: x\n"],
    ["U+2028", "# c\u2028name: x\n"],
    ["U+2029", "# c\u2029name: x\n"],
    ["未知のディレクティブ", "%FOO bar\n---\nname: x\n"],
    ["キーの重複", "name: x\nname: y\n"],
    ["yaml のエラー", "a: b: c\n"],
    ["スカラーの未知のタグ", "name: !foo x\n"],
    ["マップの未知のタグ", "jobs: !foo {a: 1}\n"],
    ["引用符付きの値の型のタグ", 'timeout-minutes: !!int "5"\n'],
    ["警告の出ない既知のタグ", "name: !!timestamp 2001-12-14\n"],
    ["!!str", "name: !!str x\n"],
    ["警告の出ないマップのタグ", "jobs: !!map {a: 1}\n"],
    ["!!set", "a: !!set {x, y}\n"],
    ["非特定タグ !", "a: ! 5\n"],
    ["キーの位置のタグ", "!!str k: 1\n"],
    ["列のタグ", "a: !!seq [1]\n"],
    ["コメントの中の NUL", "# a\u0000b\nname: x\n"],
    ["タブ・LF・CR 以外の制御文字", "name: a\u0001b\n"],
    ["DEL", "name: a\u007fb\n"],
    ["C1 の制御文字(0x80)", "name: a\u0080b\n"],
    ["C1 の制御文字(0x9F)", "name: a\u009fb\n"],
    ["列をキーにした形", "[x]: 1\n"],
    ["マップをキーにした形", "{a: 1}: 2\n"],
    ["大文字小文字だけが違うキーの重複", "name: x\nName: y\n"],
    ["エイリアスで書いたキーの重複", "j:\n  &k t: 99\n  *k : 5\n"],
    ["エイリアスをキーにした形", "x: &k t\nj:\n  *k : 1\n"],
    ["型の違うキーの重複", 'env:\n  1: x\n  "1": y\n'],
    ["null のキー", "env:\n  null: x\n"],
    ["~ のキー", "env:\n  ~: x\n"],
    ["数値のキー", "env:\n  1: x\n"],
    ["真偽値のキー", "env:\n  true: x\n"],
    ["%YAML 1.2", "%YAML 1.2\n---\nname: x\n"],
    ["%YAML 1.1", "%YAML 1.1\n---\nname: x\n"],
    ["%TAG", "%TAG !e! tag:example.com,2000:\n---\nname: x\n"],
    [
      "%TAG で !! を差し替える",
      "%TAG !! tag:example.com,2000:\n---\nname: x\n",
    ],
  ]) {
    assert.notDeepEqual(ambiguousYaml(src), [], label);
  }
});

test("fixture: mergeKeyPaths は素の <<・引用符付きの <<・!!merge・%YAML 1.1 の <<・エイリアスで書いた << を拾い、ふつうのキーは拾わない", () => {
  // 実ファイルでは「無い」ことしか見えず、判定の条件を 1 つ外しても緑のまま通るので、書き方ごとに発火を見る。
  // `!!merge` のタグの条件は、yaml 2.9.1 ではタグ付きのキーの値が必ず Symbol("<<") になるので、Symbol の条件と
  // 重なっていて単独では固定できない(別の版の yaml に備えた重ねがけとして残す)
  assert.deepEqual(mergeKeyPaths("a: 1\nb:\n  c: 2\n"), [], "ふつうのキー");
  for (const [label, src] of [
    ["素の <<", "x: &a {k: 1}\nj:\n  <<: *a\n"],
    ["引用符付きの <<", 'j:\n  "<<": {k: 1}\n'],
    ["!!merge", "j:\n  !!merge <<: {k: 1}\n"],
    ["<< 以外のキーに付けた !!merge", "j:\n  !!merge x: {k: 1}\n"],
    ["%YAML 1.1 の <<", "%YAML 1.1\n---\nx: &a {k: 1}\nj:\n  <<: *a\n"],
    ["エイリアスで書いた <<", "x: &m <<\nj:\n  *m : {k: 1}\n"],
  ])
    assert.notDeepEqual(mergeKeyPaths(src), [], label);
});
