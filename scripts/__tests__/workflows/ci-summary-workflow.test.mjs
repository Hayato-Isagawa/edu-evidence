// ci-summary.yml の「全 Actions が成功したときだけ PR に 1 件コメントする」判定を固定する。
//
// このステップは壊れても**静かに**壊れる。失敗時に何もしない設計なので、判定が
// 崩れて通知が消えても workflow は exit 0 のまま、PR の check 一覧にも出ない
// (run は既定ブランチの sha に紐づく)。気づく手段は「通知が来なかった」しかない。
//
// 走らせるのは**ワークフローに埋まっている本体**(写しではない)。run の写し(fixture)は、
// workflow 全体を固定するテストで本体と比べるためだけに置いている。gh はスタブに
// 差し替え、`--jq` のフィルタは実 jq に通す — `.app.slug == "github-actions"` の絞り込みが
// 無いと、Cloudflare Workers Builds の check-run(workflow_run を起こさない)を待ち続けて
// 再判定の機会が無いまま通知が消える。フィルタを素通りさせると、その退行を検出できない。

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import {
  ambiguousYaml,
  mergeKeyPaths,
  parseWorkflow,
  triggerNames,
} from "../helpers/workflow-yaml.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOWS_DIR = path.join(HERE, "..", "..", "..", ".github", "workflows");
const WORKFLOW = path.join(WORKFLOWS_DIR, "ci-summary.yml");
const NOTIFY_RUN_FIXTURE = path.join(
  HERE,
  "..",
  "fixtures",
  "ci-summary",
  "notify-run.sh"
);
const yaml = () => fs.readFileSync(WORKFLOW, "utf8");
// 権限と if の検査はパース結果で見る。字面で見ると、`"permissions":` / `? permissions` /
// フロー形 / step の if / 先頭に置いた別の job など、YAML として等価な書き方が素通りする(#641)
// merge: true はマージキー(`<<:`)を展開する。既定では `<<` が 1 つのキーとして残り、
// `<<: {permissions: …}` と書いた権限が job の permissions に見えない(#735)
const doc = () => YAML.parse(yaml(), { merge: true });
const jobs = () => Object.entries(doc().jobs ?? {});
const steps = () => jobs().flatMap(([, job]) => job?.steps ?? []);

const SHA = "0123456789abcdef0123456789abcdef01234567";
const MARKER = `<!-- ci-summary: ${SHA} -->`;

/**
 * ワークフローの `run: |` ブロックを取り出す。
 * ci-summary.yml の `run: |` は通知ステップの 1 つだけ。
 * 2 つ目が増えたらこの前提が崩れるので、そのことも下でテストしている。
 */
function extractRunBlock(yamlPath) {
  const lines = fs.readFileSync(yamlPath, "utf8").split("\n");
  const start = lines.findIndex((l) => /^\s+run: \|\s*$/.test(l));
  assert.notEqual(start, -1, "run: | ブロックが見つからない");

  const body = lines.slice(start + 1);
  const indent = body[0].length - body[0].trimStart().length;
  const out = [];
  for (const line of body) {
    const isBlank = line.trim() === "";
    if (!isBlank && line.length - line.trimStart().length < indent) break;
    out.push(line.slice(indent));
  }
  return out.join("\n");
}

const checkRun = (name, status, conclusion, slug = "github-actions") => ({
  name,
  status,
  conclusion,
  app: { slug },
});
const ACTIONS_GREEN = [
  checkRun("Build site", "completed", "success"),
  checkRun("Playwright E2E", "completed", "success"),
  checkRun("auto-merge", "completed", "skipped"),
];

/**
 * 通知ステップを 1 回走らせる。
 *
 * @param checkRuns  `commits/{sha}/check-runs` が返す check_runs。
 * @param comments   `issues/{n}/comments` が返す既存コメント。文字列なら github-actions[bot] の
 *                   本文、`{ body, login, type, association }` なら作者も指定する(省いた項目は
 *                   github-actions[bot] の値。実 API では user.type が Bot、author_association が NONE)。
 *                   null なら API エラー(fixture 無し → exit 1)。
 * @param pulls      `commits/{sha}/pulls` が返す PR。`prFromEvent` が空のときだけ引かれる。
 * @param prFromEvent  `workflow_run.pull_requests[0].number` に相当する env。
 * @param self       `SELF`(job 名)。同名の check-run は除外される。
 */
