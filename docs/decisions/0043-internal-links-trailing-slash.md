# 0043. 内部リンクをビルド後の HTML でスラッシュ付きにそろえる

- 状態: 採用
- 日付: 2026-10-21
- 関連 PR: #(本 ADR と同一 PR で確定)

## 背景

ページは `/strategies/x/` で配信され、canonical・sitemap・RSS もスラッシュ付きで出ている。一方、サイト内リンクはほぼすべてスラッシュ無しで書かれていた(ヘッダー・フッター・カード、本文 md の 230 件 / 51 ファイル、`remark-strategy-ref` の `/strategies/${slug}`、用語リンクの `/guide/glossary#…`)。スラッシュ無しの URL は、Cloudflare の静的アセット配信が 307 で転送する。

JSON-LD も同じだった。戦略・コラムの `url` / `mainEntityOfPage` / パンくずの `item`、著者の `url`、FAQPage の回答文の中のリンクがスラッシュ無しだった(ADR 0039 の帰結に観察として残っている)。

2026-10-21 に Search Console を読んだところ、「クロール済み - インデックス未登録」にスラッシュ無しの URL が 11 件あった。URL 検査でも、参照元ページにスラッシュ無しの URL が出ていた。ただし、登録済みのページの参照元もスラッシュ無しだったので、この違いが登録されるかどうかを分けているとは言えない。

## 検討した選択肢

- **A. ビルド後の HTML の `href` を書き換える Astro インテグレーションを足す(採用)**
- B. ソースを直す。テンプレートの数十箇所と本文 md の 51 ファイルを書き換えることになり、本文 md の書き換えには記事編集の手順がすべてかかる。新しく書くテンプレートやリンクで再発もする
- C. 配信側をスラッシュ無しに寄せる(canonical・sitemap もスラッシュ無しにする)。登録済みの URL がすべてリダイレクトになる

## 決定

- `src/plugins/trailing-slash-links.mjs` を `astro:build:done` に登録する。空白の直後にある `href="/…"` のうち、`dist/<path>/index.html` が実在するパスだけにスラッシュを足す。ファイルへのリンクと存在しないパスは変えない
- 実在するかどうかは、dist の実ファイル名で作った集合で判定する(`existsSync` は macOS で大文字小文字と NFC/NFD を区別しないので使わない)
- rehype で解析して文字列に戻す形にはしない。HTML 全体が整形し直され、`href` 以外にも差分が出るため
- JSON 文字列の中の URL は書き換えの対象外なので、ソースでスラッシュ付きにする(`[...slug].astro` の `pageUrl` ほか、`src/data/faq.ts`)

## 帰結

- 本番の HTML の内部リンクと JSON-LD の URL が canonical と一致する。インデックス登録に効くかは確かめていない
- dev サーバーの HTML はスラッシュ無しのまま出る(`astro:build:done` は dev では走らない)。E2E と VRT はビルド済みの dist を見るので、検査は本番と同じ HTML に当たる
- 回帰の観測点は 3 つ。純関数の規則は `scripts/__tests__/trailing-slash-links.test.mjs`、登録が外れた場合は `e2e/navigation.spec.ts` の dist 全体の走査、JSON-LD は `e2e/jsonld.spec.ts`
- 扱わないもの: 検索フォームの `action="/search"`、外から入るスラッシュ無しのリンクに対する 307(301 にするかは別に決める)
- ADR 0039 の帰結にある「`Article.url` / `mainEntityOfPage` は末尾スラッシュ無し」は、本 ADR の時点で当てはまらなくなる。ADR は不変とする運用なので、0039 は書き換えない
