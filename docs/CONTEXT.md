# CONTEXT.md — edu-evidence エージェント向けドメイン辞書

> このファイルはエージェント(Claude Code 等)が edu-evidence の用語・スキーマ・整合性キーを取り違えないための **1 枚物の参照辞書** です。
>
> サイト読者向けの用語集は `src/data/glossary.ts`(ツールチップ用)、`CLAUDE.md` は規約と運用の概要を扱います。CONTEXT.md は両者と重複しない「フラットな grep キーセット + 1 行定義」を提供します。

## 読者

- 主たる読者: **日本の小学校教員(現職)**。教育エビデンスを実務判断に使いたい層
- 副次的読者: 教育委員会・研究者・保護者(教員視点の解釈で読む)
- 教師の包括責任観から距離を取る(memory rule 5)。家庭・地域の責任境界を明示する

## frontmatter フィールド 1 行定義(整合性 grep 用)

正式スキーマは `src/content.config.ts` の zod 定義を一次ソースとする。以下はエージェントが grep キーとして即座に引ける表現。

- `title` — 戦略 / コラムのタイトル。category に対応した一意名
- `summary` — 1〜2 文の本文要約。教員が一覧画面で読む粒度
- `monthsGained` — 効果量(月数換算、整数 -12〜12)。**一次研究で裏付けたものだけ書く**(memory rule 3 + 14)
- `evidenceStrength` — 1〜5 の段階評価。研究の頑健性(★3 以上が日本研究の採用閾値)
- `cost` — 1〜5 の段階評価。導入コスト(時間 / 物的 / 心理的の総合)
- `subjects` — 教科配列。default `["全教科"]`
- `grades` — 学年配列。default `["全学年"]`
- `tags` — 自由タグ配列
- `category` — `指導法` / `制度・環境` / `知っておくべき知見` / `認知科学` / `家庭・外部` の 5 値
- `source` — `eef` / `japan` / `hattie` / `mixed` の 4 値。**バッジ描画は `evidence.*` の有無で決まる(`source` 値はバッジに使わない)**
- `sourceUrl` — 一次研究ドメインのみ(memory rule 14 / `docs/CONTENT_GUIDELINES.md` Rule 1.2b)。news / まとめページ / 書籍紹介ページは置かない
- `sourceTitle` — 一次研究のタイトル
- `evidence.eef` / `evidence.japan` / `evidence.hattie` — 出典別詳細(併記用、optional)。バッジ表示は本オブジェクトの **キー有無** で動的描画
- `culturalContext` — 日本文脈での効果差異 / 注記
- `lastVerified` — 一次ソースとの最終照合日(YYYY-MM-DD)
- `methodology` — Technical Appendix(`studies` / `sampleSize` / `effectSize` / `primaryMetaAnalysis` / `limitations`)

## 同義表現クラスタ(memory rule 4d 用)

整合性 grep は **クラスタ単位** で回す。単独 grep は「ご褒美」だけで「報酬」表現を見落とした事故(2026-04-26 PR #114)が再発する。**未確認のクラスタは別 PR で grep 検証 → 採用 → 本表に追記** の手順を取る。

### 確認済み

```text
[reward]       ご褒美 / 報酬 / 外発的動機付け / インセンティブ          <- memory rule 4d 由来(2026-04-26)
[effect-size]  効果量 / monthsGained / 月数換算 / months of progress    <- content.config.ts + EEF 用語
```

### 拡張候補(grep 検証後に上の表へ移行)

未検証クラスタ。各候補は採用前に `rg -i "<term>"` で本文 / frontmatter / glossary における実使用を確認すること。

- `[verbalization]` 言語化 / 説明 / アウトプット / 表出
- `[reflection]` 振り返り / メタ認知 / 自己評価 / リフレクション
- `[cooperation]` 協同 / 協働 / 協力 / グループワーク
- `[feedback]` フィードバック / 形成的評価 / formative assessment
- `[motivation]` 動機付け / モチベーション / やる気 / 内発的動機

## ソースタクソノミー優先順位

1. **日本研究(★3 以上)** → `source: japan`
2. **EEF Teaching and Learning Toolkit** → `source: eef`
3. **Hattie Visible Learning**(上限寄りのため参考値扱い) → `source: hattie`
4. **複数ソース併記** → `source: mixed`

## 重要ルール・ADR への即引きポインタ

- 一次研究ドメイン限定: memory rule 14 / `docs/CONTENT_GUIDELINES.md` Rule 1.2b
- glossary 等メタデータ層も rule 3 を適用: memory rule 21
- コンテンツ編集前 Plan Mode 既定: memory rule 19
- changelog はユーザー価値のある変更だけ書く: memory rule 8b
- semantic 属性で UI 状態管理: memory rule 6 / `docs/decisions/`(該当 ADR)
- 直線 3px アクセントバー範囲: memory rule 9 / ADR 0008
- TDD は vertical slicing: memory rule 23

## CONTEXT.md の更新方針

- 用語クラスタ / フィールド定義 / タクソノミーが変わるたびに同 PR で更新する
- サイト読者向け説明は本ファイルではなく `src/data/glossary.ts` または `src/content/columns/*.md` 側に置く
- 由来: mattpocock/skills の `CONTEXT.md` パターン(エージェント向けドメイン辞書、2026-05-22 導入)
