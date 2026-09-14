// VRT の撮影が静かに減る経路を塞ぐ。edu-law の同名テストの移植。
//
// **VRT の中には置けない。** VRT は required check ではなく、`vrt.yml` の `paths` に
// 載る PR でしか起動しない。撮影を減らす変更が `vrt/**` に触れるとは限らない
// (`playwright.vrt.config.ts` の projects を削るのがその例)し、そもそも VRT が走らない
// PR では VRT の中のガードも走らない。ここは required check「Content and consistency checks」の
// `test:workflows` ステップで常に走る(`vrt-baseline.test.mjs` と同じ口)。
//
// 撮影が減っても**表向きは何も起きない**。落ちるテストが 100 件から 50 件になるだけで、
// 残った分は緑のまま通り、`npm run vrt` の終了コードも 0 のまま。CI からは「VRT は
// 通った」としか見えない。
//
// **ソースを正規表現で読む形は採らない。** edu-law が 1 度書いて捨てた — 数えているのが
// 文字列でしかないので、5 経路が素通りした(ループを `pages.slice(0, 2)` に絞る /
// config に `grepInvert` を足す / コメント行にダミーの `path:` を書いて件数を保つ /
// projects を削除ではなくコメントアウトする / `test.skip(` でなく `test["skip"](` と
// 書く)。逆に、引用符をシングルに変えただけで赤にもなった。そこでここでは
// **Playwright 自身に「何を撮るか」を列挙させて突き合わせる**(`--list` は 1 秒未満で、
// ブラウザも webServer も起動しない)。
//
// **列挙で見えないものは、値そのものを固定する。** `fullPage` を落とす / 比較設定を
// 緩める / 断面(viewport・`colorScheme`)を潰す / `use` でテーマを立てる JS を止める /
// 比較そのものを消す(`ignoreSnapshots`・`updateSnapshots`・`webServer` を main の dist に
// 固定する)/ ワークフローの撮影コマンドに CLI フラグを足す・ステップを skip する —
// いずれも撮影件数を減らさないので `--list` からは見えない。
//
// **残る穴は spec の書き方そのもの。** 第 2 引数での上書き / 実行時 skip / import 元の
// 差し替え / `emulateMedia` でのテーマ上書き、のいずれも撮影件数を変えずに値だけを
// ずらせる(実測)。ワークフロー側は、2026-09-14 時点で、`run:` が複数行のステップの
// 本文を「行頭のコマンド名の列挙」と「行の形」でしか見ておらず、Build baseline の
// 本文では絶対パスや変数展開で始まる行での dist / src の差し替えを捕まえていなかった。
// **列挙が尽きている保証は無い**ので、`vrt/pages.spec.ts` 冒頭に注意書きを置いてある。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { targets, shotOptions } from "../../../vrt/targets.mjs";

// config は **VRT ジョブと同じ環境でも**読み直す(理由は下の環境比較テスト)。
// クエリを変えると ESM のモジュールキャッシュを跨げる。
const CONFIG_URL = new URL("../../../playwright.vrt.config.ts", import.meta.url)
  .href;
let configReads = 0;
async function readConfig(env = {}) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try {
    return (await import(`${CONFIG_URL}?read=${configReads++}`)).default;
  } finally {
    for (const key of Object.keys(env)) {
      if (key in saved) process.env[key] = saved[key];
      else delete process.env[key];
    }
  }
}

const vrtConfig = await readConfig();

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const PKG = JSON.parse(read("package.json"));
const WORKFLOW = read(".github/workflows/vrt.yml");

/** Playwright に撮影対象を列挙させる。--list なので実行も webServer の起動もしない */
function listPlannedShots() {
  const raw = execFileSync(
    "npx",
    [
      "playwright",
      "test",
      "--config",
      "playwright.vrt.config.ts",
      "--list",
      "--reporter=json",
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 8 * 1024 * 1024,
    }
  );
  const report = JSON.parse(raw);
  return report.suites.flatMap((suite) =>
    suite.specs.flatMap((spec) =>
      spec.tests.map((t) => ({
        name: spec.title,
        project: t.projectName,
        expected: t.expectedStatus,
      }))
    )
  );
}

const planned = listPlannedShots();

/**
 * Astro がページとして出力するファイル。`_` 接頭のものはルートにならず、
 * `.ts` / `.js` はエンドポイント(HTML ではない)なので、どちらも撮影対象外。
 */
function listPageTemplates(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith("_")) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listPageTemplates(full);
    return /\.(astro|md|mdx|html)$/.test(entry.name)
      ? [path.relative(ROOT, full)]
      : [];
  });
}

const templates = listPageTemplates(path.join(ROOT, "src/pages"));

test("撮影対象が 25 件ある", () => {
  // 下限(>=)ではなく固定。増やしたときにも赤にすることで、`CLAUDE.md` に書いた
  // 代表 URL 数と撮影件数を一緒に直す機会を作る。
  assert.equal(targets.length, 25);
});

test("撮影対象の path が重複していない", () => {
  // 件数だけを見ていると、全部を同じ path にしても通る(edu-law の実測: 18 枚が
  // 同一画像になってなお緑)。撮っているページの種類は path の一意性でしか見えない。
  const paths = targets.map((t) => t.path);
  const dups = paths.filter((p, i) => paths.indexOf(p) !== i);
  assert.deepEqual(dups, []);
});