function runStep({
  checkRuns = ACTIONS_GREEN,
  comments = [],
  pulls = [],
  prFromEvent = "42",
  self = "notify",
} = {}) {
  const dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "cisummary-"))
  );
  const stubs = path.join(dir, "stubs");
  fs.mkdirSync(stubs);

  fs.writeFileSync(
    path.join(dir, "check-runs.json"),
    JSON.stringify({ check_runs: checkRuns })
  );
  fs.writeFileSync(path.join(dir, "pulls.json"), JSON.stringify(pulls));
  if (comments !== null) {
    fs.writeFileSync(
      path.join(dir, "comments.json"),
      JSON.stringify(
        comments.map((c) => {
          const {
            body,
            login = "github-actions[bot]",
            type = "Bot",
            association = "NONE",
          } = typeof c === "string" ? { body: c } : c;
          return {
            body,
            user: { login, type },
            author_association: association,
          };
        })
      )
    );
  }

  // gh のスタブ。`api` の path で fixture を選び、`--jq` は**実 jq に通す**。
  // `-f body=` を持つ呼び出しは投稿として本文を控える。fixture が無い path は
  // 404 相当で失敗させる(API エラーが「未投稿」と読まれて二重投稿にならないことを見る)。
  fs.writeFileSync(
    path.join(stubs, "gh"),
    `#!/usr/bin/env bash
set -uo pipefail
printf '%s\\n' "$*" >> "$DIR/gh-args"
[ "$1" = "api" ] || { echo "unexpected gh: $*" >&2; exit 1; }
filter=""; prev=""; body=""; endpoint=""
for a in "$@"; do
  case "$prev" in
    --jq) filter="$a" ;;
    -f) body="\${a#body=}" ;;
  esac
  case "$a" in
    repos/*) endpoint="$a" ;;
  esac
  prev="$a"
done
if [ -n "$body" ]; then
  printf '%s' "$body" > "$DIR/commented-body"
  echo '{}'
  exit 0
fi
case "$endpoint" in
  */check-runs) fixture="$DIR/check-runs.json" ;;
  */pulls) fixture="$DIR/pulls.json" ;;
  */comments) fixture="$DIR/comments.json" ;;
  *) echo "unexpected endpoint: $endpoint" >&2; exit 1 ;;
esac
if [ ! -f "$fixture" ]; then
  echo "gh: HTTP 404: Not Found ($endpoint)" >&2
  exit 1
fi
jq -r "$filter" "$fixture"
`,
    { mode: 0o755 }
  );

  const script = path.join(dir, "step.sh");
  fs.writeFileSync(script, extractRunBlock(WORKFLOW));

  const res = spawnSync("bash", [script], {
    cwd: dir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${stubs}:${process.env.PATH}`,
      DIR: dir,
      GH_TOKEN: "stub",
      GH_REPO: "example/repo",
      SHA,
      PR_FROM_EVENT: prFromEvent,
      SELF: self,
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
    commentedBody: read("commented-body"),
  };
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

test("jq が使える(スタブは --jq を実 jq に通す)", () => {
  const r = spawnSync("jq", ["--version"], { encoding: "utf8" });
  assert.equal(r.status, 0, "jq が PATH に無い。スタブが --jq を評価できない");
});

test("Actions が全部 success(auto-merge は skipped)なら、PR にコメントを 1 件付ける", () => {
  const r = runStep();
  assert.equal(r.code, 0, r.out);
  assert.ok(r.commentedBody, "コメントが投稿されていない");
  assert.match(r.commentedBody, /@Hayato-Isagawa/);
  assert.ok(r.commentedBody.includes(MARKER), "重複防止のマーカーが本文に無い");
  assert.ok(r.commentedBody.includes(SHA.slice(0, 7)), "短縮 sha が本文に無い");
  assert.equal(
    r.ghArgs.filter((a) => a.includes("-f body=")).length,
    1,
    r.ghArgs.join(" / ")
  );
  assert.match(
    r.ghArgs.find((a) => a.includes("-f body=")),
    /^api repos\/example\/repo\/issues\/42\/comments /
  );
});

test("Cloudflare の check-run が実行中でも、Actions が揃っていれば投稿する", () => {
  const r = runStep({
    checkRuns: [
      ...ACTIONS_GREEN,
      checkRun(
        "Workers Builds: site",
        "in_progress",
        null,
        "cloudflare-workers-and-pages"
      ),
    ],
  });
  assert.equal(r.code, 0, r.out);
  assert.ok(r.commentedBody, "Cloudflare を待ってしまい、投稿されていない");
});

test("Cloudflare の check-run が失敗していても、Actions だけを見る", () => {
  const r = runStep({
    checkRuns: [
      ...ACTIONS_GREEN,
      checkRun(
        "Workers Builds: site",
        "completed",
        "failure",
        "cloudflare-workers-and-pages"
      ),
    ],
  });
  assert.equal(r.code, 0, r.out);
  assert.ok(r.commentedBody, "Cloudflare の失敗で投稿が止まっている");
});

test("Actions に実行中があれば、何もせず次の完了に任せる", () => {
  const r = runStep({
    checkRuns: [
      checkRun("Build site", "completed", "success"),
      checkRun("Playwright E2E", "in_progress", null),
    ],
  });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.commentedBody, null, "揃う前に投稿している");
  assert.match(r.out, /still running/);
});

test("Actions に失敗があれば投稿しない(failure / cancelled / timed_out)", () => {
  for (const conclusion of ["failure", "cancelled", "timed_out"]) {
    const r = runStep({
      checkRuns: [
        checkRun("Build site", "completed", "success"),
        checkRun("Playwright E2E", "completed", conclusion),
      ],
    });
    assert.equal(r.code, 0, `${conclusion}: ${r.out}`);
    assert.equal(r.commentedBody, null, `${conclusion} なのに投稿している`);
    assert.match(r.out, /not notifying/);
  }
});

test("Actions の check-run が 1 つも無ければ、何もしない", () => {
  const r = runStep({
    checkRuns: [
      checkRun(
        "Workers Builds: site",
        "completed",
        "success",
        "cloudflare-workers-and-pages"
      ),
    ],
  });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.commentedBody, null);
  assert.match(r.out, /no Actions check-runs/);
});

test("自分自身(SELF と同名の check-run)は判定から除く", () => {
  const r = runStep({
    checkRuns: [...ACTIONS_GREEN, checkRun("notify", "in_progress", null)],
    self: "notify",
  });
  assert.equal(r.code, 0, r.out);
  assert.ok(r.commentedBody, "自分の in_progress を待ってしまっている");
});

test("同じ sha のマーカーがあれば、二重に投稿しない", () => {
  const r = runStep({ comments: ["先行コメント", `✅ 前回\n${MARKER}`] });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.commentedBody, null, "二重投稿している");
  assert.match(r.out, /already commented/);
});

test("マーカーの後ろに大量のコメントがあっても、重複を見逃さない(SIGPIPE 回帰)", () => {
  // マーカーを先頭(古い側)に置き、その後ろに pipe 容量(64KB)を超える本文を並べる。
  // `gh ... | grep -q` だと grep が先に抜けて gh が SIGPIPE で落ち、pipefail が
  // 「未投稿」と読んで二重投稿になる(実 gh で再現済み)。順序が逆だと再現しない。
  const big = "x".repeat(5000);
  const r = runStep({
    comments: [MARKER, ...Array.from({ length: 40 }, () => big)],
  });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.commentedBody, null, "SIGPIPE 経路で二重投稿している");
});

test("同じ sha のマーカーでも github-actions[bot] 以外が書いたものは数えない", () => {
  // type と association は、オーナーと bot は実 API の値(2026-11-17 にこのリポのコメントで確認)、
  // someone と github-actions はリポに関わりの無い人を想定した値。user.type か、ここに並べた
  // author_association の値の 1 つを or で足して緩める書き換えは、どれかが赤にする。狭める形・組み合わせ・
  // fixture に無い項目や値で絞る形はここでは見ず、下の完全一致のテストが止める。
  for (const author of [
    { login: "someone", type: "User", association: "NONE" },
    { login: "github-actions", type: "User", association: "NONE" },
    { login: "Hayato-Isagawa", type: "User", association: "OWNER" },
    { login: "dependabot[bot]", type: "Bot", association: "CONTRIBUTOR" },
    {
      login: "cloudflare-workers-and-pages[bot]",
      type: "Bot",
      association: "NONE",
    },
  ]) {
    const r = runStep({
      comments: [{ body: `✅ 前回\n${MARKER}`, ...author }],
    });
    assert.equal(r.code, 0, `${author.login}: ${r.out}`);
    assert.ok(r.commentedBody, `${author.login}: 投稿されなかった`);
  }
});

test("印を探す取得と照合は完全一致で固定する(字面と、gh に実際に渡る --jq)", () => {
  // 例を並べる fixture では、fixture に無い項目や組み合わせで絞り込みを緩める・狭める
  // 書き換えを塞ぎきれない(#863)。取得・照合の 3 行をそのまま固定し、comments への代入も
  // 1 か所に限る。式を変えるときはこの期待値も直す
  const jq = '.[] | select(.user.login == "github-actions[bot]") | .body';
  const lines = extractRunBlock(WORKFLOW)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"));
  const assigns = lines.filter((l) => /\bcomments\+?=/.test(l));
  assert.equal(assigns.length, 1, `comments への代入: ${assigns.join(" / ")}`);
  const i = lines.indexOf(assigns[0]);
  assert.deepEqual(lines.slice(i - 1, i + 2), [
    'marker="<!-- ci-summary: ${SHA} -->"',
    `comments=$(gh api --paginate "repos/\${GH_REPO}/issues/\${pr}/comments" --jq '${jq}')`,
    'if [[ "$comments" == *"$marker"* ]]; then',
  ]);

  // 字面を残したまま別の変数で 2 回目の照合を足す形や、gh を関数で包んで --jq を差し替える形は、
  // 上では止まらない。スタブが記録した gh の呼び出しから check-runs の取得と投稿を除くと、
  // コメント一覧の取得 1 回(--jq は上の式)だけが残ることを見る。PR 番号を pulls から引く取得は、
  // その経路でだけ式ごと除く。パスで絞らないので、別のパス(issues/comments・pulls/{n}/comments
  // など)から取る形もここで赤になる。投稿まで進む経路(PR 番号をイベントから取るか pulls から
  // 引くか、bot のコメントが無いか有るか)は 2 × 2 の組み合わせを全部回し、この 2 つの分岐(と
  // その組み合わせ)の中に足した照合も拾う(3 通りだけでは、pulls から引きかつ bot のコメントが
  // あるときの照合が素通りした)。4 つの組み合わせが通らない条件(コメントの長さ・環境変数など)の
  // 分岐に足した照合と、スタブを通らない呼び出し(curl・`command -p gh`・絶対パスの gh など)は
  // ここでも見えない
  const checkRuns = `api --paginate repos/example/repo/commits/${SHA}/check-runs --jq `;
  const pullsRead = `api repos/example/repo/commits/${SHA}/pulls --jq .[0].number // empty`;
  const postCall = "api repos/example/repo/issues/42/comments -f body=";
  const prSources = [
    ["PR 番号はイベントから", {}],
    ["PR 番号は pulls から", { prFromEvent: "", pulls: [{ number: 42 }] }],
  ];
  const botComments = [
    ["bot のコメントなし", {}],
    ["bot の別のコメントあり", { comments: ["bot の別のコメント"] }],
  ];
  for (const [prLabel, prOpts] of prSources)
    for (const [commentLabel, commentOpts] of botComments) {
      const label = `${prLabel}・${commentLabel}`;
      const opts = { ...prOpts, ...commentOpts };
      const r = runStep(opts);
      assert.equal(r.code, 0, `${label}: ${r.out}`);
      assert.ok(r.commentedBody, `${label}: 投稿まで進んでいない`);
      // 投稿は部分一致ではなく先頭の形で見分け、どの経路でもちょうど 1 本であることを求める
      // (`-f body=` の字面を含むだけの照合を、投稿として除いてしまわないため)
      const posts = r.ghArgs.filter((a) => a.startsWith(postCall));
      assert.equal(posts.length, 1, `${label}: 投稿 ${posts.length} 本`);
      const others = r.ghArgs.filter(
        (a) =>
          !a.startsWith(checkRuns) &&
          !a.startsWith(postCall) &&
          a !== MARKER &&
          !(opts.prFromEvent === "" && a === pullsRead)
      );
      assert.deepEqual(
        others,
        [`api --paginate repos/example/repo/issues/42/comments --jq ${jq}`],
        label
      );
    }
});

