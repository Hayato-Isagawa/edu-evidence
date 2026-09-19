# 0039. Organization JSON-LD に姉妹サイトの関係を書かない(edu-watch ADR 0071 ミラー)

- 状態: 採用
- 日付: 2026-09-19
- 関連 PR: `test/jsonld-shape-e2e`
- 関連 ADR: edu-watch 0071(原本。選択肢の比較と根拠の全文)、edu-law 0030(同ミラー)

## 背景

ファミリー 3 サイトの `Organization` JSON-LD は、姉妹サイトとの関係を 3 通りに表現していた
(edu-watch #671)。本サイトは関係の表現なし(`sameAs` は自組織の X アカウントのみ)、edu-law は
`sameAs` に姉妹サイトの URL、edu-watch は `parentOrganization` = EduEvidence JP。2026-09-16 に
edu-watch ADR 0071 が「`Organization` に他の組織との関係を書かない」と決め、edu-law はミラー
ADR 0030 で `sameAs` を外し、両サイトは e2e で `@type` の集合・型ごとのキー集合・URL 値のホストを
固定した。

本サイトの JSON-LD は決定に既に一致していて、実装の変更は無い。無かったのは、ファミリーの
決定を本サイト側から辿れる記録と、形を固定する e2e(`faq.spec.ts` は FAQPage の内容だけを見る)。
`Layout.astro` の `pageJsonLd` はどのページからでも渡せるので、後から関係を書く経路は残っていた。

## 決定

1. **`Organization` に他の組織との関係を書かない。** `sameAs` は自組織の SNS
   (`https://x.com/edu_evidence_jp`)のみ。ファミリーのドメインは置かない
2. **e2e(`e2e/jsonld.spec.ts`)が JSON-LD の形を固定する。** サイトが書く `@type` の閉じた集合
   (10 種)・型ごとに許すキーの集合・`@context` の 1 形・`sameAs` の値(`Organization` は上の 1 件に
   完全一致。家族ドメインの不在だけ見ると `x.com/edu_law_jp` の形が通る)・URL 値のホストが自サイトで
   あること・トップレベルのブロック列を、戦略詳細 / コラム / トップ / FAQ の 4 ページはブラウザで、
   全ページは `dist` の HTML 走査で見る(`pageJsonLd` を足したテンプレートも拾う)
3. **URL ホストの例外は `CreativeWork.url` だけ。** 戦略の `isBasedOn` は一次出典で、外部ドメインを
   指すのが正(CONTENT_GUIDELINES Rule 1.2b)。http(s) であり家族ドメインでないことを見る。
   著者(`Person`)の `sameAs` は URL 形式だけ見る — 同一人物のページなので家族ドメインも可
   (edu-watch ADR 0071)
4. 姉妹サイトとの関係は about ページの本文・フッター・相互リンクが担う。構造化データでは表現しない

## 結果

- 実装は変わらない。`Organization` は `@context` / `@type` / `name` / `alternateName` / `url` /
  `logo` / `sameAs` のまま
- e2e は 65 テスト・12 ファイルになる(README / CLAUDE.md の件数を追随)
- 検査の限界(edu-law / edu-watch と共通): 文字列本文の中の URL は見ない(`Answer.text` は HTML 断片で
  `<a href>` を含む。`description` / `keywords` の途中の URL、`web.archive.org` ラップの内側も同様)。
  代表 slug(`metacognition` / `class-size-cost-effectiveness`)は固定で、戦略側は `isBasedOn` を持つ
  ものを選んでいる — `sourceUrl` を外すコンテンツ変更は赤になる
- `Article.url` / `mainEntityOfPage` は末尾スラッシュ無し、`<link rel="canonical">` は有りで出ている。
  本 ADR の射程外なので e2e は現状の値に合わせている
- どの表現が検索や AI アシスタントに効くかは未検証。本 ADR は「誤った主張を出さない」ことだけを
  根拠にしている

## 撤回 / 再検討の条件

- edu-watch ADR 0071 の再検討条件と同じ: schema.org が姉妹サイト(対等な関連組織)を表す
  プロパティを持つようになった場合、または Google / 主要な AI アシスタントの文書が組織間の
  関係プロパティを消費対象として列挙した場合、関係を書く選択肢を再検討する
- JSON-LD に新しい `@type` やキーを足すときは、e2e の `knownTypes` / `nodeShapes` を同じ PR で
  更新する(集合の外は何であれ赤になる)
