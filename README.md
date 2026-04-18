# EduEvidence JP

日本の小学校教員のための教育エビデンス・ポータルサイト。

英国 [EEF Teaching and Learning Toolkit](https://educationendowmentfoundation.org.uk/education-evidence/teaching-learning-toolkit) を起点に、国内外の教育研究から得られた知見を「効果」「信頼性」「コスト」の 3 指標で整理し、日本の小学校現場に合わせて翻案・公開しています。

**https://edu-evidence.org**

## 特徴

- **73 の指導法** を効果量(+◯ヶ月)・エビデンス強度(★)・コスト(¥)で一覧化
- **出典別エビデンス** — EEF / 日本研究 / Hattie の 3 ソースを併記
- **日本の文脈** — 各指導法に「日本の文脈で考慮したいこと」を付記
- **専門用語ツールチップ** — RCT・メタ分析等の専門用語にホバーで定義表示
- **全文検索** — Pagefind による 5,500+ 語のインデックス
- **動的 OG 画像** — 戦略ごとに固有の SNS 共有用画像を自動生成
- 用語集 36 語 / コラム 20 本 / 政策×エビデンス 15 項目 / ガイド 5 ページ

## 技術スタック

| 分類 | 技術 |
|------|------|
| フレームワーク | [Astro](https://astro.build/) 6 |
| UI | [React](https://react.dev/) 19 + [Tailwind CSS](https://tailwindcss.com/) 4 |
| 言語 | TypeScript |
| 検索 | [Pagefind](https://pagefind.app/) |
| OG 画像 | [Satori](https://github.com/vercel/satori) + [Sharp](https://sharp.pixelplumbing.com/) |
| テスト | [Playwright](https://playwright.dev/) (E2E 16 テスト) |
| リンター | textlint (日本語校正) |
| ホスティング | [Cloudflare Pages](https://pages.cloudflare.com/) |
| ドメイン | edu-evidence.org (Cloudflare Registrar) |

## セットアップ

```bash
# クローン
git clone https://github.com/Hayato-Isagawa/edu-evidence.git
cd edu-evidence

# 依存関係のインストール
npm install

# 開発サーバー起動
npm run dev

# ビルド(OG 画像 + Pagefind インデックス生成を含む)
npm run build

# ビルド結果のプレビュー
npm run preview

# E2E テスト(ビルド後)
npm run test:e2e
```

## npm スクリプト

| コマンド | 説明 |
|----------|------|
| `npm run dev` | 開発サーバー起動 |
| `npm run build` | 本番ビルド + Pagefind インデックス生成 |
| `npm run preview` | ビルド結果のローカルプレビュー |
| `npm run check` | Astro の型チェック |
| `npm run check:text` | textlint による日本語校正 |
| `npm run test:e2e` | Playwright E2E テスト |
| `npm run test:e2e:ui` | Playwright UI モード |

## ディレクトリ構成

```
src/
├── content/
│   ├── strategies/    # 73 の指導法(Markdown + frontmatter)
│   └── columns/       # コラム記事
├── components/        # Astro コンポーネント
├── data/              # 用語集データ
├── layouts/           # レイアウト
├── lib/               # OG 画像生成・用語ツールチップ
├── pages/             # ルーティング
├── plugins/           # remark プラグイン(用語自動リンク)
└── styles/            # グローバル CSS
```

## コンテンツの編集方針

- 効果量(+◯ヶ月)は一次研究(メタ分析・RCT)に基づく。推測で数値を設定しない
- 出典の優先順位: 日本研究(★3+) > EEF Toolkit > Hattie Visible Learning
- 詳細は [docs/CONTENT_GUIDELINES.md](docs/CONTENT_GUIDELINES.md) を参照

## ライセンス

コンテンツ: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.ja)
コード: [MIT](LICENSE)

## 著者

**Isagawa Hayato** — 元小学校教諭(12 年)
