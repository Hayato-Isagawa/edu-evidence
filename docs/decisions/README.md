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
- [0009. ファーストビュー(Hero)は縦積み + 大型 H1 を共通スタイルとする](0009-stacked-hero-with-large-h1.md)
- [0010. 本文フォントはシステムフォントスタックに統一し Web フォントを廃止する](0010-system-font-stack-no-webfont.md)
- [0011. ダークモードはシステム追従デフォルト + 手動切替トグル(`data-theme` 属性)で提供する](0011-dark-mode-data-theme-with-system-default.md)
- [0012. 投稿系ページ(コラム / ダイジェスト)のメタ配置を姉妹サイトで統一する](0012-posts-meta-layout-unified.md)
- [0013. ダークモードのトークン値を可読性重視に再調整する](0013-dark-mode-readability-tuning.md)
- [0014. 本文タイポグラフィを可読性重視にチューニングする](0014-prose-typography-readability-tuning.md)
- [0015. ダーク本文 ink を react.dev の gray-15(`#D0D3DC`)に再微調整する](0015-ink-token-react-dev-gray-15.md)
- [0016. Hattie バッジと amber 系ボックスにダーク variant を追加する](0016-hattie-amber-dark-variant.md)
- [0017. OG 画像生成用フォントをリポジトリに同梱する](0017-og-image-font-bundled.md)
- [0018. 静的 default OG 画像を整備し、個別 OG を持たないページのフォールバックとする](0018-static-default-og-image.md)
- [0019. OG 画像キャッシュ更新ポリシー(姉妹サイト ADR の edu-evidence 適用)](0019-og-cache-refresh-policy.md)
- [0020. 木の部位体系を 5 サイト体系に拡張する](0020-tree-system-expansion-edu-law-edu-research.md)
- [0021. 用語集を src/data/glossary.ts 単一の source of truth に統合する](0021-glossary-single-source-of-truth.md)
- [0022. Dependabot patch/minor 自動マージ運用と main ブランチ保護](0022-dependabot-auto-merge-policy.md)
- [0023. changelog の文体(敬体)と粒度をファミリー統一する(edu-law ADR 0022 ミラー)](0023-unify-changelog-register-and-granularity.md)
- [0024. ビジュアルリグレッションテスト(VRT)を視覚変更 PR に限定して導入](0024-visual-regression-testing.md)
- [0025. content-reviewer の後段に独立反証ゲートを追加(2 段階 → 3 段階レビュー)](0025-adversarial-verification-gate.md)
- [0026. Cloudflare Web Analytics を手動スニペット方式で導入し CSP を最小限緩和する](0026-web-analytics-beacon-and-csp.md)
