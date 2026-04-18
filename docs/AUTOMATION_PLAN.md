# 自動化計画 / Automation Plan

> このドキュメントは Cowork 上で方針を相談した結果のサマリ。Claude Code で実装する際の引き継ぎ資料として使う。
> 作成日: 2026-04-18

## 1. 背景・ゴール

EduEvidence JP(本リポジトリ)とポートフォリオサイトの 2 サイト体制で、今後サイトを増やす予定。
更新作業を自動化したいが、コンテンツ品質(特に効果量の根拠)は厳格に守りたい。

## 2. 確定した方針

### 2.1 公開方針

**EduEvidence JP は GitHub Public のままにする**。

- コンテンツが既に CC BY-SA 4.0 / コードが MIT で公開済み
- GitHub Actions の無料枠が Public だと実質無制限
- 教員・研究者からの Issue/PR が貢献として入りうる
- 「自動化していること」は隠さず、README に透明性として明示する方針

### 2.2 ブランチ戦略

**main 直接編集はしない**。Claude(Code / Cowork)・自動化ジョブのいずれによる変更も、必ず以下を経由する。

```
feature ブランチ or auto/* ブランチ
   ↓
PR 作成(必要に応じて Draft)
   ↓
CI(textlint / 整合性チェック / E2E)が通る
   ↓
人間(著者)がレビュー
   ↓
Squash merge → main → Cloudflare Pages が自動デプロイ
```

- 自動化ジョブが立てる PR は `auto/*` プレフィックスのブランチを使う
- ラベル `needs-human-review` と `do-not-merge`(初期は付与)で区別
- `src/content/strategies/*.md` への変更は CODEOWNERS で必須レビュー設定

### 2.3 役割分担(ツール別)

| ツール | 担当 |
|---|---|
| **Claude Code** | 機能実装・リファクタ・型修正・E2E 追加・**GitHub Actions 上の自動化ジョブ本体** |
| **Cowork** | 方針相談・コンテンツ執筆支援・月次レポート・Gmail/Calendar 連携・軽微な修正 |
| **GitHub Actions + `claude -p`** | 定期実行する自動化(週次の研究監視・リンク切れ検知など) |

自動化の本体は **Claude Code を CI 上で非対話モード(`claude -p`)で動かす**のが王道。
Cowork のスケジュール機能は「デスクトップで完結する作業」向けなので、Git 運用を含む自動化には Actions 側を使う。

## 3. 自動化の分類

### 3.1 完全自動でよいもの(人レビュー不要)

- リンク切れ検知 → Issue 自動作成(週次)
- `lastVerified` が N ヶ月以上古いエントリのリストアップ → Issue 化(月次)
- Dependabot による依存更新(設定済み)
- PR 時の textlint / 整合性チェック / E2E 自動実行(まだなら追加)

### 3.2 半自動(Claude が下書き → 人がレビュー&マージ)

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

## 4. 実装候補(優先度順)

### Priority 1: リンク切れ週次検知 → 自動 Issue

- 副作用ゼロ、設計シンプル、効果あり
- `.github/workflows/link-check.yml` は既存 → cron 化と Issue 自動作成を追加
- 既存の `npm run check:links:live` を活用

### Priority 2: `lastVerified` 期限切れ検知

- `scripts/check-consistency.ts` に「`lastVerified` から 12 ヶ月以上経過したエントリ」を出力する関数を追加
- 月次の GitHub Actions ジョブで実行 → 結果を Issue 化

### Priority 3: コラム下書き自動生成 PR ボット

- 一番インパクトが大きいが設計が要る
- 設計時に決めること:
  - トリガー(週次? 手動? 特定キーワードの新着論文があったとき?)
  - WebSearch のクエリ戦略
  - 下書き frontmatter の `draft: true` フラグの追加(content.config.ts に schema 追加が必要)
  - PR テンプレート(レビュー観点を明記)

## 5. Claude Code 側の次の一歩

引き継ぎ時にお願いしたい作業順:

1. このドキュメントを読む(コンテキスト共有)
2. **Priority 1 のリンク切れ自動 Issue 化** から着手
   - ブランチ: `feature/auto-link-check-issue`
   - 既存 `.github/workflows/link-check.yml` の cron 追加 + 失敗時の Issue 作成ステップを追加
   - PR 作成、自分でレビュー、マージ
3. 次に Priority 2(`lastVerified` 期限切れ検知)を別ブランチで
4. Priority 3 は Anthropic API key の設定と PR テンプレート設計が必要なので、別途相談してから

## 6. シークレット管理メモ

Public リポジトリで自動化を回す際の必須シークレット候補:

- `ANTHROPIC_API_KEY` — Claude API 呼び出し用(Priority 3 で必要)
- `GITHUB_TOKEN` — Actions が自動付与(Issue/PR 作成に使用、追加設定不要)

すべて GitHub Secrets で管理。コミットには絶対に含めない。

## 7. 透明性の明示(README 追記案)

Public 公開する以上、自動化していることは README で明示する。例:

> 本サイトのコンテンツは AI 支援で下書きを生成し、すべての変更は著者が一次研究(メタ分析・RCT)を確認した上でマージしています。自動化ワークフローは `.github/workflows/` で公開しています。

これは隠すよりも信頼性として武器になる(エビデンスベースのサイトが運用も透明、という整合性)。

## 8. 依存関係の制約メモ

### 8.1 TypeScript の major 更新を Dependabot で除外している(2026-04-18〜)

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

### 8.2 その他、類似の制約が出た場合

上流パッケージの peer dependency 制約で major 更新がブロックされるパターンは今後も起き得る。そのときは本セクションに同様の形式で追記し、`dependabot.yml` の ignore と必ずセットで管理する。

---

## 参考: 関連ファイル

- `CLAUDE.md` — プロジェクト全体の鉄則
- `docs/CONTENT_GUIDELINES.md` — コンテンツ編集方針
- `.github/workflows/e2e.yml` — 既存の E2E ワークフロー
- `.github/workflows/link-check.yml` — 既存のリンクチェック
- `scripts/check-consistency.ts` — 整合性チェックスクリプト
