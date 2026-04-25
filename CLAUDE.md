# EduEvidence JP

日本の小学校教員向け教育エビデンスポータル。Astro 6 + React 19 + Tailwind 4 + TypeScript。

## ブランド

- **モチーフ**: 成熟した葉(葉脈の通った 1 枚の葉)。姉妹サイト EduWatch JP の「双葉(cotyledon)」と対になり、「積み上げてきたエビデンス」を象徴する
- **アクセント色**: 深緑 `#2b5d3a`(`--color-accent`)
- **ロゴ実装**: `src/components/Logo.astro` が inline SVG + `currentColor` 継承。色を変えたい時は呼び出し側の `color:` / Tailwind の `text-` クラスを変えるだけで済み、SVG を直接編集する必要なし

## 環境

Node.js のバージョンは `.tool-versions` で固定している(`nodejs 24.15.0`)。[mise](https://mise.jdx.dev/) を使う前提。

```bash
mise install               # .tool-versions に従って Node 24 を導入
npm ci                     # 依存をロックから復元
```

`package.json` の `engines.node` は `>=24.0.0`。CI やエディタ側もこれに合わせる。

## ビルド・テスト

```bash
npm run dev                # 開発サーバー(localhost:4321)
npm run build              # 本番ビルド(OG画像73枚 + Pagefindインデックス生成、約2分)
npm run test:e2e           # Playwright E2Eテスト(16テスト、ビルド後に実行)
npm run check              # Astro型チェック
npm run check:text         # textlint日本語校正
npm run check:consistency  # monthsGained 整合性チェック
npm run check:stale        # lastVerified 期限切れチェック
npm run check:all          # 上記チェックを一括実行
```

## プロジェクト構造

- `src/content/strategies/*.md` — 73の指導法(frontmatter + markdown body)
- `src/content/columns/*.md` — コラム20本
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

## ホスティング

Cloudflare Pages(GitHub main ブランチ連携で自動デプロイ)。
ドメイン: edu-evidence.org
セキュリティヘッダー: `public/_headers`
ボット設定: `public/robots.txt`

## コンテキスト管理

Claude Code とのセッションは context 圧縮 / `/clear` / セッション終了を跨ぐことがある。重要な決定と進行状態は会話ではなくファイルに残す方針:

- **主要な意思決定** → [`docs/decisions/`](docs/decisions/)(ADR、不変)
- **現在のセッションの作業状態** → `.claude/state/active.md`(生きたチェックポイント、git 追跡外)
- **運用方針の全体** → [`docs/context-management.md`](docs/context-management.md)

`.claude/hooks/pre-compact.sh` と `post-compact.sh` が圧縮時に active.md を dump / 再読込リマインダーを出すよう登録されている(`.claude/settings.json`)。