test("workflow 全体が決まった形(run は fixture の写しと完全一致)", () => {
  // 上の検査は、回していない条件(コメントの長さ・環境変数など)の分岐に足した照合や、固定した 3 行を
  // 死んだコードにして別の変数で照合し直す形を塞げない(Hayato-Isagawa/edu-law#401)。ステップの外
  // (workflow や job の env・defaults・concurrency、トリガーの types・branches、needs で飛ばす job)
  // を書き換えても、通知は黙って止まる。写しを置かない原則の例外として、zizmor-workflow のテストと
  // 同じく workflow 全体をパース結果で固定し、run は fixture の写しと 1 文字ずつ比べる。テストが
  // 走らせる本文も同じ写しと比べる。マージキーは使わせない(GitHub は展開しないが、yaml は
  // `merge: false` でも `!!merge <<:` を展開して読むので、パース結果だけでは見えない)。workflows: の
  // 列挙だけは、PR で起動する workflow の name と過不足なく一致することを別のテストが見ているので、
  // 写さずにその値を受ける。ただしそのテストは名前を trim して比べるので、前後の空白はここで禁じる。
  // ci-summary.yml を変えるときは、期待値と fixture もコピーで直す
  const src = yaml();
  // 手元の yaml と GitHub で読みが食い違いうる書き方。何を拾うかと理由は共通ファイルの ambiguousYaml
  assert.deepEqual(ambiguousYaml(src), []);
  assert.deepEqual(mergeKeyPaths(src), [], "マージキーを使っている");
  const expected = fs.readFileSync(NOTIFY_RUN_FIXTURE, "utf8");
  const wf = YAML.parse(src, { merge: false });
  assert.deepEqual(wf, {
    name: "CI summary",
    on: {
      workflow_run: {
        workflows: wf?.on?.workflow_run?.workflows,
        types: ["completed"],
      },
    },
    permissions: { checks: "read", "pull-requests": "write" },
    concurrency: {
      group: "ci-summary-${{ github.event.workflow_run.head_sha }}",
      "cancel-in-progress": false,
    },
    jobs: {
      notify: {
        if:
          "github.event.workflow_run.event == 'pull_request' && " +
          "github.event.workflow_run.triggering_actor.login != 'dependabot[bot]'",
        "runs-on": "ubuntu-latest",
        "timeout-minutes": 5,
        steps: [
          {
            name: "Comment on the PR when every Actions check on the commit has succeeded",
            env: {
              GH_TOKEN: "${{ github.token }}",
              GH_REPO: "${{ github.repository }}",
              SHA: "${{ github.event.workflow_run.head_sha }}",
              PR_FROM_EVENT:
                "${{ github.event.workflow_run.pull_requests[0].number }}",
              SELF: "${{ github.job }}",
            },
            run: expected,
          },
        ],
      },
    },
  });
  const listed = wf.on.workflow_run.workflows;
  assert.ok(
    Array.isArray(listed) && listed.length > 0,
    "workflows: が空か配列でない"
  );
  for (const n of listed)
    assert.ok(
      typeof n === "string" && n !== "" && n === n.trim(),
      `workflows: の名前に前後の空白がある、または文字列でない: ${JSON.stringify(n)}`
    );
  assert.equal(extractRunBlock(WORKFLOW), expected, "テストが走らせる本文");
});

