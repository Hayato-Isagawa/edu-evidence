// link-check.yml の「検出をどう届けるか」の分岐を固定する。
//
// このステップは壊れても**静かに**壊れる。lychee は走り続け、レポートも
// アーティファクトに残り、job は success で終わる。消えるのは通知だけなので、
// CI を見ている限り何も起きていないように見える。
//
// 実際に起きた(姉妹リポ okinawa-in-data、このリポと同じコードを共有していた):
// 2026-08-17 の run は `web.archive.org/save/` の 404 を検出していたが、当時 open な
// link-check Issue があったため「既存 Issue があるので作らない」の分岐に入り exit 0。
// この検出は 2 日後にその Issue を閉じるまでどこにも出ず、握り潰す状態自体は
// Issue が open だった 9 日間ずっと有効だった。気づいたのは run のアーティファクトまで
// 降りたからで、Issue 一覧を見ている限り分からなかった(okinawa-in-data で塞いだ。塞いだ後の形は同リポの `.github/workflows/link-check.yml`)。
//
// 写しを置かず、**ワークフローに埋まっている本体**を取り出して走らせる。gh はスタブに差し替え、渡された引数を全部記録して、
// 「誰に」「何を」届けたかまで見る。exit code だけ見ると、宛先が変わっても
// 本文が空になっても素通りする。

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeKeyPaths, parseWorkflow } from "../helpers/workflow-yaml.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW = path.join(
  HERE,
  "..",
  "..",
  "..",
  ".github",
  "workflows",
  "link-check.yml"
);

const yaml = () => fs.readFileSync(WORKFLOW, "utf8");

/**
 * lychee を走らせるステップと、それを含む job を、パース結果から `id: lychee` で取る。
 * **名前でも字面でも探さない。** 通知ステップが読むのは `steps.lychee`(= この id のステップ)の
 * outputs と outcome なので、守る設定はこのステップに付いていないと効かない。名前の字面で
 * 最初の一致を取っていたころは、同じ名前の囮を手前に置けば本物の設定を壊しても緑になり、
 * ファイル全体の照合はコメント行に残した字面でも通った(#879)。
 * **id は大文字小文字をそろえて比べ、全部の job から数える。** runner は `steps` を大文字小文字を
 * 区別せずに引く(actions/runner の DictionaryContextData.cs が OrdinalIgnoreCase。ソースを読んだ
 * だけで実行はしていない)。厳密に比べると、本物を `id: LYCHEE` にして別の job に `id: lychee` の
 * 囮を置く形で、本物を壊しても緑になった。
 * **`steps.lychee` を読むステップと同じ job にあることも見る。** `steps` は同じ job の中でしか
 * 引けないので、本物の id を別名にして別の job に `id: lychee` の囮を置くと、通知ステップが読む
 * ものと検査が読むものが分かれる(本物から時間制限を外しても緑になった)。
 * マージキーは GitHub が展開しないのに yaml が展開しうるので、使っていること自体で落とす
 * (workflow-yaml.mjs の parseWorkflow のコメント)。
 */
function lycheeStep(src = yaml()) {
  assert.deepEqual(mergeKeyPaths(src), [], "マージキーを使っている");
  const jobs = Object.entries(parseWorkflow(src)?.jobs ?? {});
  const found = jobs.flatMap(([jobName, job]) =>
    (job?.steps ?? [])
      .filter((step) => String(step?.id ?? "").toLowerCase() === "lychee")
      .map((step) => ({ jobName, job, step }))
  );
  assert.equal(found.length, 1, `id: lychee のステップが ${found.length} 個`);
  const readers = jobs
    .filter(([, job]) =>
      (job?.steps ?? []).some((step) =>
        // id には `-` も使えるので、`steps.lychee-src` は別のステップとして読む
        /steps\.lychee(?![\w-])/i.test(JSON.stringify(step ?? {}))
      )
    )
    .map(([jobName]) => jobName);
  assert.deepEqual(
    readers,
    [found[0].jobName],
    `steps.lychee を読む job(${readers.join(", ")})と id: lychee のステップの job(${found[0].jobName})が違う`
  );
  return found[0];
}

/**
 * レポートのファイル名は、ワークフローの `output:` から取る。**テストに書き写さない。**
 * 写すと、正当な一斉リネーム(YAML と参照 5 箇所を揃えて変える)でテストだけが取り残され、
 * 8 件が失敗する（実測）。名前が変わったこと自体は下の「出力先とシェルが読むファイル名が
 * 一致している」が見るので、ここは追随するだけでよい。
 */
