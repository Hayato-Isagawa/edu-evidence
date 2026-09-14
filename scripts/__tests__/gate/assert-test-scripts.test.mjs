// 3 つの口(`test:scripts` / `test:workflows` / `test:hooks`)の判定器
// `scripts/assert-test-files.mjs` / `scripts/assert-test-results.mjs` そのものを検証する。
//
// 判定器は「fail が 1 件でも・pass が下限を割っても・skip / todo があっても exit 1」を
// 担っているが、判定器自身を見る者がいなかった。`if (problems.length)` を `if (false)` に
// する 1 行で、3 口ともテストが落ちていようが恒久 exit 0 になる(実測)。
//
// **この口は判定器を通さない。** 判定器を通す口に置くと、判定器が壊れているときは
// ここで出る `not ok` も同じ判定器に握り潰される。`npm run test:gate` は `node --test` に
// このファイルを明示パスで直接渡す(パスが無ければ exit 1、失敗があれば exit 1)。
// 判定器の外に出た代償として、判定器が塞いでいる「中身が空 / 全件 skip で exit 0」を
// 自分で塞ぐ必要がある — 空ファイル化は `test:workflows` の口(`vrt-targets.test.mjs`)が
// 行頭 `test(` の静的数で止め、skip 系は下の自己計数で止める。
//
// **fixture の spawn では `NODE_TEST_CONTEXT` / `NODE_TEST_WORKER_ID` を落とす。**
// `node --test` 配下の子プロセスはこの 2 つを継承し、判定器がさらに起動する内側の
// `node --test` が「run() is being called recursively … skipping running files」で
// 0 件実行に落ちる(実測。落とさないと results 系が全部「TAP の集計行を読めませんでした」)。
//
// **fixture は問題が 1 つだけ出る形にし、stderr の行を完全一致で見る。** fail だけの
// fixture だと「pass 0 件が下限 1 を下回る」も同時に出て、skip / todo の検査を外す変異が
// exit code では見えなくなる(実測)。
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const RESULTS = path.join(REPO, "scripts/assert-test-results.mjs");
const FILES = path.join(REPO, "scripts/assert-test-files.mjs");

// ---------------------------------------------------------------------------
// 自己計数。`{ skip: true }` / `t.skip()` / `NODE_OPTIONS=--test-skip-pattern` /
// `import` の差し替え / 先頭の `process.exit(0)` は、どれも行頭 `test(` の本数を変えずに
// 0 本実行・exit 0 にできる(実測)。各テスト本体の**末尾**で数え、走った本数が定数と
// 違えば非 0 で終わる — 親の `node --test` は子の非 0 終了をこのファイルの fail と数える。
// 定数は `vrt-targets.test.mjs` の `GATE_TESTS` と同じ値(あちらが静的数と突き合わせる)。
// ---------------------------------------------------------------------------
const GATE_TESTS = 11;
let ran = 0;
process.on("exit", () => {
  if (ran !== GATE_TESTS) {
    console.error(`[gate] ran ${ran} of ${GATE_TESTS} tests`);
    process.exitCode = 1;
  }
});

const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;
delete env.NODE_TEST_WORKER_ID;

/** 一時ディレクトリを cwd にして判定器を実行する */
function run(script, args, cwd) {
  const r = spawnSync(process.execPath, [script, ...args], {
    cwd,
    env,
    encoding: "utf8",
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** fixture のテストファイル群を一時ディレクトリに書く。{ name: 本文 } */
function fixture(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "assert-test-"));
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), body);
  }
  return dir;
}

const PASS = (n) =>
  `import test from "node:test";\ntest("ok ${n}", () => {});\n`;

