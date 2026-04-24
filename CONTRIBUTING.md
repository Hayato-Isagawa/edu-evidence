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

## コンテンツ PR 前のレビュー

戦略ページ / コラム / ガイドの **新規作成・大幅修正を含む PR を立てる前** に、リポジトリ内の Claude Code エージェント `edu-content-reviewer`(`.claude/agents/edu-content-reviewer.md`)で機械レビューを回すことを推奨します。

主なチェック観点(詳細は定義ファイル参照):

- Rule 1.1(正確性) — 数値 / 引用の原典整合、コラムの **前提事実** の一次検証
- Rule 1.2a — 未読書籍が main の参考資料に混入していないか
- Rule 1.6 — 家庭領域の記述で役割境界が明示されているか
- Rule 1.8 — 「必ず」「決定的」「絶対」等の断定表現残留
- Rule 4 — 「我々」「当サイト」等の自己言及残留
- 参考資料 URL の生存確認、相互リンクの実在確認、数値密度・専門用語密度

運営者レビューの時間を「内容の判断」に集中させるのが目的で、**修正は行わず** 指摘のみを返す設計です。

## 行動規範

教育に関わるプロジェクトです。建設的で敬意ある対話をお願いします。