test("テンプレートと撮影対象が 1 対 1 で対応している", () => {
  // `/changelog` だけは意図的に撮らない(理由は `vrt/targets.mjs` 冒頭)。それ以外は
  // テンプレートを足したら撮影対象も足す。この対応が崩れると、新しいページを誰も
  // 撮らないまま本番に出る(移植前は 26 本中 10 本が撮られていなかった。
  // `guide/indicators.astro` は vrt.yml が「効果量訂正で VRT を起動させる」と
  // 明記しているのに、撮影対象には無かった)。
  const excluded = ["src/pages/changelog.astro"];
  for (const e of excluded) {
    assert.ok(templates.includes(e), `除外対象 ${e} が存在しない`);
  }
  assert.equal(
    templates.length - excluded.length,
    targets.length,
    `テンプレート ${templates.length} 本(除外 ${excluded.length})に対して撮影対象が ${targets.length} 件`
  );
});

test("Playwright が撮る予定のものが撮影対象と一致する", () => {
  // ここだけが「実際に何が撮られるか」を見ている。上の 3 本はデータの形しか
  // 見ていないので、ループの絞り込み・grep・projects の削減は素通りする。
  const byProject = new Map();
  for (const shot of planned) {
    if (!byProject.has(shot.project)) byProject.set(shot.project, []);
    byProject.get(shot.project).push(shot.name);
  }
  assert.deepEqual([...byProject.keys()].sort(), [
    "desktop",
    "desktop-dark",
    "mobile",
    "mobile-dark",
  ]);
  const expected = targets.map((t) => t.name).sort();
  for (const [project, names] of byProject) {
    assert.deepEqual(
      names.sort(),
      expected,
      `${project} の撮影対象がずれている`
    );
  }
});

test("撮影が skip / fixme に落ちていない", () => {
  // Playwright は skip を **exit 0** で返す。`test(` を `test.skip(` に変えるだけで
  // 全件が skipped になり、CI からは通ったようにしか見えない。node 側は
  // `scripts/assert-test-results.mjs` が skip / todo を 0 に強制しているが、
  // Playwright の口には同等の検査が無い。
  //
  // **見えるのは宣言時の skip だけ。** `test["skip"](` のような別記法も
  // expectedStatus に出るが、**本体の中で `test.skip(条件, …)` と書く実行時 skip は
  // `--list` に出ない**(edu-law の実測: `test.skip(!!process.env.CI, …)` を足すと
  // expectedStatus は `passed` のままで、CI では全件が skipped になる)。
  const notPassed = planned.filter((s) => s.expected !== "passed");
  assert.deepEqual(notPassed, []);
});

