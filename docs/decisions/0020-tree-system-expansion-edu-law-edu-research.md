# ADR 0020: 木の部位体系を 5 サイト体系に拡張する

## Status

採択 (2026-05-06)

## Context

`docs/BRAND.md` はこれまで 4 サイト体系(EduEvidence JP / EduWatch JP / 将来ツール / 将来法律)で運用されてきた。

2026-05-06 のプロジェクト確定により、以下が決まった:

1. 「将来法律」サイトを **EduLaw JP**(`law.edu-evidence.org`)として正式採択し、立ち上げを開始する
2. 新規に **EduResearch JP**(`research.edu-evidence.org`)を 5 つ目のサイトとして立ち上げる
3. EduResearch JP のモチーフを「種(seed)」とする

現行 BRAND.md の「将来の拡張余地」では、種(seed)に「次世代教員養成・採用支援」というスロットが暫定的に充てられていた。EduResearch JP を種に充てると、この暫定スロットの意味を差し替える必要がある。

## Decision

木の部位体系を 4 サイト + 拡張余地から、5 サイト体系へ拡張する。

| 部位 | 対応サイト | 状態 |
|---|---|---|
| 種(seed) | **EduResearch JP**(`research.edu-evidence.org`) | 採択 / 法サイト後着手 |
| 根(root) | **EduLaw JP**(`law.edu-evidence.org`) | 採択 / 着手準備中 |
| 幹(trunk / stem) | 将来: ツールサイト(業務支援 SaaS) | 未実装 |
| 成熟した葉(mature leaf) | EduEvidence JP(`edu-evidence.org`) | 実装済み |
| 双葉(cotyledon) | EduWatch JP(`news.edu-evidence.org`) | 実装済み |

### 種の意味再定義

- 旧: 「次世代教員養成・採用支援」(BRAND.md 拡張余地に暫定記載)
- 新: 「研究アイデア源(エビデンスとは言えない単発研究・紀要・実践研究の集約)」

「種」は「まだ確立されていない可能性 / アイデア源」と整合し、EduResearch JP の性格(「これはエビデンスではない、種である」)と一致する。

「次世代教員養成・採用支援」のスロットは、必要が生じた段階で別の部位(若枝・苗・樹液など)で再考する。

### アクセント色の方向性

- 根(EduLaw JP): 焦茶系。BRAND.md 既存予約値 `#6b4423` を採択(土・基盤・守護)
- 種(EduResearch JP): 黄土色 / 麦色系を方向性とする。具体値はロゴ実装 PR で確定する(候補: `#b8860b` / `#a67c00` / `#daa520` 等)

ベーストークン(`--color-bg` / `--color-ink` / `--color-sub` / `--color-line` / `--color-card` / `--color-chart-red`)はすべて姉妹サイトと同一を維持する。

### wordmark

- EduLaw JP
- EduResearch JP

両サイトとも `Edu*** <accent>JP</accent>` パターンに従う。

### 対称性方針

- EduLaw JP(根): 左右対称(制度・規範の安定感)
- EduResearch JP(種): 後続のロゴ実装 PR で決定(対称: 静的シンボル / 非対称: 芽吹きの方向感)

## Consequences

### 利点

- 5 サイトが 1 本の木として閉じた生態系を形成し、ブランド意図(教員の実務構造を木に重ねる)が完成する
- 種(可能性)→ 双葉(時事萌芽)→ 葉(成熟確立)← 根(土台規範)という時間軸が成立する
- EduLaw JP / EduResearch JP の立ち上げ時に、ブランド方向性を再議論する必要がなくなる

### コスト

- 同内容の同期 PR を `Hayato-Isagawa/edu-watch` 側にも別途作成する必要がある(本 ADR 採択後)
- ロゴ実装(EduLaw / EduResearch)時に、それぞれ色具体値を確定する PR が必要

### 影響範囲

- 既存の EduEvidence JP / EduWatch JP の実装には影響なし(色トークン / ロゴ / wordmark すべて変更なし)
- 本 ADR は文書レベルのブランド体系拡張であり、コード変更は伴わない

## References

- `docs/BRAND.md`(同 PR で更新)
- `~/.claude/projects/-Users-Hayato/memory/project_edu_law.md`(2026-05-06 構成確定)
- `~/.claude/projects/-Users-Hayato/memory/project_edu_research.md`(2026-05-06 構成確定)