test("別の sha のマーカーしか無ければ投稿する(再 push は別扱い)", () => {
  const r = runStep({
    comments: ["<!-- ci-summary: ffffffffffffffffffffffffffffffffffffffff -->"],
  });
  assert.equal(r.code, 0, r.out);
  assert.ok(r.commentedBody, "別 sha のマーカーで止まっている");
});

test("PR 番号がイベントに無ければ、commits/{sha}/pulls から引く", () => {
  const r = runStep({ prFromEvent: "", pulls: [{ number: 7 }] });
  assert.equal(r.code, 0, r.out);
  assert.ok(
    r.ghArgs.some((a) => a.includes(`/commits/${SHA}/pulls`)),
    r.ghArgs.join(" / ")
  );
  assert.match(
    r.ghArgs.find((a) => a.includes("-f body=")),
    /\/issues\/7\/comments /
  );
});

test("PR が見つからなければ、何もしない", () => {
  const r = runStep({ prFromEvent: "", pulls: [] });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.commentedBody, null);
  assert.match(r.out, /no pull request found/);
});

test("コメント一覧の API が失敗したら、投稿せずステップごと落ちる", () => {
  // 失敗を「未投稿」と読んで投稿へ進むと二重投稿になる。赤で止まる方を取る。
  const r = runStep({ comments: null });
  assert.notEqual(r.code, 0, "API エラーを握り潰している");
  assert.equal(r.commentedBody, null, "API エラーなのに投稿している");
});