test("VRT が config と spec の変更で起動する", () => {
  // ガードが在っても、対象の変更で VRT が起動しなければ撮り比べは行われない。
  // 列挙の正典は `vrt.yml` なので件数は数えないが、**否定パターンで打ち消されて
  // いないこと**は見る(`- "!vrt/**"` を後ろに足すだけで起動しなくなる)。
  for (const pattern of ["vrt/**", "playwright.vrt.config.ts"]) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      WORKFLOW,
      new RegExp(`^\\s+- "${escaped}"$`, "m"),
      `${pattern} が paths に無い`
    );
    assert.doesNotMatch(
      WORKFLOW,
      new RegExp(`^\\s+- "!${escaped}"$`, "m"),
      `${pattern} が打ち消されている`
    );
  }
  // **起動条件そのものも見る。** `paths` の末尾に `- "!**"` を足す(最後に一致した
  // パターンが勝つので全部が打ち消される)/ `branches` を別の名前にする / `paths-ignore`
  // を足す / `types` を絞る、のどれでも VRT が起動しなくなるが、上の 2 パターンの
  // 検査は緑のままだった(2026-09-14 時点で実測)。列挙の正典は `vrt.yml` なので
  // 肯定の path は写さず、否定の path と `branches` とキー集合だけを固定する。
  // `branches` はこのファイルの他の固定と同じく綴りごと(`[main]`)固定する。
  const on = WORKFLOW.split(/^on:\n/m)[1]?.split(/^\w/m)[0];
  assert.ok(on, "on: が無い");
  assert.deepEqual(keysAt(on, 2).sort(), ["pull_request", "workflow_dispatch"]);
  const pullRequest = on
    .split(/^ {2}pull_request:\n/m)[1]
    ?.split(/^ {2}\w/m)[0];
  assert.ok(pullRequest, "on.pull_request が無い");
  assert.deepEqual(keysAt(pullRequest, 4).sort(), ["branches", "paths"]);
  assert.match(
    pullRequest,
    /^ {4}branches: \[main\]$/m,
    "pull_request.branches を `branches: [main]` の綴りで書くこと"
  );
  // path の行は「クォート 1 組で囲んだ 1 行」の綴りだけを許す。シングルクォート /
  // 行末コメント / ブロックスカラーでも YAML では同じ値になるが、否定の抽出は綴りを
  // 見るので、許さない綴りは値を見る前に赤にする(許すと `- '!**'` が素通りした。
  // 2026-09-14 時点で実測)。
  const pathLines = pullRequest.match(/^ {6}-.*$/gm) ?? [];
  const pathValues = pathLines.map((l) => {
    const m = l.match(/^ {6}- (["'])([^"']*)\1$/);
    assert.ok(m, `paths の行はクォート 1 組の 1 行で書くこと: ${l.trim()}`);
    return m[2];
  });
  assert.deepEqual(
    pathValues.filter((v) => v.startsWith("!")),
    ["!src/pages/changelog.astro"]
  );
});

/** 指定インデントに在るマッピングのキー。クォートとコロン前の空白は `stepKeys` と同じ扱い */
function keysAt(text, indent) {
  return [
    ...text.matchAll(new RegExp(`^ {${indent}}(["']?)([\\w-]+)\\1\\s*:`, "gm")),
  ].map((m) => m[2]);
}

/** ステップの `name:`(位置は問わない・クォートは剥がす)。無ければ null */
function stepName(step) {
  const m = step.match(/^(?: {6}- | {8})name\s*:[ \t]*(.*)$/m);
  return m ? m[1].trim().replace(/^(["'])(.*)\1$/, "$2") : null;
}

/** YAML のコメント行を落とす(`run: |` の中の shell コメントも同じ形なので一緒に落ちる) */
function stripComments(text) {
  return text.replace(/^\s*#.*$/gm, "");
}

/**
 * ステップ(`      - ` 始まりの塊)が持つキー。順序は見ない(マッピングのキー順に
 * 意味は無い)。`"if":` のようにクォートしたキーも `if :` のようにコロンの前に空白を
 * 置いたキーも YAML では同じキーなので、同じ名前で返す。
 */
function stepKeys(step) {
  return [...step.matchAll(/^(?: {6}- | {8})(["']?)([\w-]+)\1\s*:/gm)].map(
    (m) => m[2]
  );
}

/** ステップ内の `key:` の下にぶら下がる行(インデント 10)を trim して返す */
function blockLines(step, key) {
  const m = step.match(
    new RegExp(`^(?: {6}- | {8})${key}:[^\\n]*\\n((?: {10}.*\\n?)*)`, "m")
  );
  return m
    ? m[1]
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
    : [];
}

/**
 * ステップの `run:` を空白区切りのトークンにして返す。`run: cmd` / `run: "cmd"` /
 * `run: 'cmd'` / `run: |`(次行以降)を同じに扱う。ブロックスカラーで非空行が
 * 2 行以上あれば `null`(1 行目が正しくても 2 行目で結果を握り潰せるため)。
 */
function runTokens(step) {
  const m = step.match(/^(?: {6}- | {8})run:[ \t]*(.*)$/m);
  if (!m) return null;
  let value = m[1].trim();
  if (/^[|>][+-]?$/.test(value)) {
    const lines = blockLines(step, "run");
    if (lines.length !== 1) return null;
    value = lines[0];
  }
  value = value.replace(/^(["'])(.*)\1$/, "$2");
  return value.split(/\s+/).filter(Boolean);
}

test("VRT が main と PR の 2 ビルドを撮り比べている", () => {
  // 比較ステップを消すとベースライン撮影だけが残り、**恒久的に緑**になる。
  //
  // **ステップ名だけでは足りない。** 名前を残したまま比較側に `--update-snapshots` を
  // 足す / `VRT_DIST` を `dist-main` に向ける、のどちらでも恒久的に緑になり、
  // 名前を見るだけの検査は素通りする(edu-law の実測)。
  //
  // **1 本の正規表現で `env:` と `run:` を続けて拾う形も採らない。** YAML として等価な
  // 書き方(`run:` をクォートする / `run: |` のブロックスカラー / `env:` と `run:` の
  // 順序入れ替え)で赤になる。マッピングのキー順に意味は無いので、
  // **ステップの塊に切ってから、その中に何が在るかを見る**。
  // **撮影 2 ステップの外側も見る。** job / workflow レベルの `env:`(`NODE_OPTIONS` で
  // 両撮影に細工する)、`defaults:`(`shell` を差し替えて `-e` を外す)、前段のステップ
  // (`rsync -a --delete dist-main/ dist-pr/` を 1 つ挟む・`Checkout PR` に `ref:` を足して
  // PR 側を main にする)は、撮影 2 ステップを丸ごと固定しても素通りした(2026-09-14
  // 時点で実測)。マッピングのキー集合・ステップの並び・各ステップのキー集合・
  // `uses:` の action を固定し、`run:` が 1 行のステップは完全一致にする。複数行の
  // `run:`(Build baseline / Report baseline mode)の本文は、2026-09-14 時点では
  // `vrt-baseline.test.mjs` が行の列挙と形で見ていた。
  assert.deepEqual(keysAt(WORKFLOW, 0).sort(), [
    "concurrency",
    "jobs",
    "name",
    "on",
    "permissions",
  ]);
  const jobs = WORKFLOW.split(/^jobs:\n/m)[1];
  assert.ok(jobs, "jobs: が無い");
  assert.deepEqual(keysAt(jobs, 2), ["vrt"]);
  assert.deepEqual(keysAt(jobs, 4).sort(), [
    "name",
    "runs-on",
    "steps",
    "timeout-minutes",
  ]);

  // **`steps:` の下の塊は全部 `- name:` で始まっていなければならない。** name の無い
  // ステップ(`- run: …`)や `-   name:` / `- { name: … }` のような綴りは、name で
  // 引く下の検査から丸ごと消える。paths の `- "…"` を除くために null を捨てる形に
  // すると、そういうステップも一緒に捨てて緑のままになる(2026-09-14 時点で実測)。
  const stepsBlock = jobs.split(/^ {4}steps:\n/m)[1];
  assert.ok(stepsBlock, "steps: が無い");
  // 最初のステップより前に置かれたコメントは、どのステップにも付かない塊になるので
  // 先に落とす(ステップ間のコメントは次のステップの塊に入る)。
  const steps = stripComments(stepsBlock)
    .split(/^(?= {6}- )/m)
    .filter((s) => s.trim());
  assert.deepEqual(
    steps.filter((s) => stepName(s) === null),
    [],
    "name の無いステップがある"
  );
  assert.deepEqual(steps.map(stepName), [
    "Checkout PR",
    "Setup Node.js",
    "Install dependencies",
    "Install Playwright browser",
    "Build PR branch",
    "Stash PR build",
    "Build baseline (main code x PR content)",
    "Report baseline mode",
    "Capture baseline from main",
    "Compare PR against baseline",
    "Upload VRT report",
  ]);
  const byName = new Map(steps.map((s) => [stepName(s), s]));
  // 各ステップのキー集合。`shell:` / `working-directory:` / `env:` を足すだけで
  // 本文を変えずに挙動を変えられるので、撮影 2 ステップ以外も固定する。
  assert.deepEqual(
    steps.map((s) => [stepName(s), stepKeys(s).sort()]),
    [
      ["Checkout PR", ["name", "uses", "with"]],
      ["Setup Node.js", ["name", "uses", "with"]],
      ["Install dependencies", ["name", "run"]],
      ["Install Playwright browser", ["name", "run"]],
      ["Build PR branch", ["name", "run"]],
      ["Stash PR build", ["name", "run"]],
      ["Build baseline (main code x PR content)", ["env", "id", "name", "run"]],
      ["Report baseline mode", ["env", "name", "run"]],
      ["Capture baseline from main", ["env", "name", "run"]],
      ["Compare PR against baseline", ["env", "name", "run"]],
      ["Upload VRT report", ["if", "name", "uses", "with"]],
    ]
  );
  // `uses:` は action の名前まで固定する(sha は Dependabot が bump するので見ない)。
  for (const [name, action] of [
    ["Checkout PR", "actions/checkout@"],
    ["Setup Node.js", "actions/setup-node@"],
    ["Upload VRT report", "actions/upload-artifact@"],
  ]) {
    const uses = byName.get(name).match(/^ {8}uses\s*:[ \t]*(\S+)/m)?.[1] ?? "";
    assert.ok(
      uses.startsWith(action),
      `${name} の uses が ${action} で始まっていない`
    );
  }
  // 1 行の `run:` は完全一致。`Install dependencies` を `npm ci && git checkout
  // origin/main -- src/…` にすると PR 側のビルドが main のコードになる。
  for (const [name, tokens] of [
    ["Install dependencies", ["npm", "ci"]],
    [
      "Install Playwright browser",
      ["npx", "playwright", "install", "chromium", "--with-deps"],
    ],
    ["Build PR branch", ["npm", "run", "build"]],
    ["Stash PR build", ["mv", "dist", "dist-pr"]],
  ]) {
    assert.deepEqual(runTokens(byName.get(name)), tokens, name);
  }
  // `Checkout PR` は `with: ref: …` で PR 以外を取り出せるので、`with` の中身まで固定する。
  assert.deepEqual(blockLines(byName.get("Checkout PR"), "with"), [
    "fetch-depth: 0",
  ]);
  // dist-pr / dist-main に触るステップの集合(コメントは除く)。前段に dist を差し替える
  // ステップを足すと、名前の並びとここの両方で赤になる。glob や変数で綴りを隠した
  // 差し替えはここでは捕まらない(名前の並びだけが捕まえる)。
  const mentioning = (needle) =>
    steps.filter((s) => stripComments(s).includes(needle)).map(stepName);
  assert.deepEqual(mentioning("dist-pr"), [
    "Stash PR build",
    "Compare PR against baseline",
  ]);
  assert.deepEqual(mentioning("dist-main"), [
    "Build baseline (main code x PR content)",
    "Capture baseline from main",
  ]);

  // **撮るステップは 2 つだけ、と数で固定する。** 比較の前に「`VRT_DIST: "dist-pr"` で
  // `--update-snapshots`」の 3 つ目を挟むと、最初に見つかった 1 つだけを検査する形では
  // 元の比較ステップだけが通り、実行順は撮り直し → 同じ dist と比較で恒久的に緑になる
  // (実測)。`playwright test` を呼ぶステップも `VRT_DIST` を持つステップも、下で
  // 検査する 2 つと同じ集合でなければならない。
  const stepsFor = (needle) => steps.filter((step) => step.includes(needle));
  const [baseline, ...moreBaseline] = stepsFor("VRT_DIST: dist-main");
  const [compare, ...moreCompare] = stepsFor("VRT_DIST: dist-pr");
  assert.ok(baseline, "main の dist を撮るステップが無い");
  assert.ok(compare, "PR の dist を撮るステップが無い");
  assert.deepEqual(
    [...moreBaseline, ...moreCompare],
    [],
    "撮るステップが 3 つ以上ある"
  );
  assert.deepEqual(stepsFor("VRT_DIST"), [baseline, compare]);
  assert.deepEqual(stepsFor("playwright test"), [baseline, compare]);

  // **撮影コマンドは完全一致で固定する。** 部分一致だと、後ろに `--project desktop
  // --project mobile` を足して dark だけ落とす / `--ignore-snapshots` で比較を消す /
  // `-u`(`--update-snapshots` の短縮形)を足す、のいずれも緑のまま通る(実測)。
  // 撮り直しの指定はベースライン側にだけ在る — 比較側に付くと毎回上書きになり、
  // 差分が出ることが無くなる。
  //
  // **ステップに在るキーも固定する。** `if:` で比較を skip する / `shell: bash {0}` +
  // 2 行目の `true` で失敗を握り潰す / `env:` に `NODE_OPTIONS` を足す、はどれも
  // コマンド行を変えずに比較を無効にできる(実測)。`run:` は `run: cmd` / クォート /
  // `run: |` の等価な書き方を同じに扱い、ブロックスカラーは非空行がちょうど 1 行で
  // あることを要求する。
  const PLAYWRIGHT = [
    "npx",
    "playwright",
    "test",
    "--config",
    "playwright.vrt.config.ts",
  ];
  for (const [label, step, dist, args] of [
    ["ベースライン撮影", baseline, "dist-main", ["--update-snapshots"]],
    ["比較", compare, "dist-pr", []],
  ]) {
    assert.deepEqual(
      stepKeys(step).sort(),
      ["env", "name", "run"],
      `${label}のキー`
    );
    assert.deepEqual(
      blockLines(step, "env"),
      [`VRT_DIST: ${dist}`],
      `${label}の env`
    );
    assert.deepEqual(
      runTokens(step),
      [...PLAYWRIGHT, ...args],
      `${label}のコマンド`
    );
  }

  // 撮ってから比べる。逆順だとベースラインが無い状態で比較が走る。
  assert.ok(
    WORKFLOW.indexOf(baseline) < WORKFLOW.indexOf(compare),
    "比較がベースライン撮影より先に置かれている"
  );

  // `continue-on-error` が付くと job は緑のまま比較だけが無効になる。
  assert.doesNotMatch(
    WORKFLOW,
    /continue-on-error/,
    "vrt.yml に continue-on-error が付いている"
  );
});

test("比較設定が完全一致のまま固定されている", () => {
  // edu-law #160 の形に静かに戻す変異を塞ぐ。`threshold` の既定は 0.2 で、それ未満の
  // 色差は差分として**数えられない**。`maxDiffPixels` の既定は 0 だが型定義は
  // "unset by default" としか書いておらず契約ではないので、明示されていることまで見る。
  //
  // **ソースを読まずに config を import して評価済みの値を見る。** 正規表現では、
  // キーを消したのかコメントアウトしたのか、別の場所で上書きしたのかを区別できない。
  // `--list --reporter=json` には `expect` が入らないので、Playwright 経由では取れない。
  assert.deepEqual(vrtConfig.expect.toHaveScreenshot, {
    threshold: 0,
    maxDiffPixels: 0,
    animations: "disabled",
    caret: "hide",
  });
  // 比率(`maxDiffPixelRatio`)が戻ってきた場合も、余分なキーとしてここで赤になる。
  // 使わないのは、許容量が総ピクセル数に比例して長いページほど甘くなるため
  // (ADR 0036)。

  // **比較そのものを消す 2 つのキーも見る。** どちらも 1 行で VRT を完全な no-op に
  // する(edu-law の実測: `ignoreSnapshots: true` / `updateSnapshots: 'all'` の
  // どちらでも、本文に letter-spacing を注入した dist が passed になる)。
  assert.ok(!vrtConfig.ignoreSnapshots, "ignoreSnapshots が有効になっている");
  assert.equal(
    vrtConfig.updateSnapshots,
    undefined,
    "updateSnapshots が設定されている"
  );

  // **project 単位の `expect` は上位を上書きする。** 同じファイルの中で
  // `projects[].expect.toHaveScreenshot` を書けば、上の deepEqual を通したまま
  // 実効値だけを緩められる。
  for (const project of vrtConfig.projects) {
    assert.equal(
      project.expect,
      undefined,
      `${project.name} が expect を上書きしている`
    );
  }
});

test("比較設定が VRT ジョブの環境でも同じ値になる", async () => {
  // **import した時点の値を見るだけでは足りない。** config が実行環境で分岐すると、
  // このガードが走る「Content and consistency checks」(`VRT_DIST` 未設定)では厳格な値が見え、
  // 実際に撮る VRT ジョブ(`VRT_DIST: dist-main` / `dist-pr`)では緩い値が使われる。
  // `VRT_DIST` はこの config が元から読んでいる変数なので、「CI では少し緩める」形の
  // 分岐が自然な修正として紛れ込みうる(edu-law の実測: 三項演算子 1 つで
  // `threshold` が 0 → 0.9 に化けたまま `test:workflows` は緑だった)。
  //
  // **並行に読まない。** `readConfig` は `process.env` を書き換えてから `import()` する
  // ので、`Promise.all` で 2 本同時に走らせると後から設定した環境を両方が見る。
  const variants = [];
  for (const env of [{ VRT_DIST: "dist-main" }, { VRT_DIST: "dist-pr" }]) {
    variants.push(await readConfig(env));
  }
  //
  // **フィールドを選んで比べない。** `expect` と `use` だけを比べる形だと、`shard` /
  // `grepInvert` / `webServer.cwd` に `VRT_DIST ? … : undefined` を書くだけで、既定環境
  // では同じに見えて VRT ジョブでだけ撮影が減る・404 ページを撮る(実測)。`VRT_DIST` で
  // 変わってよいのは `webServer.command` に埋まる dist 名だけなので、それを除いた
  // config 全体を `deepEqual` する。
  const withoutDist = (c) => ({
    ...c,
    webServer: { ...c.webServer, command: undefined },
  });
  for (const config of variants) {
    assert.deepEqual(withoutDist(config), withoutDist(vrtConfig));
  }
  // **配信する dist が `VRT_DIST` に追従していること。** `webServer.command` が
  // `dist-main` を固定で配信すると、2 ステップとも同じビルドを撮って恒久的に緑になる
  // (実測)。config は `VRT_DIST ?? "dist"` を埋めているので、その値が出ていることを見る。
  for (const [dist, config] of [
    ["dist-main", variants[0]],
    ["dist-pr", variants[1]],
  ]) {
    assert.equal(config.webServer.command, `npx serve ${dist} -l 4173`);
  }
});

test("撮影の断面とリトライが固定されている", () => {
  // **断面が減っても件数は減らない。** mobile の viewport を desktop と同じにする /
  // `colorScheme` を 4 つとも light にすると、100 件は撮り続けたまま同じ画像を 2 度撮る
  // ことになり、モバイルやダークの崩れは一切写らなくなる(`targets` の path 重複を
  // 禁じているのと同じ形)。viewport も `colorScheme` も `--list --reporter=json` の
  // `config.projects[]` に入らないので、config を import して見る。
  // **並び順は見ない。** projects の順序は撮るものを変えないので、入れ替えただけで
  // 赤くするのは偽陽性になる。
  //
  // **`use` はキーを追いかけず丸ごと固定する。** viewport と `colorScheme` を保った
  // まま `-dark` の 2 断面を light にする書き方が `use` の中に何通りもある —
  // `storageState` で `localStorage.theme` を注入する(`Layout.astro` は localStorage を
  // `prefers-color-scheme` より先に見る)/ `contextOptions.storageState` に綴りを変える
  // (`use.storageState` が未設定なら Playwright はそこを既定値にする)/
  // `javaScriptEnabled: false` や `launchOptions.args` の `--blink-settings=scriptEnabled=false`
  // で `data-theme` を立てるスクリプトごと止める(ダークは `[data-theme="dark"]` でしか
  // 定義していない)。いずれも実測で light を描いた。1 つずつ `undefined` を見る形は
  // 綴りが増えるたびに負けるので、`expect.toHaveScreenshot` と同じく余分なキーが
  // あれば赤になる形にする。
  assert.deepEqual(vrtConfig.use, { baseURL: "http://localhost:4173" });
  // project も `name` と `use` を選ばず丸ごと。`-dark` の 2 つにだけ `testMatch` で
  // 別の spec(`emulateMedia` で light に上書きしたもの)を向けると、テスト名が同じなので
  // `--list` の突き合わせも通る(実測)。
  assert.deepEqual(
    [...vrtConfig.projects].sort((a, b) => a.name.localeCompare(b.name)),
    [
      {
        name: "desktop",
        use: { viewport: { width: 1280, height: 800 }, colorScheme: "light" },
      },
      {
        name: "desktop-dark",
        use: { viewport: { width: 1280, height: 800 }, colorScheme: "dark" },
      },
      {
        name: "mobile",
        use: { viewport: { width: 390, height: 844 }, colorScheme: "light" },
      },
      {
        name: "mobile-dark",
        use: { viewport: { width: 390, height: 844 }, colorScheme: "dark" },
      },
    ]
  );
  // リトライは入れない(理由は config のコメント)。増やすと、安定化ループでも
  // 収まらなかった問題まで握り潰す。
  assert.equal(vrtConfig.retries, 0);
  // **`webServer` も丸ごと。** `command` だけ固定しても `cwd: "/tmp"` を足せば serve が
  // 404 ページを返し、2 ステップとも同じ白いページを撮って恒久的に緑になる(実測)。
  assert.deepEqual(vrtConfig.webServer, {
    command: "npx serve dist -l 4173",
    port: 4173,
    reuseExistingServer: !process.env.CI,
  });
  // **config のキー集合と reporter も固定する。** `globalSetup` やカスタム reporter から
  // dist の起動スクリプトを書き換えれば `-dark` は light を描く(実測)。ガードの `--list`
  // は `globalSetup` を実行せず、reporter は `--reporter=json` の指定が config の値を
  // 上書きするので、どちらもガードの中では動かない。
  assert.deepEqual(Object.keys(vrtConfig).sort(), [
    "expect",
    "forbidOnly",
    "fullyParallel",
    "projects",
    "reporter",
    "retries",
    "snapshotPathTemplate",
    "testDir",
    "use",
    "webServer",
    "workers",
  ]);
  assert.equal(vrtConfig.reporter, "html");
});

test("全ページをフルページで撮っている", () => {
  // `fullPage` を落とすとビューポート内(1280x800 / 390x844)しか撮らなくなるが、
  // 100 件は走り続けて全部緑のまま通る。config の `expect.toHaveScreenshot` には
  // 置けない値なので、`vrt/targets.mjs` にデータとして持たせてここで固定する。
  assert.deepEqual(shotOptions, { fullPage: true });
});

test("npm run vrt が VRT の config を指している", () => {
  assert.equal(
    PKG.scripts.vrt,
    "npx playwright test --config playwright.vrt.config.ts"
  );
});

// ---------------------------------------------------------------------------
// 他の口(`test:scripts` / `test:hooks`、末尾で `test:gate`)の npm script と下限を固定する。自分自身を
// 縛ると、ファイルごと消えたときに縛りも一緒に消える。逆向き(`test:workflows`)は
// `scripts/__tests__/check-scripts.test.mjs` にある。edu-law の同名テストと同型。
//
// **塞げるのは「片方だけを静かに薄める」まで**(限界は CLAUDE.md「下限の決め方」)。
// ---------------------------------------------------------------------------

/** `.test.mjs` / `.test.cjs` で終わるファイル名を昇順で返す(ディレクトリは除く) */
function listTestFiles(dir, ext) {
  return fs
    .readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(ext))
    .map((e) => e.name)
    .sort();
}

/** 行頭の `test(` の本数。行頭以外に書かないことは `nonTopLevelTestCalls` が固定している */
const countTopLevelTests = (text) => (text.match(/^test\(/gm) ?? []).length;

/**
 * 行頭以外の `test(` 呼び出し(トリム済みの行)。静的数は行頭しか数えないので、ブロック・
 * ループ・1 行 `for` の中の `test(`、`t.test(` の subtest、`test.only(` / `test.it(` /
 * `test.describe(` は実行数(`# pass`)だけを増やし、下限も定数も動かさない(#592。
 * `test.only(` は `--test-only` 無しでも走る)。間接呼び出し(`(test)(` / `(0, test)(` /
 * `test?.(` / `test.call(` / `test.apply(` / `test.bind(`)と、既定の 2 形以外での
 * `node:test` の取り込み(`import { it, describe }` / `import * as` / `import t from` /
 * 分割代入の `require`)も同じ理由で赤にする(#596。`it(` / `describe(` は行頭でも
 * 静的数に載らない)。除外はコメント行と、正規表現リテラル直後の
 * `.test(`(`/re/flags.test(`)だけ。引用符の中も区別しない — 直前が空白・記号なら赤
 * (安全側)、`\ntest(` のように英数字が直前なら見えない。この関数自身が相手の口に
 * 走査されるので、パターンは文字列でなく正規表現リテラルで書く。
 */
function nonTopLevelTestCalls(text) {
  return (
    text
      // oxfmt は 80 桁を超える取り込み文を複数行に折る(`import {\n  it,\n} from` /
      // `} =\n  require(`)ので、宣言を 1 行に戻してから見る。引用符・`;` は越えない
      .replace(/\bimport\b[^;'"`]*?\bfrom\b/g, (m) => m.replace(/\s+/g, " "))
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

/** `test:scripts` の口で走るべきテストの総数。**守る対象から導出しない**(下記) */
const SCRIPT_TESTS = 52;

test("test:scripts の口にあるテストファイルが 3 本である", () => {
  // ファイルを足すと下限に静かな余裕が生まれる(edu-law の実測: ダミーを 3 本足しても
  // 下限つきの口は緑のまま通った)。囮を 1 本足してから本体を薄める経路も、ここで赤になる。
  // `fixtures/` `gate/` `helpers/` `workflows/` はディレクトリなので一覧に入らない。
  assert.deepEqual(listTestFiles("scripts/__tests__", ".test.mjs"), [
    "check-scripts.test.mjs",
    "glossary-inline.test.mjs",
    "remark-glossary.test.mjs",
  ]);
});

test("npm script test:scripts が、実測ちょうどの下限で 2 段を通す", () => {
  // **完全一致で縛る。** `match` だと ` || true` を後ろに足すだけで恒久 no-op に
  // でき、下限も 1 まで静かに下げられる(`assert-test-results.mjs` は 1 以上しか
  // 要求しない)。
  //
  // **下限を守る対象から導出しない。** ファイルの `test(` を数えて突き合わせる形だと、
  // 中身を消せば数も一緒に下がるので、`中身を空にする + 下限を巻き戻す` の 2 手が
  // 素通りする(edu-law の実測)。**塞いでいるのは、この定数がここに直接書いてあること**。
  // 静的数との照合は「テストを足したのに定数を上げていない」を赤にするためにある。
  // テストを足したら npm script とこの定数の両方を直す。
  //
  // `check-scripts.test.mjs` の `gate()` は 1 呼び出しで 2 テスト(違反 / 正常)を登録する。
  const own = read("scripts/__tests__/check-scripts.test.mjs");
  const measured =
    countTopLevelTests(own) +
    (own.match(/^gate\(/gm) ?? []).length * 2 +
    countTopLevelTests(read("scripts/__tests__/glossary-inline.test.mjs")) +
    countTopLevelTests(read("scripts/__tests__/remark-glossary.test.mjs"));
  assert.equal(measured, SCRIPT_TESTS, "実測と定数がずれている");
  assert.equal(
    PKG.scripts["test:scripts"],
    'node scripts/assert-test-files.mjs "scripts/__tests__/*.test.mjs" && ' +
      `node scripts/assert-test-results.mjs ${SCRIPT_TESTS} "scripts/__tests__/*.test.mjs"`
  );
});

const HOOK_TEST_FILES = [
  "branch-guard.test.cjs",
  "post-edit-roundtrip-spot-check.test.cjs",
  "pre-edit-frontmatter-immutable.test.cjs",
];

/**
 * `test:hooks` の下限。実数追随ではなく「どの 1 ファイルを空にしても割る」境界値
 * (`総数 − 最小ファイルの本数 + 2`。空ファイルも `node --test` は 1 pass と数える)。
 * **守る対象から導出しない**(理由は `SCRIPT_TESTS` と同じ)。
 */
const HOOK_TESTS_FLOOR = 56;

test("test:hooks の口にあるテストファイルが 3 本である", () => {
  assert.deepEqual(
    listTestFiles(".claude/hooks/__tests__", ".test.cjs"),
    HOOK_TEST_FILES
  );
});

test("npm script test:hooks が、境界値の下限で 2 段を通す", () => {
  // 境界値の式を機械で固定する。最小ファイル**以外**にテストを足すと総数だけが
  // 増えて式が動くので、定数を再導出しないと赤になる。**最小ファイルの増減には
  // 不変**(総数と最小が同じだけ動く)で、それは境界値の設計どおり — 最小ファイルを
  // 丸ごと空にする経路は `assert-test-results.mjs` の下限そのものが止める。
  const counts = HOOK_TEST_FILES.map((name) =>
    countTopLevelTests(read(`.claude/hooks/__tests__/${name}`))
  );
  const total = counts.reduce((sum, n) => sum + n, 0);
  assert.equal(
    total - Math.min(...counts) + 2,
    HOOK_TESTS_FLOOR,
    "境界値(総数 − 最小ファイルの本数 + 2)と定数がずれている"
  );
  assert.equal(
    PKG.scripts["test:hooks"],
    'node scripts/assert-test-files.mjs ".claude/hooks/__tests__/*.test.cjs" && ' +
      `node scripts/assert-test-results.mjs ${HOOK_TESTS_FLOOR} ".claude/hooks/__tests__/*.test.cjs"`
  );
});

test("test:scripts / test:hooks / test:gate の口が checks.yml に配線されている", () => {
  // 逆向きの縛り(`check-scripts.test.mjs` が `test:workflows` を固定する)は、
  // `test:scripts` のステップが checks.yml から外れると CI で一度も走らない
  // (`check:all` は CI から呼ばれていない)。相互固定が片肺にならないよう、
  // 相手のホストの配線をこちらから見る。`test:hooks` は誰も配線を見ていなかった。
  // `test:gate` は判定器の外で走る口なので、外れると判定器の故障を誰も見なくなる。
  // ステップ名では探さない(改名だけで赤くなるため)。
  const b = read(".github/workflows/checks.yml");
  for (const script of ["test:scripts", "test:hooks", "test:gate"]) {
    assert.match(
      b,
      new RegExp(
        `^ {8}if: \\$\\{\\{ !cancelled\\(\\) \\}\\}\\n {8}run: npm run ${script}$`,
        "m"
      ),
      `checks.yml に ${script} が無い、または前段が落ちると走らない形になっている`
    );
    // continue-on-error が付くと赤が job に伝わらない。**キーとして**探す —
    // 字面で探すと、次のステップに掛かるコメント(「continue-on-error が無いこと」)が
    // このステップの塊に入って偽陽性になる(実測)。
    const step = b
      .split(/^ {6}(?=- name: )/m)
      .find((s) => s.includes(`run: npm run ${script}`));
    assert.ok(
      step && !/^\s+continue-on-error:/m.test(step),
      `${script} のステップに continue-on-error が付いている`
    );
  }
});

// ---------------------------------------------------------------------------
// 判定器の自己検証の口(`test:gate`)を固定する。あちらは判定器を通さないので、
// 「中身が空で exit 0」を判定器が止めてくれない — 空ファイル化はここが静的数で止め、
// skip 系はあちらの自己計数が止める(理由は gate ファイル冒頭)。
// ---------------------------------------------------------------------------

const GATE_FILE = "scripts/__tests__/gate/assert-test-scripts.test.mjs";

/** `test:gate` で走るべきテストの総数。**守る対象から導出しない**(`SCRIPT_TESTS` と同じ理由) */
const GATE_TESTS = 11;

test("test:gate の口にあるテストファイルが 1 本である", () => {
  // 1 ファイルを直接実行するので囮を足しても実行数は変わらないが、gate/ に別ファイルが
  // 増えると「どれが走っているか」が名前でしか分からなくなる。1 本に固定する。
  assert.deepEqual(listTestFiles("scripts/__tests__/gate", ".test.mjs"), [
    path.basename(GATE_FILE),
  ]);
});

test("npm script test:gate が、判定器もテストランナーの親も通さず直接走る", () => {
  // **完全一致で縛る。** 判定器を挟むと判定器の故障で自己検証も黙る。`node --test` を
  // 挟むと、親が skip / todo 付きの失敗を集計から落として exit 0 にする(実測)。
  // ` || true` は他の口と同じ。
  const own = read(GATE_FILE);
  assert.equal(countTopLevelTests(own), GATE_TESTS, "実測と定数がずれている");
  // gate ファイル内の自己計数の定数も同じ値でなければ、走った本数の照合が空振りする。
  assert.match(own, new RegExp(`^const GATE_TESTS = ${GATE_TESTS};$`, "m"));
  // 自己計数の登録より前に `process.exit(0)` を置くと何にも止められない(実測)ので、
  // `//` 行以外の `process.exit(` を禁じる(行頭に限ると `if (x) process.exit(0)` が通る)。
  assert.doesNotMatch(
    own,
    /^(?!\s*\/\/).*\bprocess\.exit\(/m,
    "gate ファイルに process.exit( がある"
  );
  // 直接実行では最終 exitCode がすべてなので、後から登録した exit ハンドラで
  // `process.exitCode = 0` にすれば失敗も自己計数も上書きできる(実測)。ハンドラは
  // 自己計数の 1 つだけ、exitCode への代入は `= 1` の 1 回だけに固定する。
  assert.equal((own.match(/process\.on\("exit"/g) ?? []).length, 1);
  assert.deepEqual(own.match(/process\.exitCode\b[^;\n]*/g), [
    "process.exitCode = 1",
  ]);
  assert.equal(PKG.scripts["test:gate"], `node ${GATE_FILE}`);
});

test("test:scripts / test:hooks / test:gate の口で、テストの登録は行頭にしか書かれていない", () => {
  // 静的数と定数の照合(上)は行頭の `test(` しか見ない。行頭以外に書けば実行数だけが
  // 増え、以後その 1 本ぶんの削除が無音になる(#592 で実測)。`check-scripts.test.mjs` の
  // `gate()` 本体にある 2 本だけを既知として、行のテキストで固定する(3 本目を足せば
  // `^gate(` × 2 の前提が崩れるので、ここで赤にする)。テスト名・メッセージ・既知の行に
  // `test(` の字面を書くと、この検査自身が相手の口で赤になるので、既知の行は正規表現で持つ。
  const GATE_BODY = [
    /^test\(`\$\{script\} は \$\{fixture\} の違反を検出して落ちる`, \(\) => \{$/,
    /^test\(`\$\{script\} は \$\{fixture\} の正常な入力を通す`, \(\) => \{$/,
  ];
  const files = [
    ...listTestFiles("scripts/__tests__", ".test.mjs").map(
      (name) => `scripts/__tests__/${name}`
    ),
    ...HOOK_TEST_FILES.map((name) => `.claude/hooks/__tests__/${name}`),
    GATE_FILE,
  ];
  for (const rel of files) {
    const found = nonTopLevelTestCalls(read(rel));
    const known =
      rel === "scripts/__tests__/check-scripts.test.mjs" ? GATE_BODY : [];
    assert.equal(
      found.length,
      known.length,
      `${rel} に行頭以外のテスト登録がある: ${found.join(" / ")}`
    );
    known.forEach((re, i) =>
      assert.match(found[i], re, `${rel} の既知の行とずれている`)
    );
  }
});
