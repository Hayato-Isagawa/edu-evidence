# 0002. Node.js 24 LTS を mise で統一管理

- 状態: 採用
- 日付: 2026-04-23

## 背景

運営者のローカルには複数の Node.js プロジェクトがあり(portfolio / edu-evidence / edu-watch 等)、それぞれが異なる Node バージョンで動いていた。nvm や Volta を併用していた時期があり、ディレクトリを移動するたびに手動でバージョンを切り替える手間があった。

また Cloudflare Pages のビルド環境と手元のバージョンがずれると、ローカルでは通るのに CI で落ちる / その逆、という事故が起きやすい状況だった。

## 検討した選択肢

- **A) mise で `.tool-versions` 固定、Node 24.15.0 LTS に統一**
- **B) nvm + `.nvmrc` で管理、バージョンは各プロジェクトで独立**
- **C) Volta を使い続ける(`package.json` の `volta` フィールド)**
- **D) 管理ツールを使わず、Node 24 をシステム全体にインストール**

## 決定

**A)** を採用。全プロジェクトの Node を 24.15.0 LTS("Jod")に統一し、各リポジトリの `.tool-versions` に書き込む。

- `package.json` の `engines.node` は `>=24.0.0`
- Cloudflare Pages の Node バージョンも 24 系に合わせる(Pages の UI で指定)
- シェル起動時に mise が自動で `.tool-versions` を読む

## 帰結

### 良い帰結

- プロジェクトを `cd` するだけで正しい Node バージョンに切り替わる
- LTS を揃えたことで、`@astrojs/*` や `zod v4` などの最新機能が全プロジェクトで使える
- Cloudflare Pages との環境差に起因する事故が減る

### トレードオフ

- mise 自体の導入と、他ツール(nvm / Volta)の削除が必要
- Node 24 はまだ比較的新しいため、一部のレガシー依存がリリースタグで弾かれる可能性がある(実際には今のところ問題なし)

## 撤回 / 再検討の条件

- Cloudflare Pages が Node 24 を打ち切った場合
- 使用している依存パッケージが Node 24 非対応になった場合
- チーム開発に移行し、他メンバーの環境差異が mise で吸収できないことが判明した場合
