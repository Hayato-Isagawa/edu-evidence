# EduEvidence JP

日本の小学校教員向け教育エビデンスポータル。Astro 7 + React 19 + Tailwind 4 + TypeScript。

## ブランド

- **モチーフ**: 成熟した葉(葉脈の通った 1 枚の葉)。姉妹サイト EduWatch JP の「双葉(cotyledon)」と対になり、「積み上げてきたエビデンス」を象徴する
- **アクセント色**: 深緑 `#2b5d3a`(`--color-accent`)
- **ロゴ実装**: `src/components/Logo.astro` が inline SVG + `currentColor` 継承。色を変えたい時は呼び出し側の `color:` / Tailwind の `text-` クラスを変えるだけで済み、SVG を直接編集する必要なし

## 環境

Node.js のバージョンは `.tool-versions` で固定している(`nodejs 24.19.0`)。[mise](https://mise.jdx.dev/) を使う前提。

```bash
mise install               # .tool-versions に従って Node 24 を導入
npm ci                     # 依存をロックから復元
```

`package.json` の `engines.node` は `>=24.0.0`。CI やエディタ側もこれに合わせる。

## ビルド・テスト

```bash
npm run dev                # 開発サーバー(localhost:4322。ファミリー各リポで固定・4321 は未設定プロジェクト用に空けている)
npm run build              # 本番ビルド(OG画像74枚 + Pagefindインデックス生成、約2分)
npm run test:e2e           # Playwright E2Eテスト(65テスト・12ファイル=`playwright test --list` の数、ビルド後に実行)
npm run vrt                # ビジュアルリグレッションテスト(現 dist を撮影・比較。権威ある比較は CI、後述)
npm run a11y:baseline      # axe-core で a11y 違反一覧を再生成(dev 起動後 `node scripts/a11y-baseline.mjs http://localhost:<port>`)
npm run lint               # oxlint(correctness ルール。warning でも止める。.astro は frontmatter と <script> を見る)
npm run format             # oxfmt で整形(.ts/.js/.json 等。.astro / .md / .yml / .css / .html / wrangler.jsonc / テスト fixture は対象外。ADR 0037)
npm run format:check       # 同上の差分検査(CI はこちら)
npm run check              # Astro型チェック
npm run check:text         # textlint日本語校正
npm run check:consistency  # monthsGained 整合性チェック
npm run check:evidence-strength # エビデンス強度(★)整合性チェック
npm run check:stale        # lastVerified 期限切れチェック
npm run check:all          # 上記チェックを一括実行(手元用。CI の Content Checks は同じ script を個別 step で呼ぶ)
npm run test:gate          # 下 3 つの口が通す判定器(assert-test-*.mjs)自身の検証(判定器を通さない・check:all に含む)
npm run test:scripts       # 上の各ゲートが壊れた入力で確実に落ちることの回帰テスト(check:all に含む)
npm run test:workflows     # link-check.yml の通知分岐・VRT の配線・ci-summary.yml の通知判定の回帰テスト(下限つき・check:all に含む)
npm run test:hooks         # .claude/hooks/ の回帰テスト(下限つき・check:all に含む)
```

`test:workflows` が見ているのは、`link-check.yml` に埋め込まれた「検出をどう届けるか」の判定。
**壊れても静かに壊れる** — lychee は走り、レポートもアーティファクトに残り、job も緑のまま
**通知だけ**が消える。姉妹リポ okinawa-in-data では、open な link-check Issue があると後続の
検出を捨てており、2026-08-17 に見つかった 404 が 2 日間どこにも出なかった(okinawa-in-data
#107 / #110。このリポも同じコードを共有していた)。テストはワークフローから `run:` ブロックを
取り出して bash で走らせ、`gh` をスタブして渡された引数を全部記録する。**ワークフロー本体を取り出して走らせるので、
ワークフロー側を変えるとテスト対象も変わる。** 上限バイト数とレポートのファイル名は
ワークフローから読み取っていて、テストには写していない(写すとここだけ古くなる)。
シェルからは見えない YAML の配線(通知ステップに `continue-on-error` が無いこと・`output:` と
シェルが読むファイル名の一致など)も併せて固定している。

同じ口に `vrt-baseline.test.mjs` が同居している。VRT のベースラインを「main のコード ×
PR のコンテンツ」で撮る配線(ADR 0034)も、**壊れても CI は緑のまま**だから — 運ぶ素材を 1 つ
落としても、テストは走り、多くのページは通る。**一番腐りやすいのは運ぶ素材の allowlist** なので、
`src/` の実ディレクトリを走査して「運ぶ・`paths` で監視する・描画に入らないと明言する」の
三択を強制している。degraded フォールバックの失敗許容が **ビルド 1 つに閉じている**ことも固定している
(`||` の字面だけでなく `set +e` / `if !` の形も禁じている。字面だけだと、
`set +e` で囲む変異が 10/10 緑で通った)。

`vrt-targets.test.mjs` も同じ口にある。VRT の撮影が**静かに減る**経路(対象を消す・ループを絞る・
projects を削る・skip に落とす・`fullPage` を落とす・比較設定を緩める・比較ステップを撮り直しにする・
`use` や撮影コマンドの CLI フラグで断面を潰す・ステップを skip する・起動条件を狭める)は、
VRT 自身では捕まえられない — VRT は `paths` に載る PR でしか起動せず、減った残りは緑のまま通る。
撮影対象は `vrt/targets.mjs` にデータとして持ち、spec とテストが同じ配列を読む。件数は
`playwright test --list` の実出力と突き合わせ、`src/pages/` のテンプレートと 1 対 1 で対応することを
要求する(`/changelog` だけ除外)。**残る穴は spec の書き方そのもの**(`toHaveScreenshot` の第 2 引数での
上書き・実行時 `test.skip(条件)`・import 元の差し替え・`emulateMedia` でのテーマ上書き)で、`vrt/pages.spec.ts` 冒頭に注意書きがある。

`ci-summary-workflow.test.mjs` も同じ口。`ci-summary.yml`(PR の Actions が全部成功したときだけ PR に
@メンション付きコメントを 1 件付け、GitHub Mobile の通知を 1 回にまとめる)は失敗時に何もしない設計なので、
判定が崩れて通知が消えても workflow は exit 0 のまま。link-check と同じく `run:` を取り出して bash で
走らせ、`gh` はスタブに差し替える。`--jq` のフィルタは**実 jq に通す** — `.app.slug == "github-actions"` の
絞り込みが無いと Cloudflare の check-run(`workflow_run` を起こさない)を待ち続けて通知が消えるので、
フィルタを素通りさせると退行を検出できない。YAML 側は `workflows:` の列挙が「`on:` に `pull_request` を
持つ workflow の `name:`」と過不足なく一致することも見る(PR 起動の workflow を足したのに列挙し忘れると、
その完了では再判定が走らない)。

置き場所を `scripts/__tests__/workflows/` に分けているのは、`test:scripts` の glob
(`scripts/__tests__/*.test.mjs`)がサブディレクトリを拾わないため＝**二重実行しない**。

`test:scripts` / `test:workflows` / `test:hooks` は `assert-test-files.mjs` / `assert-test-results.mjs` を通している。
`node --test` は「glob が 0 件」「中身が空」「全件 skip」のどれでも exit 0 で終わるので、
守っているつもりのガードが no-op に落ちても気づけないため。

**その判定器自身は `test:gate` が検証する**(`scripts/__tests__/gate/assert-test-scripts.test.mjs`。
fixture を一時ディレクトリに作って判定器を spawn し、fail 1 件 / 下限割れ / skip / todo で exit 1、
空ファイルは pass 1 と数える、glob 0 件は assert-test-files が exit 1、を固定する)。
`if (problems.length)` を `if (false)` にする 1 行で 3 口とも恒久 exit 0 になっていた(実測)。
**この口だけは判定器を通さず、`node --test` の親も挟まない** — 判定器を通す口に置くと、判定器が
壊れたとき自己検証の失敗も同じ判定器に握り潰され、`node --test` の親を挟むと、親が `t.skip()` /
`{ todo: true }` 付きの失敗を skip / todo として集計し子の非 0 終了も落として exit 0 にする(実測)。
`node` でファイルを直接実行し(パスが無ければ exit 1)、判定器が塞ぐ「中身が空」は `test:workflows` の口が
行頭 `test(` の静的数で、「全件 skip」(`{ skip: true }` / `t.skip()` / `NODE_OPTIONS=--test-skip-pattern`
は静的数を変えずに 0 本実行にできる)は gate ファイル内の自己計数(末尾まで走った本数 ≠ 定数なら非 0
終了)で塞ぐ。自己計数の登録より前の `process.exit(0)` と、後から登録した exit ハンドラでの
`process.exitCode = 0` は自己計数では止まらないので、`test:workflows` の口が字面で禁じる(禁じているのは
列挙した形だけ)。fixture の spawn では `NODE_TEST_CONTEXT` / `NODE_TEST_WORKER_ID` を
落とす(`node --test` 配下で継承すると内側の `node --test` が「再帰呼び出し」として 0 件実行になる)。
**残る限界**: 判定器の故障と `test:gate` の無力化は、どの組でも 2 ファイルへの明示的な編集で通る /
実運用の引数だけに反応する早期 return(`if (minPass > 20) return 0;`)は小さな fixture では検出できない。

**下限の決め方は口ごとに違う。** `test:workflows` の 102 と `test:scripts` の 58 は実測ちょうど
(余裕ゼロ)なので、**テストを足したら下限も上げること**。`test:hooks` の 75 は実数追随ではなく
「1 ファイルを空にしても割る」境界値(`05f5b9e`。空ファイルも `node --test` は 1 pass と数えるので、総数 − 最小ファイルの本数 + 2)なので、実測 83 と離れていてよい。

**npm script の文字列と下限は、もう一方の口のテストが定数で完全一致固定している**
(`test:scripts` / `test:hooks` / `test:gate` は `scripts/__tests__/workflows/vrt-targets.test.mjs`、
`test:workflows` は `scripts/__tests__/check-scripts.test.mjs`。自分自身を縛ると、ファイルごと
消えたときに縛りも消える)。定数は守る対象から導出せず直接書いてある — ファイルの `test(` を
数えて突き合わせる形だと、中身を空にして下限を巻き戻す 2 手が素通りする。**テストを足したら
npm script と、もう一方の口にある定数の両方を直す**(ずれると相手の口が赤になる)。
`test:hooks` は境界値の式そのものを定数と照合しているので、最小ファイル以外に足したときだけ動く。

**`test(` は行頭にしか書かない。** 定数と突き合わせる静的数は行頭の `test(` しか数えないので、
ブロックや `for` の中・1 行 `for` の後ろ・`t.test(` の subtest・`test.only(`(`--test-only` 無しでも
走る)・`test.it(` / `test.describe(` は実行数だけを増やし、以後その 1 本ぶんの削除が無音になる
(#592 で実測)。相手の口のテストが行頭以外のテスト登録を赤にする(`check-scripts.test.mjs` の
`gate()` 本体 2 行だけ既知)。除外はコメント行(同じ行で閉じる `/* c */ test(` は除かない)と
正規表現**リテラル**直後の `.test(` だけ。**引用符の中も区別しない** — 直前が空白・記号なら赤
(安全側。テスト名・メッセージに字面を書かない)、`\ntest(` のように英数字が直前なら見えない。
**`node:test` の取り込みは `import test from "node:test";` / `const test = require("node:test");` の
2 形だけ** — `it` / `describe` の名前付き import・`import * as`・`import t from`・分割代入の `require` は
同じ検査が赤にする(`it(` は行頭に書いても静的数に載らない)。間接呼び出し(`(test)(`・`(0, test)(`・
`test?.(`・`test.call(` / `.apply(` / `.bind(`)も赤(#596)。残る穴の例: `test ("x")` の空白入り
(`oxfmt --check` が止める)/ 代入の別名(`const t = test; t(`)。変数の正規表現 `RE.test(x)` は偽陽性で赤。

この相互固定で塞げるのは「片方だけを静かに薄める」までで、限界が 2 つある: 相手側の定数まで
書き換える 3 手目を足せば通る / 相互固定している 2 つの口の script に同時に ` || true` を足せば
誰も赤にならない(`package.json` 内 2 行)。塞いでいるのは手数ではなく、どれもガード本体への
明示的な編集として diff に出ること。

`test:scripts` を余裕ゼロにしているのは、`check-consistency.ts` の検査が層ごとに 4 本の
`gate()` に分かれており、1 行消すとその層が丸ごと無防備になるため。`gate()` は 1 本で
2 テストなので、消えれば 58 を割る。

`glossary-inline.test.mjs` の 11 本と `remark-glossary.test.mjs` の 4 本も同じ下限に載っている。
用語ツールチップの変換は **壊れても CI が全緑のまま**で(型検査は型しか見ず、textlint は
Markdown ソースしか見ず、E2E も a11y 監査も属性値の中身までは届かない)、この 15 本が
唯一の観測点になる。

## プロジェクト構造

- `src/content/strategies/*.md` — 74の指導法(frontmatter + markdown body)
- `src/content/columns/*.md` — コラム31本
- `src/pages/` — Astroページ(ルーティング)
- `src/components/StrategyRow.astro` — 戦略カードコンポーネント
- `src/layouts/Layout.astro` — 共通レイアウト(ヘッダー・フッター・ツールチップJS)
- `src/data/glossary.ts` — 用語集データ(用語集ページ + ツールチップで共用)
- `src/data/faq.ts` / `src/data/policy-evidence.ts` — FAQ と政策対照表の本文。`.astro` から移したのは、VRT のベースラインへ運ばれる `src/data` に載せて本文の編集を中立化するため(ADR 0034)。同型で未移設: `seasonal/july.astro` の `scenes` / `guide/index.astro` の `guides`(データ定数)、`about.astro` / `guide/indicators.astro`(散文がマークアップ直書き)
- `src/plugins/remark-glossary.mjs` — remarkプラグイン(markdown本文の用語自動リンク)
- `src/lib/og-image.ts` — Satori + Sharp による動的OG画像生成
- `src/lib/glossary-inline.ts` — frontmatter テキスト内の用語ツールチップ変換
- `src/content.config.ts` — コンテンツコレクションのZodスキーマ

## コンテンツ編集の鉄則

**効果量(monthsGained)を推測で設定してはならない。** 必ず一次研究(メタ分析・RCT)をWebSearchで確認してから設定する。

出典の優先順位:
1. 日本の研究(★3以上) → `source: japan`
2. EEF Teaching and Learning Toolkit → `source: eef`
3. Hattie Visible Learning(上限寄りのため参考値扱い) → `source: hattie`
4. 複数ソース → `source: mixed`

## frontmatter スキーマ

詳細な型定義は `src/content.config.ts` を参照。主要フィールド:

- `title` / `summary` — 必須
- `monthsGained` — 効果量(月数換算、整数)。0 は「測って効果ほぼゼロ」
- `monthsUnmeasured` — 学力効果を月数で示せる研究が無いとき true(表示「測定なし」。`monthsGained: 0` のときだけ可)
- `evidenceStrength` / `cost` — 段階評価
- `subjects` / `grades` / `tags` — 分類
- `category` — カテゴリ(指導法 / 制度・環境 / 知っておくべき知見 / 認知科学 / 家庭・外部)
- `source` / `sourceUrl` / `sourceTitle` — 出典
- `evidence.{eef,japan,hattie}` — 出典別の詳細(併記用、オプション)
- `culturalContext` — 日本の文脈での注記
- `lastVerified` — 最終検証日(YYYY-MM-DD)
- `methodology` — 研究詳細(Technical Appendix、オプション)

## ソースバッジの仕組み

`StrategyRow.astro` と `[...slug].astro` は `evidence` オブジェクト内の eef/japan/hattie キーの**有無**でバッジを動的表示する。`source` フィールドはバッジ表示には使わない。

## 用語ツールチップ

2つの経路で動作:
1. **markdown body** — `remark-glossary.mjs` が初出用語を `<a class="glossary-tip">` に変換
2. **frontmatter テキスト** — `glossary-inline.ts` の `annotateGlossaryTerms()` で Astroテンプレート内のテキストを変換(`set:html` で使用)

ツールチップの表示JS は `Layout.astro` の `<script is:inline>` で共通DOM要素(`.glossary-bubble`)を生成。

## ビジュアルリグレッションテスト(VRT)

共有レイアウト・コンポーネント・`global.css` の改修による視覚回帰を、目視に頼らず差分画像で検出する仕組み(ADR 0024)。機能テスト(`e2e/`)とは別系統で併走する:

- **設定**: `playwright.vrt.config.ts`(`testDir: vrt/`、desktop 1280 / mobile 390 × light / dark の 4 projects(テーマは `colorScheme` のエミュレーションで与える。理由は同ファイルのコメント)、`threshold: 0` + `maxDiffPixels: 0`、`retries: 0`、アニメーション無効)
- **閾値は実測で決めている**。同一ビルド同士の撮り比べは差分 0(閾値 0 で 30 件全通過)。
  一方 `h2` の `letter-spacing` を 0.06em 変える実験では、旧閾値 0.01 だと 30 件中 2 件しか
  落ちなかった(0.001 では 19 件)。**全画面撮影に対して 1% は緩すぎる**。
  その後 ADR 0036 で比率そのものをやめた — 許容量がページの長さに比例して長いページほど甘く、
  Playwright が pixelmatch に渡す `threshold`(既定 0.2)未満の色差は比率を下げても数えられないため(edu-law の実測)
- **リトライは入れない**。差分が実測 0 なら、リトライは間欠的な問題を握り潰すだけになる
- **対象**: `vrt/targets.mjs` の 25 URL(`src/pages/` のテンプレート 26 本と 1 対 1。`/changelog` だけ #433 で対象外、問題が現れたのは #428 で理由は同ファイル冒頭)を `vrt/pages.spec.ts` がフルページ撮影。テンプレートを追加したら代表 URL を 1 行追記する — 忘れると `test:workflows` が赤にする。ダーク断面は #577 で追加(それまで 1 枚も撮っていなかった)
- **ゲート**: `.github/workflows/vrt.yml` が `pull_request` の `paths` で `src/layouts/**`・`src/components/**`・`src/styles/**`・`src/pages/**`(`changelog.astro` は除外)・`src/lib/**`・`src/plugins/**`・`astro.config.*`・`vrt/**`・`playwright.vrt.config.ts`・`package-lock.json`・自身に限定起動(`workflow_dispatch` で手動実行可)。
  `package-lock.json` は依存 bump で走らせるため(ADR 0035)。ただし auto-merge は required しか待たないので、非 major の bump では事後の記録にしかならない
  **`src/content/**` だけの PR では走らないが、「コンテンツ編集では起動しない」ではない** — 効果量の訂正は `guide/indicators.astro` などのテンプレートも同じ PR で触るので起動する(`faq.astro` / `policy-evidence.astro` の本文は `src/data/` に移したので、そちらの訂正では起動しない)。`src/data/**` は ADR 0034 でベースラインへ運ぶ素材にしたため、`paths` からは外してある
- **比較方式(案A + コンテンツ中立)**: CI 内で main と PR を両方ビルドし、同一 Linux 環境で撮影・比較する。ベースライン PNG はコミットしない(`vrt/__screenshots__/` は gitignore)。システムフォント描画の macOS↔Linux 差を回避するため。
  **main 側は「main のコード × PR のコンテンツ」でビルドする**(`src/content` / `src/data` / `src/content.config.ts` を運ぶ)。他ファイルのコンテンツ修正が波及しただけの赤を消すため(ADR 0034)。運ぶ素材の allowlist と degraded 経路は `scripts/__tests__/workflows/vrt-baseline.test.mjs` が固定している
- **逃がし**: コンテンツ側の値の**描画幅**をわざと変えるとき(PR #540 の「測定なし」導入のように、
  `+5ヶ月` → `測定なし` でバッジ幅と折り返しが変わる類)は、中立化すると両側に同じ文字列が入って
  差分が出ない。そのときは Actions から VRT を `workflow_dispatch` で `neutral: false` にして
  手動実行し、素の main ベースラインと撮り比べる
- **ローカル**: `npm run vrt` で現在の `dist` を撮影・比較できる。権威ある 2 ビルド差分は CI 側
- **required check 非対象**: `paths` で限定起動するため main 保護(ADR 0022)の required には含めない(required にすると起動しなかった PR が塞がる)。マージ可否は編集者判断

## ホスティング

Cloudflare Workers の静的アセット配信(Workers Builds が GitHub main を監視して自動デプロイ)。
設定は `wrangler.jsonc`。2026-08-05 に Cloudflare Pages から移行した(ADR 0032)。
ドメイン: edu-evidence.org
セキュリティヘッダー: `public/_headers`(Workers でもそのまま解釈される)
リダイレクト: `public/_redirects`(同上)

**Cloudflare のメールアドレス難読化は Workers では効かない**。Pages 配信時は `mailto:`
が `/cdn-cgi/l/email-protection#…` に置換されていたが、Workers では生のアドレスが出る。
不具合ではなく Scrape Shield の仕様で、受容すると決めている(ADR 0032)。
ボット設定: `public/robots.txt`

## コンテキスト管理

Claude Code とのセッションは context 圧縮 / `/clear` / セッション終了を跨ぐことがある。重要な決定と進行状態は会話ではなくファイルに残す方針:

- **主要な意思決定** → [`docs/decisions/`](docs/decisions/)(ADR、不変)
- **現在のセッションの作業状態** → `.claude/state/active.md`(生きたチェックポイント、git 追跡外)
- **運用方針の全体** → [`docs/context-management.md`](docs/context-management.md)

`.claude/hooks/pre-compact.sh` と `post-compact.sh` が圧縮時に active.md を dump / 再読込リマインダーを出すよう登録されている(`.claude/settings.json`)。
