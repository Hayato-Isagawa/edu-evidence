# Architecture Decision Records (ADR)

本ディレクトリは EduEvidence JP の主要な意思決定の不変記録を集めたものです。なぜその決定に至ったか、どの選択肢が却下されたか、何が起きたら見直すかを時系列で残し、半年後・1 年後の自分や新しい貢献者が意思決定の背景を辿れるようにします。

## 運用方針

- 決定が確定したら新規 ADR を追加(連番 4 桁)
- **原則として改変しない**(誤植修正は例外)
- 決定を覆す場合は新規 ADR を起こし、旧 ADR の「状態」を `撤回(####で上書き)` に変える
- 対象: ブランド体系、技術選定、コンテンツポリシー、レビューフロー、運営方針

## 対象外

以下は ADR ではなく別の場所で管理します。

- コードの実装方針 → コードコメント / PR 本文 / `docs/CONTENT_GUIDELINES.md`
- セッション中の作業状態 → `.claude/state/active.md`
- 日々のコンテンツ編集判断 → 当該ファイルの git history
- 個人の作業嗜好 → メモリ(リポジトリ外)

## テンプレート

```markdown
# NNNN. タイトル

- 状態: 採用 / 撤回(####で上書き)
- 日付: YYYY-MM-DD
- 関連 PR: #N, #M

## 背景
## 検討した選択肢
## 決定
## 帰結
## 撤回 / 再検討の条件
```

詳細な運用方針は [`../context-management.md`](../context-management.md) を参照。

## 索引

- [0001. 植物モチーフによる 4 サイトブランド体系](0001-plant-motif-brand-system.md)
- [0002. Node.js 24 LTS を mise で統一管理](0002-node-24-lts-via-mise.md)
- [0003. 執筆前 verifier + PR 前 reviewer による 2 段階コンテンツレビュー](0003-two-stage-content-review.md)
- [0004. 公開氏名表記を Isagawa Hayato に統一](0004-public-byline-isagawa-hayato.md)
- [0005. 本体は非営利維持、収益化は別ブランド SaaS に分離](0005-non-commercial-with-saas-separation.md)
- [0006. 反論型コラムを解説型に差し替える(前提検証ルール)](0006-rebuttal-column-replaced-with-explainer.md)
- [0007. UI 状態はセマンティック属性(aria-* / data-*)で管理する](0007-semantic-attribute-state-management.md)
- [0008. 直線 3px アクセントバーは角張ったリスト要素のみに適用する](0008-linear-accent-bar-scope.md)
