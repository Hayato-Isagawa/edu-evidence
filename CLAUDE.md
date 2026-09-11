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
npm run test:e2e           # Playwright E2Eテスト(42テスト・9ファイル、ビルド後に実行)
npm run vrt                # ビジュアルリグレッションテスト(現 dist を撮影・比較。権威ある比較は CI、後述)
npm run a11y:baseline      # axe-core で a11y 違反一覧を再生成(dev 起動後 `node scripts/a11y-baseline.mjs http://localhost:<port>`)
npm run check              # Astro型チェック
npm run check:text         # textlint日本語校正
npm run check:consistency  # monthsGained 整合性チェック
npm run check:evidence-strength # エビデンス強度(★)整合性チェック
npm run check:stale        # lastVerified 期限切れチェック
npm run check:all          # 上記チェックを一括実行(CI の Content Checks でも実行)
npm run test:scripts       # 上の各ゲートが壊れた入力で確実に落ちることの回帰テスト(check:all に含む)
npm run test:workflows     # link-check.yml の通知分岐と VRT の配線の回帰テスト(下限つき・check:all に含む)
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

置き場所を `scripts/__tests__/workflows/` に分けているのは、`test:scripts` の glob
(`scripts/__tests__/*.test.mjs`)がサブディレクトリを拾わないため＝**二重実行しない**。

`test:scripts` / `test:workflows` / `test:hooks` は `assert-test-files.mjs` / `assert-test-results.mjs` を通している。
`node --test` は「glob が 0 件」「中身が空」「全件 skip」のどれでも exit 0 で終わるので、
守っているつもりのガードが no-op に落ちても気づけないため。

**下限の決め方は口ごとに違う。** `test:workflows` の 60 と `test:scripts` の 42 は実測ちょうど
(余裕ゼロ)なので、**テストを足したら下限も上げること**。`test:hooks` の 56 は実数追随ではなく
「1 ファイルを空にしても割る」境界値(`3d2afbe`。空ファイルも `node --test` は 1 pass と数えるので、総数 − 最小ファイルの本数 + 2)なので、実測 64 と離れていてよい。

`test:scripts` を余裕ゼロにしているのは、`check-consistency.ts` の検査が層ごとに 4 本の
`gate()` に分かれており、1 行消すとその層が丸ごと無防備になるため。`gate()` は 1 本で
2 テストなので、消えれば 42 を割る。

`glossary-inline.test.mjs` の 7 本と `remark-glossary.test.mjs` の 4 本も同じ下限に載っている。
用語ツールチップの変換は **壊れても CI が全緑のまま**で(型検査は型しか見ず、textlint は
Markdown ソースしか見ず、E2E も a11y 監査も属性値の中身までは届かない)、この 11 本が
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

- **設定**: `playwright.vrt.config.ts`(`testDir: vrt/`、desktop 1280 / mobile 390 の 2 projects、`threshold: 0` + `maxDiffPixels: 0`、`retries: 0`、アニメーション無効)
- **閾値は実測で決めている**。同一ビルド同士の撮り比べは差分 0(閾値 0 で 30 件全通過)。
  一方 `h2` の `letter-spacing` を 0.06em 変える実験では、旧閾値 0.01 だと 30 件中 2 件しか
  落ちなかった(0.001 では 19 件)。**全画面撮影に対して 1% は緩すぎる**。
  その後 ADR 0036 で比率そのものをやめた — 許容量がページの長さに比例して長いページほど甘く、
  Playwright が pixelmatch に渡す `threshold`(既定 0.2)未満の色差は比率を下げても数えられないため(edu-law の実測)
- **リトライは入れない**。差分が実測 0 なら、リトライは間欠的な問題を握り潰すだけになる
- **対象**: `vrt/pages.spec.ts` がテンプレート代表 15 URL をフルページ撮影。テンプレートを追加したら代表 URL を 1 行追記する(`/changelog` は #433 で対象外。問題が現れたのは #428 で、理由は同ファイル冒頭)
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
