# EduEvidence JP

日本の小学校教員向け教育エビデンスポータル。Astro 6 + React 19 + Tailwind 4 + TypeScript。

## ビルド・テスト

```bash
npm run dev          # 開発サーバー(localhost:4321)
npm run build        # 本番ビルド(OG画像73枚 + Pagefindインデックス生成、約2分)
npm run test:e2e     # Playwright E2Eテスト(16テスト、ビルド後に実行)
npm run check        # Astro型チェック
npm run check:text   # textlint日本語校正
```

## プロジェクト構造

- `src/content/strategies/*.md` — 73の指導法(frontmatter + markdown body)
- `src/content/columns/*.md` — コラム7本
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

```yaml
title: string
summary: string
monthsGained: number        # -4 ~ +8 の範囲
evidenceStrength: 1-5
cost: 1-5
subjects: string[]
grades: string[]
tags: string[]
source: "eef" | "japan" | "hattie" | "mixed"
sourceUrl: string
sourceTitle: string
evidence:
  eef: { monthsGained?, strength?, note? }
  japan: { monthsGained?, strength?, note?, researcher? }
  hattie: { cohensD?, note? }
culturalContext: string      # 日本の文脈での注記
```

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
