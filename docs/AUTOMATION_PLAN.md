# 自動化計画 / Automation Plan

> 作成日: 2026-04-18 / 最終更新: 2026-04-18

## 1. 背景・ゴール

EduEvidence JP(日本の小学校教員向け教育エビデンスポータル)の更新作業を自動化する。コンテンツ品質(特に効果量の根拠)を守りながら、運用コストを下げるのが目的。

## 2. 方針

### 2.1 公開方針

**EduEvidence JP は GitHub Public のままにする**。

- コンテンツは CC BY-SA 4.0 / コードは MIT で公開済み
- GitHub Actions の無料枠が Public だと実質無制限
- 「自動化していること」は隠さず、サイト上で透明性として明示

### 2.2 ブランチ戦略

**main 直接編集はしない**。自動化ジョブ・人手の変更のいずれも、必ず以下を経由する。

```
feature ブランチ or auto/* ブランチ
   ↓
PR 作成(必要に応じて Draft)
   ↓
CI(textlint / 整合性チェック / E2E)が通る
   ↓
著者レビュー
   ↓
Squash merge → main → Cloudflare Pages が自動デプロイ
```

- 自動化ジョブが立てる PR は `auto/*` プレフィックスのブランチを使う
- ラベル `needs-human-review` で自動生成 PR を区別
- `src/content/strategies/*.md` への変更は CODEOWNERS で必須レビュー設定(未設定、将来対応予定)

### 2.3 役割分担

| 担当 | 内容 |
|---|---|
| **AI 支援(対話)** | 方針相談、コンテンツ執筆支援、軽微な修正、ドキュメント整理 |
| **AI 支援(CI 上の自動化ジョブ)** | 週次の研究監視、リンク切れ検知、`lastVerified` の期限切れ検知など、定期実行する自動化 |
| **人手** | 一次研究の検証、効果量の判断、最終マージ判定 |

Git 運用を含む自動化は GitHub Actions 側で実装する。

## 3. 自動化の分類

### 3.1 完全自動でよいもの(人レビュー不要)

- リンク切れ検知 → Issue 自動作成(週次)
- `lastVerified` が 365 日以上古いエントリのリストアップ → Issue 化(月次)
- Dependabot による依存更新(設定済み)
- PR 時の textlint / 整合性チェック / E2E 自動実行

### 3.2 半自動(AI 支援で下書き → 人がレビュー&マージ)

- **新コラムの下書き生成**
  - 週 1 で教育関連の新メタ分析を WebSearch
  - 該当があれば `src/content/columns/` に下書き md 作成
  - `auto/column-draft-YYYY-MM-DD` ブランチで PR
- **既存戦略の更新候補検出**
  - 73 戦略について新研究が出ていないか定期チェック
  - あれば `evidence.japan.note` 更新候補として Issue 化
- **EEF Toolkit 本家の更新監視**
  - EEF が Toolkit を更新したら差分を検知
  - 翻案の叩き台を PR 化

### 3.3 自動化禁止

- **`monthsGained`(効果量)の自動更新**
  - CLAUDE.md の鉄則「効果量は推測で設定してはならない」に抵触
  - 必ず人間が一次研究を確認してから手で書く
- 既存戦略の本文(culturalContext 含む)の自動書き換え
- `source` フィールドの自動変更

## 4. 実装項目と状況

### 4.1 リンク切れ週次検知 → 自動 Issue 化(実装済み)

- 週次 cron で `.github/workflows/link-check.yml` が lychee を実行
- 切れを検出したら `link-check` ラベル付き Issue を自動作成
- 関連: `npm run check:links:live`

### 4.2 `lastVerified` 期限切れ検知(実装済み)

- `scripts/check-stale.ts` が 365 日以上経過したエントリを出力
- 月次の `.github/workflows/stale-check.yml` で実行し、結果を Issue 化
- 関連: `npm run check:stale`

### 4.3 コラム下書き自動生成 PR ボット(未実装)

- インパクトは大きいが設計が要る
- 設計時に決めること:
  - トリガー(週次 / 手動 / 特定キーワードの新着論文があったとき)
  - WebSearch のクエリ戦略
  - 下書き frontmatter の `draft: true` フラグの追加(`content.config.ts` に schema 追加が必要)
  - PR テンプレート(レビュー観点を明記)

## 5. シークレット管理

Public リポジトリで自動化を回す際の必須シークレット:

- `ANTHROPIC_API_KEY` — Claude API 呼び出し用(§4.3 コラム下書き自動生成で必要)
- `GITHUB_TOKEN` — Actions が自動付与(Issue / PR 作成に使用、追加設定不要)

すべて GitHub Secrets で管理。コミットには絶対に含めない。

## 6. 透明性の明示

Public 公開する以上、自動化していることはサイト上で明示する。例:

> 本サイトのコンテンツは AI 支援で下書きを生成し、すべての変更は著者が一次研究(メタ分析・RCT)を確認した上でマージしています。自動化ワークフローは `.github/workflows/` で公開しています。

エビデンスベースのサイトが運用も透明、という整合性が信頼性として機能する。

## 7. 依存関係の制約メモ

### 7.1 TypeScript の major 更新を Dependabot で除外している(2026-04-18〜)

`.github/dependabot.yml` の npm セクションで以下の ignore を設定している:

```yaml
ignore:
  - dependency-name: "typescript"
    update-types: ["version-update:semver-major"]
```

**理由**: `@astrojs/check@0.9.8` の peer dependency が `typescript@^5.0.0` を要求しているため、TypeScript 6 を入れると `npm ci` が `ERESOLVE` で失敗する。Astro エコシステム側の対応待ち。

**解除タイミングの判定方法**:

```bash
npm view @astrojs/check peerDependencies
```

出力の `typescript` が `^6.0.0` を含むようになったら(例: `"^5.0.0 || ^6.0.0"` や `"^6.0.0"`)、ignore を削除して OK。

**解除手順**:

1. `.github/dependabot.yml` から上記 `ignore` ブロックを削除
2. 別ブランチで PR 作成
3. Dependabot の次回実行を待つと、TypeScript 6 の更新 PR が自動で立つ
4. その PR の CI が緑になるか確認してマージ

### 7.2 その他、類似の制約が出た場合

上流パッケージの peer dependency 制約で major 更新がブロックされるパターンは今後も起き得る。そのときは本セクションに同様の形式で追記し、`dependabot.yml` の ignore と必ずセットで管理する。

---

## 参考: 関連ファイル

- `CLAUDE.md` — プロジェクト全体の鉄則
- `docs/CONTENT_GUIDELINES.md` — コンテンツ編集方針
- `.github/workflows/e2e.yml` — E2E ワークフロー
- `.github/workflows/link-check.yml` — 週次リンクチェック
- `.github/workflows/stale-check.yml` — 月次 lastVerified チェック
- `scripts/check-consistency.ts` — 整合性チェックスクリプト
- `scripts/check-stale.ts` — stale チェックスクリプト
