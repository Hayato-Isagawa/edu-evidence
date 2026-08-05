# 0032. ホスティングを Cloudflare Pages から Workers static assets へ移す

- 状態: 採用
- 日付: 2026-08-05
- 関連 PR: #(本 ADR と同一 PR で確定)

## 背景

ファミリー 5 サイトはすべて Cloudflare Pages で配信していた。Cloudflare は Pages を今後もサポートするとしつつ、**投資・最適化・新機能はすべて Workers に向ける**と公式の移行ガイドで明言している。

> https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/

このまま Pages に留まると、新機能が使えないだけでなく、いずれ実質的な塩漬けになる。移行するなら、判断材料が揃っていて他に大きな作業が乗っていない今がよい。

移行の前提として 5 サイトの構成を調べたところ、**すべてが最も単純な「assets-only」**だった。SSR アダプタも Pages Functions も `_worker.js` も持たず、`dist/` を配るだけである。したがって `wrangler.jsonc` に `assets` を書くだけでよく、`main`(リクエストハンドラ)は不要になる。

## 決定

5 サイトすべてを Workers static assets へ移す。各リポジトリに以下を置く。

```jsonc
{
  "name": "<worker 名>",
  "compatibility_date": "2026-08-05",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "404-page"
  }
}
```

- `not_found_handling: "404-page"` で Pages の既定挙動(未知のパスに `404.html`)に合わせる
- `public/.assetsignore` を置く。Pages が自動で除外していたものを Workers は除外しない
- `routes` は切り替えが安定するまで書かない。移行時点ではカスタムドメインを Pages が握っており、同じホスト名を二重に要求すると `already has externally managed DNS records` でデプロイが落ちる
- 自動デプロイは **Workers Builds** を GitHub に接続して行う。Pages の Git 連携と同じ位置づけ

## 費用

増えない。**静的アセットのリクエストは課金対象外**で、無料枠の制限はファイル数(20,000 / 版)とファイルサイズ(25 MiB)のみ。最大の edu-evidence でも 281 ページ規模で、桁が違う。

## 引き継がれるもの・失われるもの

移行前に「Pages 固有」と思われた資産を本番で実測した。

| 資産 | Workers での挙動 |
|---|---|
| `public/_headers`(セキュリティヘッダー 6 本) | **そのまま有効**。全サイトで実測確認 |
| `public/_redirects`(301) | **そのまま有効**。`law.edu-evidence.org/child-guidance/` で実測確認 |
| JS Detections(`challenge-platform/jsd`) | ゾーン単位の機能なので**引き継がれる** |
| Cloudflare Web Analytics のビーコン | ソース HTML に入れてあるため影響なし |
| **メールアドレス難読化(Scrape Shield)** | **失われる**(下記) |
| デプロイ後のキャッシュ purge(`cf-purge.yml`) | **要修正**(下記) |

### 失われるもの 1 — メールアドレス難読化

Cloudflare の Email Address Obfuscation は **Worker の応答には適用されない**。Pages 配信では `mailto:law@edu-evidence.org` が `/cdn-cgi/l/email-protection#…` に置換され、復号スクリプトが挿入されていた。Workers 配信では生のアドレスがそのまま出力される。

5 サイトを突き合わせて確認した(Pages 配信の 2 サイトは難読化あり、Workers 配信の 3 サイトは難読化なし)。露出は edu-law 31/31・edu-watch 165/165・portfolio 10/34・edu-evidence 281/281 ページ。

**これは受容する。** 理由:

- 対象は `law@` / `news@` / `takedown@` / `info@` という**公開前提の role アドレス**で、そもそもサイトに掲載して読者に使ってもらうためのもの
- 前段に Cloudflare Email Routing のフィルタがある
- 難読化が防げるのは JS を実行しない素朴な収集ボットだけで、防御としては薄い
- 迷惑メールが実際に増えたときは alias を作り直せばよく、事前に作り込むより安い

代替(ソース側で JS 組み立て / 問い合わせフォーム化)も検討したが、前者は JS 無効環境でリンクが機能しなくなり、後者は送信を受ける Worker が要るので `assets-only` の単純さを崩す。得られる防御の薄さに見合わない。

### 失われるもの 2 — キャッシュ purge の待ち合わせ

`cf-purge.yml` は Pages のデプロイ API を commit SHA で待ってから zone を purge していた。Pages プロジェクトを削除するとこのポーリングが 40 回 × 15 秒を空振りし、purge をスキップする(Cache Rule の Edge TTL は 10 分なので、その間だけ古い HTML が返る)。

Workers Builds API を見るように書き換えた。実装上の注意が 2 つある。

- Workers Builds は **worker 名ではなく script tag** で引く。名前で問い合わせると存在しない扱いになる
- Workers Builds は既定でトリガーを 2 本作る。`main` → `wrangler deploy`(本番)と、それ以外 → `wrangler versions upload`(プレビュー)。後者を拾わないよう commit hash に加えてブランチも `main` で絞る

これに伴い `CLOUDFLARE_API_TOKEN` の権限が **Cloudflare Pages: Read → Workers Scripts: Read** に変わる。差し替え前でも CI を落とさないよう、tag を引けない場合は警告して固定待機してから purge する経路を残した。

## assets-only Worker の制約

ダッシュボード上で以下が使えない。いずれも現在使っていないため支障はないが、将来必要になったら `main` を持つ Worker に格上げすることになる。

- 環境変数・シークレット
- Cron Triggers
- Logpush / Tail Workers

## 移行の手順

カスタムドメインの切り替えは**順序が決まっている**。

1. `npx wrangler deploy` で Worker に初回デプロイ
2. `*.workers.dev` で表示を確認する。**デプロイ直後はエッジ伝播が揃わず 200 と 404 が混ざる**ので、単発のリクエストで判断してはいけない(連続 200 になるまでポーリングする)
3. **Pages 側からカスタムドメインを外す**
4. Worker にカスタムドメインを付ける。ダッシュボードのダイアログは**ゾーン検索**なので、`news.edu-evidence.org` と入力しても「一致するゾーンがありません」になる。`edu-evidence.org` を選び、サブドメイン欄に `news` だけを入れる
5. Workers Builds を GitHub に接続する
6. 数日並走させてから Pages プロジェクトを削除し、`wrangler.jsonc` に `routes` を足す

## この決定への反論

**「Pages はサポートが続くのだから、動いているものを動かす必要はない」** — もっともではある。ただし移行コストが実測で小さかった(assets-only なので設定ファイル 2 つ)のに対し、留まり続けるコストは時間とともに増える。判断材料が揃っている今のほうが安い。

**「メールアドレスが露出するのは後退ではないか」** — 後退ではある。ただし難読化の実効は薄く、対象は公開前提の role アドレスで、事後の是正(alias 作り直し)が容易である。上の受容判断はこのトレードオフを認めた上でのもの。
