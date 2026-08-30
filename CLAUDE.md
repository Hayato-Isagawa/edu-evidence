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
npm run test:workflows     # link-check.yml の通知分岐の回帰テスト(下限つき・check:all に含む)
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

置き場所を `scripts/__tests__/workflows/` に分けているのは、`test:scripts` の glob
(`scripts/__tests__/*.test.mjs`)がサブディレクトリを拾わないため＝**二重実行しない**。

`test:workflows` / `test:hooks` は `assert-test-files.mjs` / `assert-test-results.mjs` を通している。
`node --test` は「glob が 0 件」「中身が空」「全件 skip」のどれでも exit 0 で終わるので、
守っているつもりのガードが no-op に落ちても気づけないため。`test:scripts` はこれを通して
いないので、この穴が残っている。

**下限の決め方は口ごとに違う。** `test:workflows` は実測ちょうど(余裕ゼロ)なので、
**テストを足したら下限も上げること**。`test:hooks` の 40 は実数追随ではなく
「1 ファイルを空にしても割る」境界値(`3d2afbe`)なので、実測 54 と離れていてよい。

## プロジェクト構造

- `src/content/strategies/*.md` — 74の指導法(frontmatter + markdown body)
- `src/content/columns/*.md` — コラム30本
- `src/pages/` — Astroページ(ルーティング)
- `src/components/StrategyRow.astro` — 戦略カードコンポーネント
- `src/layouts/Layout.astro` — 共通レイアウト(ヘッダー・フッター・ツールチップJS)
- `src/data/glossary.ts` — 用語集データ(用語集ページ + ツールチップで共用)
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
- `monthsGained` — 効果量(月数換算、整数)
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

- **設定**: `playwright.vrt.config.ts`(`testDir: vrt/`、desktop 1280 / mobile 390 の 2 projects、`maxDiffPixelRatio: 0.001`、`retries: 0`、アニメーション無効)
- **閾値は実測で決めている**。同一ビルド同士の撮り比べは差分 0(閾値 0 で 30 件全通過)。
  一方 `h2` の `letter-spacing` を 0.06em 変える実験では、旧閾値 0.01 だと 30 件中 2 件しか
  落ちなかった(0.001 では 19 件)。**全画面撮影に対して 1% は緩すぎる**
- **リトライは入れない**。差分が実測 0 なら、リトライは間欠的な問題を握り潰すだけになる
- **対象**: `vrt/pages.spec.ts` がテンプレート代表 16 URL をフルページ撮影。テンプレートを追加したら代表 URL を 1 行追記する
- **ゲート**: `.github/workflows/vrt.yml` が `pull_request` の `paths` で `src/layouts/**`・`src/components/**`・`src/styles/**`・`astro.config.*`・`vrt/**`・`playwright.vrt.config.ts` に限定起動。`src/content/**` だけの PR では走らない(`workflow_dispatch` で手動実行可)
- **比較方式(案A)**: CI 内で main と PR を両方ビルドし、同一 Linux 環境で撮影・比較する。ベースライン PNG はコミットしない(`vrt/__screenshots__/` は gitignore)。システムフォント描画の macOS↔Linux 差を回避するため
- **ローカル**: `npm run vrt` で現在の `dist` を撮影・比較できる。権威ある 2 ビルド差分は CI 側
- **required check 非対象**: 視覚変更 PR でしか起動しないため main 保護(ADR 0022)の required には含めない。マージ可否は編集者判断

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