test("run: | ブロックは 1 つだけ(テストが別のステップを走らせていない)", () => {
  const count = yaml()
    .split("\n")
    .filter((l) => /^\s+run: \|\s*$/.test(l)).length;
  assert.equal(
    count,
    1,
    `run: | が ${count} 個ある。extractRunBlock の前提が崩れている`
  );
});

test("run: が読む値は env で渡っている(SELF は job 名)", () => {
  // SELF が空だと `grep -v -F ""` が全行を落として無音で終わる。キーだけでなく値も固定する。
  const src = yaml();
  for (const line of [
    /^ {10}GH_TOKEN: \$\{\{ github\.token \}\}$/m,
    /^ {10}GH_REPO: \$\{\{ github\.repository \}\}/m,
    /^ {10}SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}$/m,
    /^ {10}PR_FROM_EVENT: \$\{\{ github\.event\.workflow_run\.pull_requests\[0\]\.number \}\}$/m,
    /^ {10}SELF: \$\{\{ github\.job \}\}/m,
  ]) {
    assert.match(src, line);
  }
});

test("token の権限は check-run の参照とコメント投稿だけ", () => {
  assert.deepEqual(doc().permissions, {
    checks: "read",
    "pull-requests": "write",
  });
});

test("PR 由来の run だけを、Dependabot を除いて扱う", () => {
  // 字面ではなく notify の if の値で見る(コメント行に移しただけの式を拾わない)。
  // 部分一致だと `(… != 'dependabot[bot]' || true)` のように字面を残して無効にできるので、
  // 空白を詰めた式全体を固定する(#735)。式を変えるときはこの期待値も直す
  const cond = String(doc().jobs?.notify?.if ?? "")
    .replace(/\s+/g, " ")
    .trim();
  assert.equal(
    cond,
    "github.event.workflow_run.event == 'pull_request' && " +
      "github.event.workflow_run.triggering_actor.login != 'dependabot[bot]'"
  );
});

