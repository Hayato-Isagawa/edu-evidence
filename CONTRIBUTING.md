# 貢献ガイド

EduEvidence JP への貢献に興味を持っていただきありがとうございます。

## 貢献の方法

### Issue を立てる

- **誤りの指摘** — 効果量・引用元・リンク切れ等の間違いを見つけた場合
- **新しい指導法の提案** — 追加すべき指導法がある場合
- **改善提案** — UI・UX・アクセシビリティ等の改善案

### Pull Request を送る

1. このリポジトリを Fork
2. ブランチを作成 (`git checkout -b feat/my-change`)
3. 変更をコミット
4. Push して Pull Request を作成

## コミットメッセージ / PR タイトル規約

### タイトル行

[Conventional Commits](https://www.conventionalcommits.org/) 形式の **英語** で書く。

```
feat: add monthly stale content check workflow
fix: correct months calculation in homework strategy
docs: update content counts to match actual sizes
chore: bump astro from 6.1.5 to 6.1.7
ci: auto-create issue when lychee detects broken links
```

使用する type:

| type | 用途 |
|---|---|
| `feat` | 新機能の追加 |
| `fix` | バグ修正 |
| `docs` | ドキュメント変更のみ |
| `chore` | ビルド・依存・設定等の雑務 |
| `ci` | CI/CD 設定変更 |
| `refactor` | 挙動を変えないコード整理 |
| `test` | テストの追加・修正 |
| `perf` | パフォーマンス改善 |

英語タイトルを採用する理由:

- OSS 慣習(Conventional Commits)との整合
- `git log --oneline` のスキャン性
- 英語話者の貢献者にも「何をしたか」が伝わる

### 本文

**日本語で書く**。「なぜこの変更が必要か」「どう実装したか」「影響範囲」を詳しく説明してよい。

### Issue タイトル

日本語でも英語でも可。自動生成される Issue(リンク切れ・stale 検知など)は `[auto]` プレフィックス + 英語タイトル + 日本語本文で統一する。

## コンテンツの編集ルール

指導法の追加・修正時は以下を守ってください。

### 効果量(monthsGained)のルール

- **推測で数値を設定しない** — 必ず一次研究(メタ分析・RCT)を確認する
- 出典の優先順位: 日本研究(★3+) > EEF Toolkit > Hattie Visible Learning
- 詳細は [docs/CONTENT_GUIDELINES.md](docs/CONTENT_GUIDELINES.md) を参照

### frontmatter の必須フィールド

```yaml
title: 指導法名
summary: 一行の要約
monthsGained: 数値
evidenceStrength: 1-5
cost: 1-5
subjects: ["教科"]
grades: ["学年"]
tags: ["タグ"]
source: eef | japan | hattie | mixed
sourceUrl: https://...
sourceTitle: "出典タイトル"
evidence:
  eef: { note: "..." }
  japan: { note: "..." }
  hattie: { note: "..." }
culturalContext: |
  日本の文脈での注記
```

## 開発環境

```bash
npm install
npm run dev                # 開発サーバー
npm run build              # ビルド
npm run test:e2e           # E2E テスト
npm run check              # Astro 型チェック
npm run check:text         # textlint 日本語校正
npm run check:consistency  # monthsGained 整合性チェック
npm run check:stale        # lastVerified 期限切れチェック
npm run check:all          # 上記チェックを一括実行
```

## エージェント活用早見表

Claude Code のサブエージェントを **作業フローの各段階に組み込む** と、運営者のレビュー時間を「内容の判断」に集中できます。以下が本リポジトリで想定している使い分けです。

### コンテンツ執筆フロー(edu-evidence 固有、リポジトリ内カスタム)

| 場面 | エージェント | 配置 | 呼び出し例 |
|---|---|---|---|
| 新規コラム / 戦略ページの **執筆前** | `edu-pre-write-verifier` | `.claude/agents/` | 「〇〇についてコラムを書きたい。前提を検証して」 |
| コラム / 戦略ページの **PR 作成前** | `edu-content-reviewer` | `.claude/agents/` | 「`src/content/columns/new.md` をレビューして」 |

- `edu-pre-write-verifier` は **執筆前** のゲート。「〜が拡散している」等の前提事実を WebSearch で一次検証し、GO / REVISE / STOP を判定。PR #102 の反省を直接反映
- `edu-content-reviewer` は **執筆後・PR 前** に Rule 1.1 / 1.2a / 1.6 / 1.8 / 4、参考資料 URL の生存、相互リンクの実在、数値密度を機械チェック
- 両者とも `Edit` / `Write` を持たない **読み専用レビュアー**。運営者の判断で修正する設計

### 汎用エージェント(`~/.claude/agents/` にあり、全リポジトリから呼べる)

| 場面 | エージェント | 主な用途 |
|---|---|---|
| UI / デザインシステム変更時 | `a11y-architect` | WCAG 2.2 準拠チェック。教員・保護者向けなのでアクセシビリティは中核価値 |
| JSON-LD / meta / sitemap 関連 | `seo-specialist` | 構造化データ・Core Web Vitals・キーワードマッピング監査 |
| パフォーマンス監査 | `performance-optimizer` | バンドルサイズ・レンダリング・OG 生成時間 |
| dead code 除去 | `refactor-cleaner` | knip / depcheck / ts-prune で未使用コード検出 |
| 新機能の計画フェーズ | `planner` | 実装前の設計レビュー |
| E2E / ユニットテスト設計 | `tdd-guide` | テスト駆動の支援 |
| 例外の握り潰し検出 | `silent-failure-hunter` | try-catch の黙殺・無効データのスルーを検出 |
| PR のテストカバレッジ評価 | `pr-test-analyzer` | 行動カバレッジ観点のレビュー |

### 使い分けの原則

- **執筆系のフロー**(`pre-write-verifier` → 執筆 → `content-reviewer`)は、新規コラム / 戦略ページを書くたびに回す
- **汎用エージェントは場面駆動**(UI 変更時に a11y-architect、等)
- **運営者が修正を行う** 前提で、カスタム 2 種は指摘のみ(`Edit` / `Write` なし)
- 汎用エージェントの出力が大きすぎる場合は Issue に貼って段階的に対応する

### 姉妹サイト(edu-watch)との扱い

`edu-content-reviewer` / `edu-pre-write-verifier` は edu-evidence のルール(Rule 1.1〜1.8、Rule 4、`CONTENT_GUIDELINES`)に特化。edu-watch には週次ダイジェスト運用が始まる Sprint 4 頃に、同じ思想の `edu-watch-digest-editor` を別途配置する想定。現時点では edu-watch へのコピーは行わない。

## 行動規範

教育に関わるプロジェクトです。建設的で敬意ある対話をお願いします。
