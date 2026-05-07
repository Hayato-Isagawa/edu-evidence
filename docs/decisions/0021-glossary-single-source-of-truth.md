# ADR 0021: 用語集を src/data/glossary.ts 単一の source of truth に統合する

## Status

採択 (2026-05-07)

## Context

EduEvidence JP の用語集は 2 系統のデータで運用されてきた。

1. `src/data/glossary.ts` — 本文中のツールチップ(`src/plugins/remark-glossary.mjs`)と frontmatter テキスト用(`src/lib/glossary-inline.ts`)で参照、45 件
2. `src/pages/guide/glossary.astro` — 用語集ページの表示用、配列リテラルを直書き、58 件

`CLAUDE.md` には「`glossary.astro` と `remark-glossary` プラグインで共用」と記載されていたが、実装上は片方にのみ存在するエントリが累計 23 件あり(astro 側 18 件 / `glossary.ts` 側 5 件)、def(定義文)も部分的にずれていた。

2026-05-06 の PR #169(学習スタイル再考コラム)レビュー過程で「神経神話 / 疑似科学」がツールチップでは表示されるが用語集ページには出ないことが判明し、データ二重化が顕在化した。このまま放置するとコラム執筆ごとに 2 系統での挙動確認が必要となり、編集コストとドリフトのリスクが累積する。

## Decision

`src/data/glossary.ts` を用語集データの単一 source of truth として確定する。

### 構造方針

- `src/data/glossary.ts` が用語集データを単独保持(63 エントリ、`GlossaryTerm` interface)
- `src/pages/guide/glossary.astro` は `import { glossary, type GlossaryCategory } from "../../data/glossary"` で受け取り、表示順 / グルーピングのみ担う
- `src/plugins/remark-glossary.mjs` と `src/lib/glossary-inline.ts` も同じ `glossary.ts` を入力源とする
- 用語集ページ内に配列リテラルを直書きしない

### category enum

`GlossaryTerm` に必須フィールド `category: GlossaryCategory` を導入。`GlossaryCategory` は string リテラルユニオン 6 値。

| value | 表示ラベル | 件数 |
|---|---|---|
| `foundations` | 基本概念とエビデンス | 14 |
| `pedagogy` | 指導法・学習プロセス | 16 |
| `methodology` | 統計・方法論 | 9 |
| `cognitive_science` | 認知科学・学習科学 | 10 |
| `critical_thinking` | 批判的思考と科学的態度 | 2 |
| `japan_context` | 日本の教育文脈 | 12 |

カテゴリ表示順は `glossary.astro` 内の `categoryOrder` 配列(基本概念 → 指導法 → 統計 → 認知科学 → 批判的思考 → 日本の文脈)で確定する。

### 表記統一ルール

- 用語と日本語訳の併記(例: `RCT(ランダム化比較試験)`)は本文採用しない。単独形(`RCT`)で表記し、初出時のみ `remark-glossary` のリンク化に委ねる
- カタカナ + 英略語の連結は空白なし(`クラスターRCT`)
- 略語の term 表記は `glossary.ts` の term フィールドを唯一の正とする

### 用語集 def 精度ポリシー

- def は一次出典(査読論文・公的機関刊行物・原典書籍)に整合させる
- 著者帰属が必要なエントリは「リード著者氏ら(年、出典 ID)」形式で記述
- 「正しい簡潔表現」と「網羅的厳密表現」が衝突する場合は最小差分を原則とし、誤りでない限り既存表記を維持(Step 5 突合方針)

### Future work

Step 5 の一次出典突合で改善余地が見つかったが、最小差分原則のため本 PR では保留した項目を集約する。

- L43 認知負荷理論 3 区分(intrinsic / extraneous / germane)の明示是非
- L44 ワーキングメモリ容量を Cowan 4±1 / Miller 7±2 のどちらで併記するか
- L60 因果推論 3 条件(時間的先行 / 関連性 / 第三因子排除)の順序
- L67 学習スタイル批判の出典を Pashler 2008 / 2009 のどちらで併記するか
- L75 信頼区間の俗説寄り解釈(95% の意味)の補足追加
- L79 DiD 並行トレンド仮定の追記
- L80 RDD 帯域内連続性仮定の追記
- L81 NRC 2000 (How People Learn) の出典明示
- Content Collections 化: `src/content/glossary/` への移行で Zod schema 型安全化と SEO 個別ページ化を検討

これらは個別 PR で取り組む。

## Consequences

### 利点

- 用語追加・編集が `glossary.ts` 1 ファイルで完結し、ドリフトが構造的に発生しなくなる
- 用語集ページが 6 カテゴリ別グルーピング表示となり、探しやすさが向上
- これまで astro 限定だった 18 件が用語集ページにも出現(神経神話・疑似科学も含む)
- TypeScript の型チェックで category の抜け漏れと値の typo が検知される
- 本文・ツールチップ・用語集ページの表記が `クラスターRCT` 等で完全一致する

### コスト

- 既存コラム・戦略本文の表記揺れ修正が Step 4 で 12 ファイル / 23 行 発生済(完了)
- 全 63 エントリの一次出典突合に Step 5 として複数セッションを要した(訂正計 3 件: foundations のクラスターRCT 帰属 / pedagogy の UDL CAST 関係 / japan_context の全国学テ実施頻度)
- 用語集ページ構造を Playwright e2e で継続検証する必要が生じた(既存 5 + 新規 3 = 8 テストへ拡大)

### 影響範囲

- `glossary.ts` の構造変更は import 側で即時型エラー化するため、ドリフトは型レベルでも防がれる
- `remark-glossary.mjs` / `glossary-inline.ts` の挙動は不変(category フィールドはツールチップ表示に使わず、カテゴライズは用語集ページのみで利用)
- セマンティック構造は `<section aria-labelledby>` + `<h2 id>` を維持しており、a11y への影響はない

## References

- PR #169(2026-05-06)— 神経神話・疑似科学のツールチップ表示が起点
- `src/data/glossary.ts` / `src/pages/guide/glossary.astro`
- `src/plugins/remark-glossary.mjs` / `src/lib/glossary-inline.ts`
- ADR 0007 セマンティック属性での状態管理(`aria-*` / `data-*` 規約)