const REPORT_FILE = (() => {
  const output = lycheeStep().step.with?.output;
  assert.ok(
    typeof output === "string" && /^\S+$/.test(output),
    "lychee の output: を読み取れない"
  );
  return output;
})();
const RE_REPORT = REPORT_FILE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * 通知ステップ(テストが走らせる `run:` を持つステップ)と、それを含む job を、パース結果から取る。
 * **名前でも字面でも探さない。** 複数行の `run:` を持つステップを全部の job から数え、1 つであることを
 * 求める。名前の字面と最初の `run: |` で探していたころは、本物の lychee の id を別名にして時間制限を外し、
 * 本物の通知ステップを `steps.<別名>` に付け替え、同じ job に `id: lychee` の囮と同じ名前の通知ステップの
 * 囮を置くと、本物を壊しても緑になった(#886)。
 * **`if:` と `env:` が読む `steps` は、すべて `lycheeStep()` のステップを指すことを求める。** `steps` は
 * 同じ job の中でしか引けないので、job も同じであることを見る。`steps['x']` の形や `steps` を含む別の語も
 * `steps.lychee` と数えないので赤になる(安全側に倒している)。
 */
function reportStep(src = yaml()) {
  const lychee = lycheeStep(src);
  const found = Object.entries(parseWorkflow(src)?.jobs ?? {}).flatMap(
    ([jobName, job]) =>
      (job?.steps ?? [])
        .filter(
          (step) => typeof step?.run === "string" && step.run.includes("\n")
        )
        .map((step) => ({ jobName, job, step }))
  );
  assert.equal(
    found.length,
    1,
    `複数行の run: を持つステップが ${found.length} 個`
  );
  const [report] = found;
  assert.equal(
    report.jobName,
    lychee.jobName,
    `通知ステップの job(${report.jobName})と id: lychee のステップの job(${lychee.jobName})が違う`
  );
  const read = JSON.stringify([
    report.step.if ?? null,
    report.step.env ?? null,
  ]);
  const all = read.match(/\bsteps\b/gi) ?? [];
  const toLychee = read.match(/\bsteps\.lychee(?![\w-])/gi) ?? [];
  assert.ok(toLychee.length > 0, "通知ステップが steps.lychee を読んでいない");
  assert.equal(
    toLychee.length,
    all.length,
    `通知ステップの if: と env: が lychee 以外の steps を読んでいる: ${read}`
  );
  return report;
}

/**
 * 通知ステップの `run:` を、パース結果のまま取り出す(行単位で切り出していたころの字面の取り出しはやめた)。
 */
function extractRunBlock(src = yaml()) {
  return reportStep(src).step.run;
}

/**
 * キーを大文字小文字をそろえて引く。GitHub がワークフローのキーを大文字小文字を区別して読むかは
 * 確かめていないので、区別しない読みでも効くように拾う。
 */
const keysOf = (obj, name) =>
  obj !== null && typeof obj === "object"
    ? Object.keys(obj).filter((k) => k.toLowerCase() === name)
    : [];

/**
 * 通知ステップの作業ディレクトリを変える設定の位置を返す(空なら、どこにも無い)。
 * 見るのは、通知ステップ・それを含む job の `defaults.run`・ワークフロー直下の `defaults.run` の 3 か所。
 * `defaults.run` は `run:` のステップにだけ効く(GitHub の公式ドキュメント)ので、lychee(`uses:`)は
 * workspace の直下にレポートを書いたまま、シェルだけが別の場所を読む。
 */
function workingDirectories(src = yaml()) {
  const workflow = parseWorkflow(src);
  const { jobName, job, step } = reportStep(src);
  const inDefaults = (owner, at) =>
    keysOf(owner, "defaults").flatMap((d) =>
      keysOf(owner[d], "run").flatMap((r) =>
        keysOf(owner[d][r], "working-directory").map(
          (w) => `${at}${d}.${r}.${w}`
        )
      )
    );
  return [
    ...keysOf(step, "working-directory").map(
      (w) => `jobs.${jobName}.steps(通知).${w}`
    ),
    ...inDefaults(job, `jobs.${jobName}.`),
    ...inDefaults(workflow, ""),
  ];
}

/**
 * 本文へ載せるレポートの上限バイト数を、ワークフロー本体から読む。
 * **テスト側に数値を写さない。** 写すとワークフローを変えたときにここだけ古くなる。
 */
function truncationLimit() {
  const m = extractRunBlock().match(
    new RegExp(`^ *head -c (\\d+) ${RE_REPORT}$`, "m")
  );
  assert.ok(m, "head -c の上限が読み取れない");
  return Number(m[1]);
}

const REPORT = [
  "# Summary",
  "",
  "| 🚫 Errors      | 1     |",
  "",
  "## Errors per input",
  "",
  "* [404] <https://example.invalid/gone> | Rejected status code: 404 Not Found",
].join("\n");

/**
 * Report broken links ステップを 1 回走らせる。
 *
 * @param existing  `gh issue list` が返す番号。空文字なら「open な Issue 無し」。
 * @param report    レポート(`output:` のファイル)の中身。null なら作らない。
 * @param fail      失敗させる gh サブコマンド('issue list' / 'issue comment' / 'issue create')。
 *                  gh が失敗したときに**赤くなる**ことを固定するために使う。ここが緑のまま
 *                  通ると、API エラーで通知が消えても誰も気づけない。
 * @param exitCode  lychee の終了コード(`LYCHEE_EXIT_CODE`)。レポートを出せなかった回の
 *                  本文に載る。
 * @param outcome   lychee ステップの outcome(`LYCHEE_OUTCOME`)。continue-on-error を
 *                  適用する**前**の結果。`exitCode='0'` と `outcome='failure'` の組で
 *                  「1 本もリンクを見なかった回」を表す。
 */
function runStep({
  existing = "",
  report = REPORT,
  fail = null,
  exitCode = "2",
  outcome = "success",
} = {}) {
  const dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "linkcheck-"))
  );
  const stubs = path.join(dir, "stubs");
  fs.mkdirSync(stubs);

  if (report !== null) fs.writeFileSync(path.join(dir, REPORT_FILE), report);

  // gh のスタブ。issue list は与えた番号を返し、create / comment は本文を控える。
  // **引数を全部記録する。** 宛先(どの Issue にコメントしたか)とラベルは
  // exit code に出ないので、記録しないと検証できない。
  fs.writeFileSync(
    path.join(stubs, "gh"),
    `#!/usr/bin/env bash
set -uo pipefail
printf '%s\\n' "$*" >> "$DIR/gh-args"
if [ -n "\${FAIL_ON:-}" ] && [ "$1 \${2:-}" = "$FAIL_ON" ]; then
  echo "HTTP 403: Resource not accessible by integration" >&2
  exit 1
fi
case "$1 \${2:-}" in
  "label create") ;;
  "issue list") cat "$DIR/existing" ;;
  "issue create")
    prev=""
    for a in "$@"; do
      if [ "$prev" = "--body-file" ]; then cp "$a" "$DIR/created-body"; fi
      prev="$a"
    done
    echo "https://example.invalid/issues/1"
    ;;
  "issue comment")
    prev=""
    for a in "$@"; do
      if [ "$prev" = "--body-file" ]; then cp "$a" "$DIR/commented-body"; fi
      prev="$a"
    done
    echo "https://example.invalid/issues/1#comment"
    ;;
  *) echo "unexpected gh: $*" >&2; exit 1 ;;
esac
`,
    { mode: 0o755 }
  );

  fs.writeFileSync(path.join(dir, "existing"), existing ? `${existing}\n` : "");

  const script = path.join(dir, "step.sh");
  fs.writeFileSync(script, extractRunBlock());

  const res = spawnSync("bash", [script], {
    cwd: dir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${stubs}:${process.env.PATH}`,
      DIR: dir,
      GH_TOKEN: "stub",
      RUN_URL: "https://example.invalid/actions/runs/12345",
      LYCHEE_EXIT_CODE: exitCode,
      LYCHEE_OUTCOME: outcome,
      ...(fail ? { FAIL_ON: fail } : {}),
    },
  });

  const read = (f) => {
    const p = path.join(dir, f);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  };
  const out = {
    code: res.status,
    out: `${res.stdout}${res.stderr}`,
    ghArgs: (read("gh-args") ?? "").trim().split("\n").filter(Boolean),
    createdBody: read("created-body"),
    commentedBody: read("commented-body"),
  };
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

const calls = (r, prefix) => r.ghArgs.filter((a) => a.startsWith(prefix));

test("open な Issue が無ければ、新しく Issue を立てる", () => {
  const r = runStep({ existing: "" });
  assert.equal(r.code, 0, r.out);
  assert.equal(calls(r, "issue create").length, 1, r.ghArgs.join(" / "));
  assert.equal(
    calls(r, "issue comment").length,
    0,
    "新規のはずがコメントしている"
  );
  assert.match(r.createdBody, /週次の自動リンクチェックが問題を検出しました/);
  // タイトルは「リンク切れ」と名乗らない。lychee は Errors 0 / Timeouts 1 でも
  // 非ゼロ終了する(実測)ので、切れていない回に「Broken links detected」と出ていた。
  assert.match(calls(r, "issue create")[0], /Link check found problems/);
});

test("open な Issue があるときは、握り潰さずコメントする", () => {
  const r = runStep({ existing: "90" });
  assert.equal(r.code, 0, r.out);
  // これが今回塞いだ穴そのもの。ここが 0 件になったら、検出は再びどこにも出なくなる。
  assert.equal(
    calls(r, "issue comment").length,
    1,
    "既存 Issue にコメントしていない"
  );
  assert.equal(calls(r, "issue create").length, 0, "Issue を増やしている");
});

test("コメントの宛先は、見つかった Issue 番号である", () => {
  const r = runStep({ existing: "4242" });
  const call = calls(r, "issue comment")[0];
  assert.ok(call, "コメントが呼ばれていない");
  assert.match(call, /\b4242\b/, `宛先が違う: ${call}`);
});

test("コメントにもレポート本体と run URL が入る", () => {
  const r = runStep({ existing: "90" });
  assert.ok(r.commentedBody, "コメント本文が記録されていない");
  // 要約だけにして中身を落とすと、読み手は毎回 run を開く羽目になる。
  assert.match(r.commentedBody, /Errors per input/);
  assert.match(r.commentedBody, /example\.invalid\/gone/);
  assert.match(r.commentedBody, /actions\/runs\/12345/);
  // 放置の代償を書いておく。`/close/` だけだと、元からある
  // 「修正が完了したらこの Issue を close してください」でも通ってしまう。
  assert.match(r.commentedBody, /新しい Issue は立ちません/);
});

test("新規 Issue の本文にもレポート本体が入る", () => {
  const r = runStep({ existing: "" });
  assert.match(r.createdBody, /Errors per input/);
  assert.match(r.createdBody, /example\.invalid\/gone/);
  assert.match(r.createdBody, /actions\/runs\/12345/);
});

test("新規 Issue には link-check ラベルが付く", () => {
  const r = runStep({ existing: "" });
  // このラベルは次回以降の重複判定(gh issue list --label link-check)の入力そのもの。
  // 落ちると毎週 Issue が増える。
  assert.match(calls(r, "issue create")[0], /link-check/);
});

// レポートが「読めるか」で分けた回について。このステップは lychee が非ゼロで
// 終わったときにしか走らない。集計まで到達した回は必ず `# Summary` から始まる
// markdown が出るので、それが無い回は lychee が集計前に落ちたと読む。
//
// **「空かどうか」では分けられない。** pin した action は出力先を先に作るので、
// lychee が 1 バイトも書かずに落ちてもフッタ 1 行の非空ファイルが残る(後述の
// 「lychee が集計に到達しなかった回も、レポート扱いしない」で固定している)。
//
// 以前はここで黙って exit 0 していた。lychee は continue-on-error なので job も緑になり、
// 「毎週走っているのに永久に何も出ない」状態が成立していた。

test("レポートが空でも、通知だけは出す", () => {
  const r = runStep({ existing: "", report: "" });
  assert.equal(r.code, 0, r.out);
  // 何が切れたかは分からない。分からないこと自体を届ける。
  assert.equal(
    calls(r, "issue create").length,
    1,
    "レポートが無いと黙って終わっている"
  );
});

test("レポートが無くても、通知だけは出す", () => {
  const r = runStep({ existing: "", report: null });
  assert.equal(r.code, 0, r.out);
  assert.equal(
    calls(r, "issue create").length,
    1,
    "レポートが無いと黙って終わっている"
  );
});

test("レポートを出せなかった回は、リンク切れと別のタイトルで立てる", () => {
  const r = runStep({ existing: "", report: null });
  const call = calls(r, "issue create")[0];
  // 同じタイトルにすると、「チェックが動かなかった」が「リンクが切れた」に化ける。
  assert.match(
    call,
    /could not produce a report/,
    `タイトルが区別されていない: ${call}`
  );
  assert.doesNotMatch(call, /found problems/);
});

test("レポートを出せなかった回は、lychee の終了コードを本文に載せる", () => {
  const r = runStep({ existing: "", report: null, exitCode: "77" });
  // 唯一の手がかりなので落とさない。
  assert.match(r.createdBody, /77/, "終了コードが本文に無い");
  assert.match(r.createdBody, /何が切れたかは分かりません/);
  assert.match(r.createdBody, /actions\/runs\/12345/);
});

test("終了コードが取れなかったときは unknown と書く", () => {
  // action がクラッシュして output を書けないと、この値は空文字で届く
  // ＝まさにこのケースの主役。`:-` を `-` にすると「終了コード: 」と尻切れになる。
  const r = runStep({ existing: "", report: null, exitCode: "" });
  assert.match(
    r.createdBody,
    /終了コード: unknown/,
    `空のまま出ている: ${r.createdBody}`
  );
});

test("新規 Issue には、次に何をすればいいかが書いてある", () => {
  // lead(何が起きたか)だけでは動けない。分岐ごとに宛先が違う。
  const found = runStep({ existing: "" });
  assert.match(
    found.createdBody,
    /差し替えか代替リンク/,
    "対処の手がかりが無い"
  );
  const missing = runStep({ existing: "", report: null });
  assert.match(
    missing.createdBody,
    /Download and extract lychee/,
    "対処の手がかりが無い"
  );
  // 取り違えると、レポートが無いのに「URL を差し替えろ」と言うことになる。
  assert.doesNotMatch(missing.createdBody, /差し替えか代替リンク/);
});

test("レポートが無い回のコメントは、存在しないレポートを読ませない", () => {
  const r = runStep({ existing: "90", report: null });
  assert.doesNotMatch(
    r.commentedBody,
    /下のレポートに/,
    "無いレポートを参照させている"
  );
  assert.match(r.commentedBody, /照合できる URL の一覧もありません/);
});

test("コメントにも、次に何をすればいいかが載る", () => {
  // 新規 Issue にだけ hint を載せると、既存 Issue が open の間ずっと
  // 「何が起きたか」だけが積まれ、「どうすればいいか」は誰にも届かない。
  const r = runStep({ existing: "90", report: null });
  assert.match(
    r.commentedBody,
    /Download and extract lychee/,
    "対処の手がかりが無い"
  );
});

test("lychee が集計に到達しなかった回も、レポート扱いしない", () => {
  // pin した action は出力先を mktemp で先に作るので、lychee が panic しても
  // フッタ 1 行だけの**非空**ファイルが残る(entrypoint.sh:73 の [ ! -f ] は
  // 決して真にならない)。`-s` だけで判定すると、この回が「リンク切れを検出した」
  // 扱いになり、中身がフッタ 1 行だけの Issue が立つ。
  const footerOnly =
    "[Full Github Actions output](https://example.invalid/runs/1)\n";
  const r = runStep({ existing: "", report: footerOnly });
  assert.equal(r.code, 0, r.out);
  const call = calls(r, "issue create")[0];
  assert.match(
    call,
    /could not produce a report/,
    `フッタだけの出力を検出扱いしている: ${call}`
  );
  assert.match(r.createdBody, /チェックそのものが完走しなかった/);
});

test("Summary は行頭の見出しとして探す", () => {
  // `grep -q 'Summary'` に緩めると、本文のどこかに Summary という語がある
  // フッタ壊れレポートまで「読める」判定になる。lychee の markdown 出力は
  // `# Summary` を先頭行に置くので、行頭の見出しとして縛る。
  const mentionsSummary =
    "Some prose that says Summary in passing.\n[Full Github Actions output](https://example.invalid/runs/1)\n";
  const r = runStep({ existing: "", report: mentionsSummary });
  const call = calls(r, "issue create")[0];
  assert.match(
    call,
    /could not produce a report/,
    `語の出現だけで検出扱いしている: ${call}`
  );
});

test("レポートが無い回の日付は「実行日」と書く", () => {
  // 何も検出していないので「検出日」は嘘になる。
  const missing = runStep({ existing: "", report: null });
  assert.match(missing.createdBody, /実行日 \(UTC\)/, `日付ラベルが実態と違う`);
  assert.doesNotMatch(missing.createdBody, /検出日 \(UTC\)/);
  // 検出があった回は従来どおり「検出日」。
  const found = runStep({ existing: "" });
  assert.match(found.createdBody, /検出日 \(UTC\)/);
});

test("レポートを出せなかった回は、ありもしない修正を促さない", () => {
  const r = runStep({ existing: "", report: null });
  // 直すべきリンクは 1 つも報告されていない。「修正が完了したら close」と書くと、
  // 読み手は存在しないリンク切れを探しに行く。close の案内は両分岐で共通なので、
  // 検出があった回にも成り立つ中立な言い方にする。
  assert.match(r.createdBody, /対応が終わったらこの Issue を close/);
  assert.doesNotMatch(r.createdBody, /修正が完了したら/);
});

test("コメントの冒頭は、検出が無かった回でも嘘にならない", () => {
  // lychee が転んだ回は「検出」がゼロ。冒頭で「別の検出がありました」と言うと、
  // すぐ下の lead(「何が切れたかは分かりません」)と真正面から矛盾する。
  const r = runStep({ existing: "90", report: null });
  assert.doesNotMatch(r.commentedBody, /別の検出がありました/);
  assert.match(
    r.commentedBody,
    /この Issue が open の間に、別の報告がありました/
  );
});

test("レポートを出せなかった回も、既存 Issue があればコメントに回る", () => {
  const r = runStep({ existing: "90", report: null });
  // ここを別経路にすると、「Issue を増やさない」が裏口から壊れる。
  assert.equal(
    calls(r, "issue comment").length,
    1,
    "既存 Issue にコメントしていない"
  );
  assert.equal(calls(r, "issue create").length, 0, "Issue を増やしている");
  assert.match(r.commentedBody, /レポートを出せずに終了しました/);
});

// ここまでは「見つけた既存 Issue をどう扱うか」。以下は「既存 Issue をどう探すか」。
// 探し方が壊れると、扱い方が正しくても結果は同じだけ悪くなる — 別ラベルを見に行けば
// 毎週 Issue が増え、closed も対象にすれば新規 Issue が二度と立たない。
// スタブは結果を注入するだけなので、照会そのものは引数を見るしかない。

test("既存 Issue は link-check ラベルの open だけを探す", () => {
  const r = runStep({ existing: "90" });
  const call = calls(r, "issue list")[0];
  assert.ok(call, "gh issue list が呼ばれていない");
  // ラベルが外れる/変わると、無関係な Issue にレポートを投げるか、毎週 Issue が増える。
  // `\b` では止まらない — ハイフンの直前でも成立するので `link-check-v2` が素通りする。
  assert.match(call, /--label link-check(?=\s|$)/, `照会ラベルが違う: ${call}`);
  // closed まで拾うと、閉じた Issue にコメントし続けて新規が立たなくなる。
  assert.match(call, /--state open(?=\s|$)/, `照会する状態が違う: ${call}`);
});

test("探すラベルと、新規作成で付けるラベルが一致している", () => {
  // 片方だけ改名すると、次の週から既存 Issue を見つけられず毎週 Issue が増える。
  // どちらの呼び出しも実際の引数から取るので、ラベル名をテストに写さずに突き合わせられる。
  // スタブは `$*` で記録するので引用符は落ちている。create 側はカンマ区切りの 1 語。
  const listed = calls(runStep({ existing: "90" }), "issue list")[0].match(
    /--label (\S+)/
  )[1];
  const created = calls(runStep({ existing: "" }), "issue create")[0]
    .match(/--label (\S+)/)[1]
    .split(",");
  assert.ok(
    created.includes(listed),
    `作成時のラベル ${created.join(",")} に、照会するラベル ${listed} が無い`
  );
});

test("既存 Issue の番号は先頭 1 件だけを取り、無ければ空にする", () => {
  const r = runStep({ existing: "90" });
  const call = calls(r, "issue list")[0];
  // `empty` に潰すと常に新規作成になり、`.[]` にすると番号が複数行で返って宛先が壊れる。
  assert.match(call, /\.\[0\]\.number/, `番号の取り出し方が違う: ${call}`);
  // `// empty` が落ちると、0 件のとき jq が `null` を返す。`[ -n "null" ]` は真なので
  // コメント分岐へ入り、`gh issue comment null` で落ちる。赤くはなるが、
  // 「最初の 1 件が Issue にならない」形で落ちるので、ここで縛っておく。
  assert.match(
    call,
    /\/\/ empty/,
    `0 件のときに空を返す形になっていない: ${call}`
  );
});

test("gh issue list が失敗したら、ステップごと落ちる", () => {
  const r = runStep({ existing: "90", fail: "issue list" });
  // ここで握り潰すと「既存 Issue 無し」と誤認して Issue を量産する。
  assert.notEqual(r.code, 0, "API エラーなのに成功扱いになっている");
  assert.equal(calls(r, "issue create").length, 0);
  assert.equal(calls(r, "issue comment").length, 0);
});

test("gh issue comment が失敗したら、ステップごと落ちる", () => {
  const r = runStep({ existing: "90", fail: "issue comment" });
  // 通知が消えたのに job が緑だと、今回直した穴がそのまま戻る。
  assert.notEqual(r.code, 0, "コメントに失敗したのに成功扱いになっている");
});

test("gh issue create が失敗したら、ステップごと落ちる", () => {
  const r = runStep({ existing: "", fail: "issue create" });
  assert.notEqual(r.code, 0, "Issue 作成に失敗したのに成功扱いになっている");
});

// 次の 3 件は run: ブロックの外側。ステップに届く前に潰される経路は、
// スクリプトをいくら走らせても見えない。
//
// **インデントまで固定する。** YAML は同じキーが階層違いで並ぶので、
// 深さを見ないと「どこかに 1 行あれば緑」になる。実際 `^ +issues: write$` は、
// job 側を read に落としてワークフロー全体に write を足すと素通りした
// (実効権限は job 側＝read なので、本番では通知だけが 403 で消える)。
// 姉妹リポ(portfolio / okinawa-in-data)の同名テストも同じ深さで締めている。

test("通知ステップは lychee が異常終了した回に走る", () => {
  // `!= '0'` を `== '0'` にすると、検出があった回にだけ走らなくなる。
  // 挙動は「毎回 Issue が立たない」で、CI は緑のまま。今回直した穴と同型。
  //
  // **テストが走らせる run: のステップで見る。** 条件だけを探すと、同じ行を別のステップへ移しても
  // 通ってしまう(通知ステップは起動条件を失って毎回走るようになる)。名前の字面とペアで見ていた
  // ころは、同じ名前の囮に字面どおりの if: を持たせると通った(#886)。式全体と比べるのは、
  // 後ろに `&& github.event_name == 'schedule'` のような絞り込みを足す変更を止めるため。
  assert.equal(
    reportStep().step.if,
    "steps.lychee.outputs.exit_code != '0' || steps.lychee.outcome == 'failure'"
  );
});

test("Issue を書く権限が job に宣言されている", () => {
  // read に落ちると、検出はあるのに通知だけが 403 で消える。
  assert.match(yaml(), /^ {6}issues: write$/m);
});

test("lychee ステップは continue-on-error で、通知ステップを skip させない", () => {
  // **この 1 行が「必ず人に届く」の前提。** 通知ステップの if: はステータス関数を
  // 含まないので、GitHub は暗黙に success() を前置する(公式ドキュメント)。
  // continue-on-error が外れると、lychee が転んだ回は conclusion が failure になり、
  // success() が偽 → **通知ステップごと skip** される。
  // つまり「lychee 自体が壊れた回に通知する」というこの PR の目的が、
  // ワークフローの別の行 1 つで無効化される。
  // `id:` も一緒に縛る。消えると `steps.lychee.outputs.exit_code` が空文字になり、
  // `'' != '0'` が真＝**リンクが全部生きていても毎週 Issue が立つ**。
  assert.match(
    yaml(),
    /^ {6}- name: Run lychee\n {8}id: lychee\n(?: {8}.*\n)*? {8}continue-on-error: true$/m
  );
});

test("lychee の終了コードが env で渡っている", () => {
  // レポートを出せなかった回の唯一の手がかり。テストハーネスは環境変数を
  // 直接注入するので、**YAML の env: が消えてもシェル側のテストは緑になる**。
  // 配線そのものをここで見る(RUN_URL と同じ扱い)。
  assert.equal(
    reportStep().step.env?.LYCHEE_EXIT_CODE,
    "${{ steps.lychee.outputs.exit_code }}"
  );
});

test("レポートの有無は 1 回だけ判定する", () => {
  // タイトル・案内文・本文が別々に `[ -s <レポート> ]` を見ていると、
  // 片方だけずれても動いてしまう(「リンク切れを見つけた」というタイトルの Issue に
  // 「レポートは出ませんでした」が入る)。判定は 1 箇所に集約する。
  const block = extractRunBlock();
  const checks =
    block.match(new RegExp(`\\[ +-s +${RE_REPORT} +\\]`, "g")) ?? [];
  assert.equal(
    checks.length,
    1,
    `レポート有無の判定が ${checks.length} 箇所ある`
  );
  assert.match(block, /has_report=/, "判定結果を変数に控えていない");
});

test("通知本文に入れる run URL が env で渡っている", () => {
  // キーの存在だけ見ると、値を潰しても通る。run URL は上限で切られた続き
  // (アーティファクト)へ辿る唯一の導線なので、式ごと固定する。
  assert.equal(
    reportStep().step.env?.RUN_URL,
    "${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
  );
});

test("長いレポートは切り詰められ、切ったことが本文に出る", () => {
  // Issue 本文には上限がある。切り詰め自体は必要だが、黙って切ると
  // 「レポートに出ていない = 検出されていない」と読まれる。
  //
  // **上限の値はテストに写さない。** 写すとワークフロー側を変えたときにここだけ
  // 古くなる。読み取った
  // 上限の**すぐ内側と、すぐ外側**に目印を置く。余白を大きく取ると、`head -c` を
  // 何割か変えても両方の assert を満たしてしまい、感度が桁で粗くなる。
  const limit = truncationLimit();
  const kept = "KEPT-JUST-INSIDE-THE-LIMIT\n";
  const cut = "CUT-JUST-OUTSIDE-THE-LIMIT\n";
  const head = `${REPORT}\n`;
  const margin = 10;

  // kept の末尾が上限の margin バイト内側、cut の先頭が margin バイト外側に来るよう詰める。
  const fill =
    limit - Buffer.byteLength(head) - Buffer.byteLength(kept) - margin;
  assert.ok(fill > 0, `上限が小さすぎて fixture を組めない: ${limit}`);
  const long =
    head +
    "x".repeat(fill) +
    kept +
    "y".repeat(margin * 2) +
    cut +
    "z".repeat(100);

  const r = runStep({ existing: "", report: long });
  assert.equal(r.code, 0, r.out);
  assert.match(
    r.createdBody,
    /KEPT-JUST-INSIDE-THE-LIMIT/,
    "上限の内側まで載っていない"
  );
  assert.doesNotMatch(
    r.createdBody,
    /CUT-JUST-OUTSIDE-THE-LIMIT/,
    "上限を超えて載っている"
  );
  assert.match(
    r.createdBody,
    /末尾を省略しました/,
    "切ったことが書かれていない"
  );
});

test("切り詰める長さと、注記を出す閾値が同じ値である", () => {
  // この 2 つは対でないと意味がない。注記側だけ大きくすると、本文は上限で
  // 切れているのに「省略しました」が出ない — このテスト群が防ごうとしている
  // 読み違い(出ていない = 検出されていない)そのものが起きる。
  // 両方ワークフローから読むので、数値はテストに写らない。
  const block = extractRunBlock();
  const cut = block.match(new RegExp(`^ *head -c (\\d+) ${RE_REPORT}$`, "m"));
  const note = block.match(
    new RegExp(
      `^ *if \\[ "\\$\\(wc -c < ${RE_REPORT}\\)" -gt (\\d+) \\]; then$`,
      "m"
    )
  );
  assert.ok(cut, "切り詰める長さが読み取れない");
  assert.ok(note, "注記を出す閾値が読み取れない");
  assert.equal(
    note[1],
    cut[1],
    `切り詰めは ${cut[1]} なのに注記の閾値が ${note[1]}`
  );
});

test("上限に届かないレポートには省略注記を付けない", () => {
  // `-gt` を `-ge` や `-gt 0` にすると、短いレポートにも「省略しました」が付き、
  // 読み手は出ていない URL があると誤解する。
  const r = runStep({ existing: "", report: REPORT });
  assert.doesNotMatch(r.createdBody, /末尾を省略しました/);
});

// 1 本もリンクを見なかった回について。pin した action は `failIfEmpty`(既定 true)が
// 効くと、**lychee の終了コードを 0 のまま残して自分だけ exit 1 する**
// (entrypoint.sh:61-62 のコメントが明言)。`exit_code != '0'` だけを見ていると
// この回は通知が skip され、lychee は continue-on-error なので job も緑になる。
// = 週次チェックが恒久的に no-op になっても誰も気づけない。

test("1 本も見なかった回も、通知だけは出す", () => {
  const r = runStep({ existing: "", exitCode: "0", outcome: "failure" });
  assert.equal(r.code, 0, r.out);
  assert.equal(
    calls(r, "issue create").length,
    1,
    "0 件の回に黙って終わっている"
  );
});

test("1 本も見なかった回は、検出とも未完走とも別のタイトルで立てる", () => {
  const r = runStep({ existing: "", exitCode: "0", outcome: "failure" });
  const call = calls(r, "issue create")[0];
  // 「問題を検出した」でも「レポートを出せなかった」でもない。設定の問題。
  assert.match(
    call,
    /found no links to check/,
    `タイトルが区別されていない: ${call}`
  );
  assert.doesNotMatch(call, /found problems/);
  assert.doesNotMatch(call, /could not produce a report/);
});

test("1 本も見なかった回は、設定を疑わせる案内を出す", () => {
  const r = runStep({ existing: "", exitCode: "0", outcome: "failure" });
  assert.match(r.createdBody, /1 本もリンクを見ませんでした/);
  assert.match(r.createdBody, /走査対象のパターン/, "対処の手がかりが無い");
  // リンク切れの話にすり替えない。
  assert.doesNotMatch(r.createdBody, /差し替えか代替リンク/);
  assert.match(
    r.createdBody,
    /実行日 \(UTC\)/,
    "検出していないのに「検出日」と書いている"
  );
});

test("1 本も見なかった回も、既存 Issue があればコメントに回る", () => {
  const r = runStep({ existing: "90", exitCode: "0", outcome: "failure" });
  assert.equal(
    calls(r, "issue comment").length,
    1,
    "既存 Issue にコメントしていない"
  );
  assert.equal(calls(r, "issue create").length, 0, "Issue を増やしている");
  assert.match(r.commentedBody, /1 本もリンクを見ませんでした/);
});

test("lychee が正常終了した回は、0 件扱いにしない", () => {
  // outcome が success なら failIfEmpty は効いていない。ここを取り違えると、
  // 検出があった回まで「設定の問題」と案内してしまう。
  const r = runStep({ existing: "", exitCode: "2", outcome: "failure" });
  const call = calls(r, "issue create")[0];
  assert.match(
    call,
    /found problems/,
    `検出のある回を 0 件扱いしている: ${call}`
  );
});

test("lychee の outcome が env で渡っている", () => {
  // ハーネスは環境変数を直接注入するので、**YAML の env: が消えてもシェル側のテストは
  // 緑になる**。0 件の回を見分ける唯一の手がかりなので、配線そのものをここで見る。
  assert.equal(
    reportStep().step.env?.LYCHEE_OUTCOME,
    "${{ steps.lychee.outcome }}"
  );
});

test("通知ステップは continue-on-error で黙らない", () => {
  // lychee 側は continue-on-error が**あること**を固定しているのに、通知側は
  // **無いこと**を誰も見ていなかった。1 行足すだけで gh の 403 が job に伝わらなくなり、
  // 「gh が失敗したら赤くなる」を固定した 3 本が丸ごと無意味になる(シェルの exit code は
  // 非ゼロのままなので、走らせる形のテストでは原理的に捕まらない)。
  assert.deepEqual(
    keysOf(reportStep().step, "continue-on-error"),
    [],
    "通知ステップの失敗が握り潰される"
  );
});

test("レポートのアップロードは、欠けていても job を落とさない", () => {
  // Upload は lychee と通知の間にある。`if-no-files-found: error` にすると job が failure に
  // なり、通知ステップの暗黙の success() が偽 → **レポートが出なかった回にだけ**通知が
  // 消える。この PR の主目的をピンポイントで無効化する経路なので塞ぐ。
  // pin した upload-artifact(043fb46)の既定は warn。
  const src = yaml();
  const step = src.slice(src.indexOf("      - name: Upload report"));
  const head = step.slice(
    0,
    step.indexOf("      # **exit_code だけでは足りない。**")
  );
  assert.doesNotMatch(
    head,
    /if-no-files-found:\s*error/,
    "レポート欠落で job が落ちる"
  );
  // 欠落以外の理由(API エラー等)で落ちても同じことが起きるので、ステップごと
  // 「落ちない」ようにする。ここが failure になると通知ステップの暗黙の success() が
  // 偽になり、**アップロードの失敗という無関係な理由で通知だけが消える**。
  assert.match(
    head,
    /^ {8}continue-on-error: true$/m,
    "アップロードの失敗が通知を殺す"
  );
});

test("lychee の出力先と、シェルが読むファイル名が一致している", () => {
  // ここがずれると、通知は毎週出るのに中身は永久に「レポートを出せませんでした」になる。
  // **名前をテストに書き写さず**、YAML の output: とシェル本体を突き合わせる。
  //
  // **部分一致で見ない。** `includes()` にすると `output: report.md` へ変えても、シェル側の
  // `lychee-report.md` が `report.md` を部分文字列として含むため素通りする(変異試験で実測)。
  // シェルが実際に読んでいる名前を取り出して、完全一致で突き合わせる。
  const out = lycheeStep().step.with?.output;
  assert.ok(typeof out === "string", "lychee の output: を読み取れない");
  const block = extractRunBlock();
  const guard = block.match(/\[ +-s +(\S+) +\]/);
  const cut = block.match(/^ *head -c \d+ (\S+)$/m);
  assert.ok(guard && cut, "シェルが読むファイル名を取り出せない");
  assert.equal(
    guard[1],
    out,
    `有無の判定が ${guard[1]} を見ている(output: は ${out})`
  );
  assert.equal(cut[1], out, `本文へ載せるのが ${cut[1]}(output: は ${out})`);
});

test("通知ステップは作業ディレクトリを変えない", () => {
  // 上の検査は名前の文字列しか比べない。通知ステップか job の defaults.run に
  // `working-directory: dist` を置くと、名前は一致したまま、lychee は workspace の直下に書き、
  // シェルは dist の下を読む。`[ -s <レポート> ]` が常に偽になり、検出のある回もすべて
  // 「could not produce a report」で届いてレポート本文が Issue に載らない(#886)。
  assert.deepEqual(workingDirectories(), [], "シェルが読む場所がずれる");
});

test("作業ディレクトリの検査は、3 か所と大文字の書き方を拾う", () => {
  // 実ファイルには 1 つも無いので、上のテストだけでは検査が no-op に落ちても緑のまま。
  // 置き場所ごとに足した fixture で、拾えることを確かめる
  const src = yaml();
  const name = "      - name: Report broken links\n";
  const runsOn = "    runs-on: ubuntu-latest\n";
  const jobs = "\njobs:\n";
  for (const anchor of [name, runsOn, jobs])
    assert.equal(src.split(anchor).length, 2, `${anchor.trim()} が 1 つでない`);
  const cases = [
    [
      "通知ステップ",
      src.replace(name, `${name}        working-directory: dist\n`),
    ],
    [
      "通知ステップ(大文字)",
      src.replace(name, `${name}        Working-Directory: dist\n`),
    ],
    [
      "job の defaults.run",
      src.replace(
        runsOn,
        `${runsOn}    defaults:\n      run:\n        working-directory: dist\n`
      ),
    ],
    [
      "ワークフロー直下の defaults.run",
      src.replace(
        jobs,
        `\ndefaults:\n  run:\n    working-directory: dist\n${jobs}`
      ),
    ],
  ];
  for (const [where, broken] of cases)
    assert.equal(workingDirectories(broken).length, 1, `${where}を拾えない`);
});

test("lychee の出力形式は markdown で固定されている", () => {
  // 判定に `# Summary` を使っているので、形式が変わると毎回「レポートを出せなかった」に
  // 化ける。通知は出続けるが中身が永久に失われるので、空振りより気づきにくい。
  assert.equal(lycheeStep().step.with?.format, "markdown");
});

test("0 件を検出できる設定が固定されている", () => {
  // 「1 本も見なかった回も通知する」は、`failIfEmpty` が true のときに action が
  // 非ゼロ終了することに全面的に依存している。false にすると lychee も action も
  // 0 終了 = 通知ステップが skip され、**週次チェックが恒久的に no-op になる**。
  // しかもその設定方法は、0 件の回の Issue 本文に lychee 自身が書き込む。
  // lychee ステップの with: の中で見る。別のステップへ移すと lychee には既定値が効くが、
  // 明示している意味(読み手が false にしない)が消える。
  assert.equal(
    lycheeStep().step.with?.failIfEmpty,
    true,
    "0 件の回を検出できなくなる"
  );
});

test("lychee-action は読解した版に pin されている", () => {
  // 3 分岐の設計は、この pin の entrypoint.sh の挙動そのもの(exit_code を残して
  // action だけが exit 1 する / mktemp で出力先を先に作る)に依っている。
  // **上げるときは entrypoint.sh を読み直すこと。**
  // uses: の値全体と比べる。部分一致だと、別の版を指したうえで SHA をコメントに残す形が通る。
  assert.equal(
    lycheeStep().step.uses,
    "lycheeverse/lychee-action@e7477775783ea5526144ba13e8db5eec57747ce8"
  );
});

// 時間切れについて。job の timeout-minutes に当たると GitHub は job を**取り消す**ので、
// 通知ステップの暗黙の success() が偽になり、Issue は立たない(run の結果に残るだけ)。
// lychee ステップに job より短い制限を置くと、runner はそのステップを Failed として扱い、
// continue-on-error が outcome=failure に変えて job を続ける(lychee-action は
// composite なので actions/runner の CompositeActionHandler.cs が Failed を立て、
// StepsRunner.cs の ApplyContinueOnError が outcome に残す)。exit_code の output は
// 書かれないので空文字で届く。

test("lychee の時間制限は job より十分に短い", () => {
  // 外すか job 以上にすると、固まった回は job ごと取り消されて通知が消える。
  // **「短い」だけでは足りない。** lychee の前後のステップと、時間切れの kill が job の
  // 制限の内側に収まらないと、やはり job が先に取り消される(29 / 30 でも `<` は通る)。
  // 2026-10-12〜11-16 に schedule で走った 6 回の実測で、前(job 開始 → lychee 開始)は最大
  // 34 秒、後(lychee 終了 → job 終了)は最大 13 秒。kill は runner が SIGINT と SIGTERM を
  // 送って待つので、合わせて 15 秒ほど(ProcessInvoker.cs。姉妹リポ okinawa-in-data の読解)。
  // 差の下限 5 分は実測からの導出ではなく余裕の判断。
  // 制限の値そのものは両方ワークフローから読む(テストに写さない)。
  const MIN_MARGIN_MINUTES = 5;
  // job の制限は lychee のステップを含む job の値で見る。ファイル全体だと、手前に足した
  // 別の job の値で判定してしまう。
  const { job, step } = lycheeStep();
  const stepLimit = step["timeout-minutes"];
  const jobLimit = job["timeout-minutes"];
  assert.ok(
    Number.isInteger(stepLimit),
    "lychee ステップに timeout-minutes が無い"
  );
  assert.ok(
    Number.isInteger(jobLimit),
    "job の timeout-minutes が読み取れない"
  );
  // 0 は runner では「制限なし」(StepsRunner.cs の `timeoutMinutes > 0`)なのに、
  // 差の計算では 30 分の余裕に見える。
  assert.ok(stepLimit >= 1, "lychee の制限が 0 分(制限なし)になっている");
  assert.ok(
    jobLimit - stepLimit >= MIN_MARGIN_MINUTES,
    `lychee の制限 ${stepLimit} 分と job の ${jobLimit} 分の差が ${MIN_MARGIN_MINUTES} 分に届かない`
  );
});

test("lychee が時間切れになった回は、0 件ではなく未完走として届く", () => {
  // exit_code は空、outcome は failure。0 件の判定を `${LYCHEE_EXIT_CODE:-0}` のように
  // 緩めると、この回が「1 本もリンクを見なかった」に化けて設定を疑わせる。
  const footerOnly =
    "[Full Github Actions output](https://example.invalid/runs/1)\n";
  const r = runStep({
    existing: "",
    report: footerOnly,
    exitCode: "",
    outcome: "failure",
  });
  assert.equal(r.code, 0, r.out);
  const call = calls(r, "issue create")[0];
  assert.match(call, /could not produce a report/, `分岐が違う: ${call}`);
  assert.match(r.createdBody, /終了コード: unknown/);
  assert.match(r.createdBody, /has timed out/, "時間切れを疑う手がかりが無い");
});

test("この検査自身が PR の CI に配線されている", () => {
  // `assert-test-*` は「glob 0 件 / 中身が空 / 全件 skip」を止めるが、その**手前**の
  // 「そもそも CI で走るか」は誰も見ていない。checks.yml からステップを 1 行消すと、
  // このファイルは緑のまま CI から完全に消える。
  //
  // **ステップ名では探さない。** 名前を書き写すと改名だけで赤くなる。守りたいのは
  // 「この run: が !cancelled() の下にある」ことなので、run: 行に直接括り付ける。
  const b = fs.readFileSync(
    path.join(HERE, "..", "..", "..", ".github", "workflows", "checks.yml"),
    "utf8"
  );
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
});

test("run: | ブロックは 1 つだけ(テストが別のステップを走らせていない)", () => {
  const src = fs.readFileSync(WORKFLOW, "utf8");
  const count = src.split("\n").filter((l) => /^\s+run: \|\s*$/.test(l)).length;
  // extractRunBlock はパース結果で複数行の run: を 1 つに限っている(reportStep)。
  // 字面でも数えておくと、2 つ目が増えたときにどちらの数え方でも落ちる。
  assert.equal(
    count,
    1,
    `run: | が ${count} 個ある。extractRunBlock の前提が崩れている`
  );
});

test("lychee のステップは、名前ではなく id: lychee で取る", () => {
  // 名前で取る形に戻すと、手前に置いた同じ名前の囮の値を読んで緑になる(#879)。
  // 実ファイルの lychee ステップの format を json にし、markdown を持つ囮を手前に置く
  const head = "      - name: Run lychee\n        id: lychee\n";
  const decoy =
    "      - name: Run lychee\n        if: false\n        uses: lycheeverse/lychee-action@e7477775783ea5526144ba13e8db5eec57747ce8\n        with:\n          format: markdown\n";
  const src = yaml();
  assert.equal(src.split(head).length, 2, "lychee ステップの先頭が 1 つでない");
  assert.equal(
    src.split("          format: markdown\n").length,
    2,
    "format: markdown が 1 つでない"
  );
  const broken = src
    .replace("          format: markdown\n", "          format: json\n")
    .replace(head, decoy + head);
  assert.equal(lycheeStep(broken).step.with?.format, "json");
  // id が重なると、どちらを取るか決まらない。runner は大文字小文字を区別せずに引くので、
  // 大文字の id も同じ id として数える
  const upper = head
    .replace("Run", "Rerun")
    .replace("id: lychee", "id: LYCHEE");
  assert.throws(
    () => lycheeStep(src.replace(head, `${upper}${head}`)),
    /id: lychee のステップが 2 個/
  );
  // 本物の id を別名にして別の job に囮を置くと、通知ステップの steps.lychee は囮を指さない
  const otherJob = `${src.replace(head, head.replace("id: lychee", "id: scan")).trimEnd()}\n\n  decoy:\n    runs-on: ubuntu-latest\n    steps:\n${decoy.replace("        if: false\n", "        id: lychee\n")}`;
  assert.throws(() => lycheeStep(otherJob), /steps\.lychee を読む job/);
  // 別の job が `steps.lychee-src` を読むだけなら、steps.lychee の読み手に数えない
  const hyphenJob = `${src.trimEnd()}\n\n  other:\n    runs-on: ubuntu-latest\n    steps:\n      - id: lychee-src\n        run: "true"\n      - if: steps.lychee-src.outcome == 'failure'\n        run: "true"\n`;
  assert.doesNotThrow(() => lycheeStep(hyphenJob));
});

test("通知ステップは、走らせる run: のステップをパース結果で取る", () => {
  // #886 の形: 本物の lychee の id を scan にして時間制限を外し、本物の通知ステップを
  // steps.scan に付け替え、同じ job の手前に id: lychee の囮と同じ名前の通知ステップの囮を置く。
  // 名前の字面と最初の `run: |` で探していたころは、これが緑のまま通った
  const head = "      - name: Run lychee\n        id: lychee\n";
  const limit = "        timeout-minutes: 20\n";
  const src = yaml();
  assert.equal(src.split(head).length, 2, "lychee ステップの先頭が 1 つでない");
  assert.equal(src.split(limit).length, 2, "lychee の時間制限が 1 つでない");
  const decoys = (run) =>
    [
      "      - name: Run lychee",
      "        id: lychee",
      "        if: false",
      "        uses: lycheeverse/lychee-action@e7477775783ea5526144ba13e8db5eec57747ce8",
      "        continue-on-error: true",
      "        timeout-minutes: 20",
      "      - name: Report broken links",
      "        if: steps.lychee.outputs.exit_code != '0' || steps.lychee.outcome == 'failure'",
      "        env:",
      "          LYCHEE_EXIT_CODE: ${{ steps.lychee.outputs.exit_code }}",
      "          LYCHEE_OUTCOME: ${{ steps.lychee.outcome }}",
      run,
      "",
    ].join("\n");
  // 本物の通知ステップの参照は、置き換えてから囮を差し込む(囮の参照は steps.lychee のまま)
  const broken = (
    run,
    repoint = (s) => s.replaceAll("steps.lychee.", "steps.scan.")
  ) =>
    repoint(src.replace(limit, "")).replace(
      head,
      `${decoys(run)}${head.replace("id: lychee", "id: scan")}`
    );
  // lychee の側の検査は囮で通る。止めるのは通知ステップの側であることを確かめる
  assert.doesNotThrow(() => lycheeStep(broken('        run: "true"')));
  // 囮の run: が 1 行なら、走らせるのは本物の通知ステップで、それが steps.scan を読む
  assert.throws(
    () => reportStep(broken('        run: "true"')),
    /通知ステップが steps\.lychee を読んでいない/
  );
  // 一部だけを付け替えても止まる(env の outcome だけが steps.scan を読む)
  const outcomeOnly = (s) =>
    s.replace(
      "LYCHEE_OUTCOME: ${{ steps.lychee.outcome }}",
      "LYCHEE_OUTCOME: ${{ steps.scan.outcome }}"
    );
  assert.notEqual(outcomeOnly(src), src, "付け替える env が見つからない");
  assert.throws(
    () => reportStep(broken('        run: "true"', outcomeOnly)),
    /lychee 以外の steps を読んでいる/
  );
  // 囮にも複数行の run: を持たせると、どちらを走らせるか決まらない
  assert.throws(
    () => reportStep(broken("        run: |\n          true")),
    /複数行の run: を持つステップが 2 個/
  );
});