test("permissions: は workflow 直下の 1 か所だけ(job / step には置かない)", () => {
  // job 直下の `permissions:` は workflow 直下の宣言より優先される。job に `contents: write`
  // を足すと token の権限が静かに広がるが、workflow 直下だけを読む検査では緑のまま通る。
  assert.ok(doc().permissions, "workflow 直下に permissions: が無い");
  for (const [name, job] of jobs()) {
    assert.ok(
      !Object.hasOwn(job ?? {}, "permissions"),
      `job ${name} に permissions がある`
    );
  }
  for (const step of steps()) {
    assert.ok(
      !Object.hasOwn(step ?? {}, "permissions"),
      "step に permissions がある"
    );
  }
});

test("起動元の conclusion をどこにも使わない(job と step の if を含む)", () => {
  // conclusion を式のどこに置いても、最後に完了した workflow が skipped のとき再判定が
  // 走らず通知が消える。if に限らず env などの式に置いても値が変わるので、パース結果の
  // 全体(コメントは落ちる)で `workflow_run` に続く conclusion を禁じる。
  assert.doesNotMatch(
    JSON.stringify(doc()),
    /workflow_run\W+conclusion/,
    "起動元の conclusion を式で使っている"
  );
  // if はどこに置かれたかがわかる形でも見る
  const conds = [
    ...jobs().map(([name, job]) => [`job ${name}`, job?.if]),
    ...steps().map((step, i) => [`step ${i}`, step?.if]),
  ].filter(([, cond]) => cond !== undefined);
  assert.ok(conds.length > 0, "if: が 1 つも見つからない");
  for (const [where, cond] of conds) {
    assert.doesNotMatch(
      String(cond),
      /conclusion/,
      `${where} の if: に conclusion がある`
    );
  }
});