test("results: 下限ちょうどの pass で exit 0", () => {
  const dir = fixture({
    "a.test.mjs": PASS(1),
    "b.test.mjs": PASS(2),
    "c.test.mjs": PASS(3),
  });
  const r = run(RESULTS, ["3", "*.test.mjs"], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(
    r.stdout,
    /^\[assert-test-results\] pass 3 件\(下限 3\)、skip \/ todo なし$/m
  );
  ran++;
});

test("results: pass が下限を 1 割ると exit 1", () => {
  const dir = fixture({
    "a.test.mjs": PASS(1),
    "b.test.mjs": PASS(2),
    "c.test.mjs": PASS(3),
  });
  const r = run(RESULTS, ["4", "*.test.mjs"], dir);
  assert.equal(r.status, 1);
  assert.match(
    r.stderr,
    /^\[assert-test-results\] pass 3 件が下限 4 を下回る$/m
  );
  ran++;
});

test("results: fail が 1 件あると、下限を満たしていても exit 1", () => {
  const dir = fixture({
    "a.test.mjs": PASS(1),
    "b.test.mjs":
      'import test from "node:test";\ntest("ng", () => { throw new Error("x"); });\n',
  });
  const r = run(RESULTS, ["1", "*.test.mjs"], dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^\[assert-test-results\] 1 件が失敗$/m);
  ran++;
});

test("results: skip が 1 件あると、下限を満たしていても exit 1", () => {
  const dir = fixture({
    "a.test.mjs": PASS(1),
    "b.test.mjs":
      'import test from "node:test";\ntest("sk", { skip: true }, () => {});\n',
  });
  const r = run(RESULTS, ["1", "*.test.mjs"], dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^\[assert-test-results\] 1 件が skip されている$/m);
  ran++;
});

test("results: todo が 1 件あると、下限を満たしていても exit 1", () => {
  const dir = fixture({
    "a.test.mjs": PASS(1),
    "b.test.mjs":
      'import test from "node:test";\ntest("td", { todo: true }, () => {});\n',
  });
  const r = run(RESULTS, ["1", "*.test.mjs"], dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^\[assert-test-results\] 1 件が todo になっている$/m);
  ran++;
});

test("results: 空ファイルは pass 1 と数える(hooks の境界値の式が依拠する前提)", () => {
  // `test:hooks` の下限「総数 − 最小ファイルの本数 + 2」は、空にしたファイルが
  // 0 ではなく 1 pass になることを前提にしている。ここが変わると境界値がずれる。
  const dir = fixture({ "a.test.mjs": "" });
  const r = run(RESULTS, ["1", "*.test.mjs"], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(
    r.stdout,
    /^\[assert-test-results\] pass 1 件\(下限 1\)、skip \/ todo なし$/m
  );
  ran++;
});

test("results: glob が 0 件でも下限割れとして exit 1", () => {
  // 前段の assert-test-files が外れても、ここで止まることの記録。
  const dir = fixture({});
  const r = run(RESULTS, ["1", "*.test.mjs"], dir);
  assert.equal(r.status, 1);
  assert.match(
    r.stderr,
    /^\[assert-test-results\] pass 0 件が下限 1 を下回る$/m
  );
  ran++;
});

test("results: 引数が不正なら exit 2", () => {
  const dir = fixture({ "a.test.mjs": PASS(1) });
  for (const args of [["0", "*.test.mjs"], ["1.5", "*.test.mjs"], ["1"]]) {
    const r = run(RESULTS, args, dir);
    assert.equal(r.status, 2, `args=${JSON.stringify(args)}`);
    assert.match(r.stderr, /^usage: assert-test-results\.mjs/m);
  }
  ran++;
});

test("files: 1 件以上マッチすれば exit 0", () => {
  const dir = fixture({
    "a.test.mjs": PASS(1),
    "b.test.mjs": PASS(2),
    "c.test.mjs": PASS(3),
  });
  const r = run(FILES, ["*.test.mjs"], dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(
    r.stdout,
    /^\[assert-test-files\] 3 file\(s\) matched: \*\.test\.mjs$/m
  );
  ran++;
});

test("files: 0 件なら exit 1", () => {
  const dir = fixture({});
  const r = run(FILES, ["*.test.mjs"], dir);
  assert.equal(r.status, 1);
  assert.match(
    r.stderr,
    /^\[assert-test-files\] no test files matched: \*\.test\.mjs$/m
  );
  ran++;
});

test("files: 引数が無ければ exit 2", () => {
  const dir = fixture({});
  const r = run(FILES, [], dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^usage: assert-test-files\.mjs/m);
  ran++;
});
