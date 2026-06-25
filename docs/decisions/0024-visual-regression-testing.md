# ADR 0024: ビジュアルリグレッションテスト(VRT)を視覚変更 PR に限定して導入

## Status

採択 (2026-06-25)

## Context

EduEvidence JP は共有レイアウト(`src/layouts/Layout.astro`)・共有コンポーネント(`src/components/`)・単一のグローバル CSS(`src/styles/global.css`、Tailwind v4)で全ページの見た目を統一している。これらに手を入れると 70 以上の戦略ページ・コラム・各ハブへ視覚的影響が波及するが、現状その回帰は手動の目視監査(UI/UX 横断調査)でしか検出できていない。

既存の `e2e.yml`(Playwright)は DOM 構造・テキスト・属性の機能テストであり、レイアウト崩れ・余白・配色といったピクセルレベルの回帰は対象外である。一方でコンテンツ(`src/content/**` の markdown)編集は毎回テキスト差分を生むため、全 PR に VRT をかけると差分がノイズだらけになる。

VRT のベースラインの持ち方には 2 案がある。(A) CI 内で main と PR を両方ビルドし同一 Linux 環境で撮影して比較する案、(B) ベースライン PNG をリポジトリにコミットする案。本サイトは Web フォントを使わずシステムフォントスタック(ADR 0010)で描画するため、ローカル(macOS)と CI(Linux)でフォント描画が異なる。案 B では Linux で生成したベースラインをコミットする手間と PNG の重量が生じる。

## Decision

Playwright をベースに、**視覚面に触れる PR だけに走るゲート付き VRT** を案 A(2 ビルド差分)で導入する。

### 既存 E2E との分離

機能テストと混ざらないよう VRT を独立させる:

- スペック: `vrt/`(既存機能テストの `e2e/` とは別ディレクトリ)
- 設定: `playwright.vrt.config.ts`(`testDir: ./vrt`、desktop 1280 / mobile 390 の 2 projects、`toHaveScreenshot` の差分閾値とアニメーション無効化)
- ベースラインはコミットしない。`vrt/__screenshots__/` は `.gitignore` で除外

### 対象 URL

テンプレートごとに代表 1 ページ(計 16): トップ / コラム一覧・詳細 / 戦略詳細 / 季節ハブ / 一覧(subjects・concerns)/ ガイド・用語集 / 主要静的ページ / changelog / 検索 / 404。同一テンプレートの複数ページは 1 枚で代表する。テンプレートを追加したら `vrt/pages.spec.ts` に代表 URL を 1 行追記する。

### ゲート

`.github/workflows/vrt.yml` を `pull_request` の `paths` フィルタで `src/layouts/**`・`src/components/**`・`src/styles/**`・`astro.config.*`・`vrt/**`・`playwright.vrt.config.ts` に限定する。`src/content/**` だけの PR では起動しない。`workflow_dispatch` で手動実行も可能。

### 2 ビルド差分(案 A)

CI ジョブ内で PR ブランチをビルド(`dist-pr`)、`git worktree` で main をビルド(`dist-main`)し、main を `--update-snapshots` で撮影してベースライン化、続けて PR を同一環境で撮影・比較する。両者を同じ Linux ジョブで撮るため、システムフォント差はキャンセルされ、検出される差分は実変更のみとなる。

### required check に含めない

VRT は視覚変更 PR でしか起動しないため、main ブランチ保護(ADR 0022)の required status checks には追加しない。結果は情報提供であり、マージ可否は編集者が判断する(rule 13)。

## Consequences

### 利点

- 共有レイアウト・コンポーネント・`global.css` 改修時の視覚回帰を、目視に頼らず差分画像で確認できる
- ベースラインをコミットしないため、リポジトリが PNG で肥大化せず、macOS↔Linux のフォント描画差問題も回避できる
- コンテンツ編集 PR は対象外のため、日常のテキスト更新を妨げない

### コスト

- 視覚変更 PR では main と PR を 2 回ビルドするため、1 回の VRT 実行に追加のビルド時間(各ビルド約 2 分)がかかる
- 対象 URL・差分閾値は手動メンテナンスが必要

### 影響範囲

- 既存 `e2e.yml`(機能テスト)は変更しない。VRT は別ワークフロー・別ディレクトリで併走する
- ローカルでは `npm run vrt`(現在の `dist` に対する撮影・比較)で確認できる。権威ある 2 ビルド差分は CI で行う
- パイロットは edu-evidence。確立後に edu-watch(UI を本サイトに揃えている)・edu-law・portfolio へミラーする(ADR 0023 と同じファミリー横展開方針)

## References

- `playwright.vrt.config.ts` / `vrt/pages.spec.ts` / `.github/workflows/vrt.yml`
- 既存機能テスト: `playwright.config.ts` / `e2e/` / `.github/workflows/e2e.yml`
- ADR 0010(システムフォントスタック・Web フォント不使用)/ ADR 0022(main ブランチ保護と required checks)
- 関連 rule: 7(edu-watch の UI を本サイトに揃える)/ 9(アクセントバー scope)/ 13(マージは編集者判断)