test("同じ commit の判定は head_sha で直列化する", () => {
  assert.match(
    yaml(),
    /^ {2}group: ci-summary-\$\{\{ github\.event\.workflow_run\.head_sha \}\}$/m
  );
  assert.match(yaml(), /^ {2}cancel-in-progress: false$/m);
});

// ---- トリガーと列挙の読み方 ----
// トリガーと列挙は、マージキーを展開せずに読み(`merge: false`)、マージキーを使っていれば落とす。
// GitHub Actions はマージキーを展開しない(actions/runner#1182 の回答。2026-10 時点)のに、yaml は
// `!!merge <<:` と `%YAML 1.1` の下の `<<:` を `merge: false` でも展開する(2.9.1 で実測)ので、読みが食い違って黙って緑になりうる
// (`workflow_run` の `<<: {workflows: …}` を列挙と読む、など)。権限の検査が `merge: true` で読む
// 理由(禁じる権限を見落とさない)とは別の話なので、そちらは変えない。

// マージキーの判定・`parseWorkflow`・`triggerNames` は共通ファイル(../helpers/workflow-yaml.mjs)に置いている。

/**
 * workflow 1 本について、PR で起動するならその name を、しないなら null を返す。
 * トリガーはパースした `on` から読み(triggerNames)、`if:` 式や ci-summary 自身の
 * `workflow_run.event == 'pull_request'` は拾わない。name か on: が読めなければ落とす —
 * 黙って null にすると、その workflow が列挙の照合から外れて緑のまま通る。
 */
function prWorkflowName(src, label) {
  assert.deepEqual(mergeKeyPaths(src), [], `${label} がマージキーを使っている`);
  const wf = parseWorkflow(src);
  assert.ok(
    typeof wf?.name === "string" && wf.name.trim(),
    `${label} に name: が無い`
  );
  const triggers = triggerNames(wf.on);
  assert.ok(triggers, `${label} の on: が読めない: ${JSON.stringify(wf.on)}`);
  return triggers.includes("pull_request") ? wf.name.trim() : null;
}

/**
 * ci-summary の `workflows:` を名前の列として読む。生の文字列を split すると、引用符付きの
 * name だけが片側で外れて食い違う。
 */
function listedWorkflows(src, label) {
  assert.deepEqual(mergeKeyPaths(src), [], `${label} がマージキーを使っている`);
  const listed = parseWorkflow(src)?.on?.workflow_run?.workflows;
  assert.ok(
    Array.isArray(listed) &&
      listed.length > 0 &&
      listed.every((n) => typeof n === "string" && n.trim()),
    `${label} の workflows: が名前の列として読めない: ${JSON.stringify(listed)}`
  );
  return listed.map((n) => n.trim());
}

test("on: は workflow_run だけで、workflows: の列挙は PR で起動する workflow の name と過不足なく一致する", () => {
  // PR 起動の workflow を足したのにここへ足し忘れると、その完了では再判定が走らない。
  // 期待側は prWorkflowName、列挙の側は listedWorkflows で、どちらもパース結果から読む。
  const expected = fs
    .readdirSync(WORKFLOWS_DIR)
    .filter((n) => /\.ya?ml$/.test(n) && n !== "ci-summary.yml")
    .map((f) =>
      prWorkflowName(fs.readFileSync(path.join(WORKFLOWS_DIR, f), "utf8"), f)
    )
    .filter((name) => name !== null);
  assert.deepEqual(
    listedWorkflows(yaml(), "ci-summary.yml").sort(),
    expected.sort()
  );
  // workflow_run: の行の ignore[dangerous-triggers] は on: 全体に効き、ここに足したトリガーの指摘も
  // zizmor から消える(1.31.1 で実測)。トリガーを足すなら、抑止を外して zizmor を当て直すこと。
  assert.deepEqual(
    Object.keys(YAML.parse(yaml(), { merge: true }).on ?? {}),
    ["workflow_run"],
    "on: に workflow_run 以外のトリガーがある(抑止がその指摘も黙らせる)"
  );
});

