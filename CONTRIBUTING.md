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
npm run dev        # 開発サーバー
npm run build      # ビルド
npm run test:e2e   # E2E テスト
npm run check:text # 日本語校正
```

## 行動規範

教育に関わるプロジェクトです。建設的で敬意ある対話をお願いします。