// ---- prWorkflowName / listedWorkflows の fixture(実ファイルでは通らない分岐を試す)----

const FIXTURE_JOBS =
  "jobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n";

test("prWorkflowName は 1 行形・列・マップ形の on: を読み、PR で起動するものだけ name を返す", () => {
  const ifOnly = FIXTURE_JOBS.replace(
    "    runs-on",
    "    if: github.event_name == 'pull_request'\n    runs-on"
  );
  for (const [label, src, expected] of [
    ["1 行形", `name: Build\non: pull_request\n${FIXTURE_JOBS}`, "Build"],
    ["列", `name: Build\non: [push, pull_request]\n${FIXTURE_JOBS}`, "Build"],
    [
      "マップ形(列 0 のコメントを挟む)",
      `name: Build\non:\n  push:\n# c\n  pull_request:\n    paths: [src/**]\n${FIXTURE_JOBS}`,
      "Build",
    ],
    [
      "引用符付きの name",
      `name: "Build"\non: pull_request\n${FIXTURE_JOBS}`,
      "Build",
    ],
    [
      "pull_request を含まない",
      `name: Build\non: [push]\n${FIXTURE_JOBS}`,
      null,
    ],
    [
      "if: にだけ pull_request とある",
      `name: Build\non: push\n${ifOnly}`,
      null,
    ],
  ]) {
    assert.equal(prWorkflowName(src, label), expected, label);
  }
});

test("prWorkflowName は読めない on: とマージキーで落ちる(黙って「起動しない」にしない)", () => {
  for (const [label, head, message] of [
    ["空の on:", "name: Build\non:\n", /on: が読めない/],
    ["空のマップ", "name: Build\non: {}\n", /on: が読めない/],
    ["空の列", "name: Build\non: []\n", /on: が読めない/],
    [
      "文字列でない要素を含む列",
      "name: Build\non: [push, 1]\n",
      /on: が読めない/,
    ],
    [
      "%YAML 1.1 の下(キーの on が真偽値として読まれる)",
      "%YAML 1.1\n---\nname: Build\non: pull_request\n",
      /on: が読めない/,
    ],
    ["true: と書いた形", "name: Build\ntrue: pull_request\n", /on: が読めない/],
    ["name: が無い", "on: pull_request\n", /name: が無い/],
    [
      "マージキー(!!merge は merge: false でも展開される)",
      "name: Build\non:\n  push:\n  !!merge <<: {pull_request: null}\n",
      /マージキーを使っている/,
    ],
  ]) {
    assert.throws(
      () => prWorkflowName(head + FIXTURE_JOBS, label),
      message,
      label
    );
  }
});

test("listedWorkflows は workflows: を名前の列として読み、読めない形とマージキーで落ちる", () => {
  const ci = (workflows) =>
    `name: CI summary\non:\n  workflow_run:\n${workflows}    types: [completed]\njobs: {}\n`;
  assert.deepEqual(
    listedWorkflows(ci('    workflows: ["Build", Checks]\n'), "引用符付き"),
    ["Build", "Checks"]
  );
  assert.deepEqual(
    listedWorkflows(
      ci("    workflows:\n      - Build\n      - Checks\n"),
      "ブロック形"
    ),
    ["Build", "Checks"]
  );
  for (const [label, workflows, message] of [
    [
      "文字列でない要素",
      "    workflows: [Build, 1]\n",
      /名前の列として読めない/,
    ],
    ["空の列", "    workflows: []\n", /名前の列として読めない/],
    ["workflows: が無い", "", /名前の列として読めない/],
    [
      "マージキー",
      "    !!merge <<: {workflows: [Build]}\n",
      /マージキーを使っている/,
    ],
  ]) {
    assert.throws(() => listedWorkflows(ci(workflows), label), message, label);
  }
});
