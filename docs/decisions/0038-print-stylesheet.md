# 0038. 印刷スタイルを global.css の 1 ブロックで提供する(edu-law ADR 0029 ミラー)

- 状態: 採用
- 日付: 2026-09-15
- 関連 PR: #(本 ADR と同一 PR で確定)
- 関連 ADR: edu-law ADR 0029(原本)、0024(VRT)

## 背景

指導法ページとコラムは校内研修の配布資料として印刷される用途を想定しているが、印刷用のスタイルが
無く、sticky ヘッダー・ナビ・目次のサイドバー・戻るボタン・ダーク配色がそのまま紙に出ていた。
外部リンク(EEF・一次研究)は紙では辿れない。edu-law が先に入れた形(ADR 0029)を、このリポの
現物に合わせて写す。

## 決定

edu-law ADR 0029 と同じ:

- `src/styles/global.css` 末尾の `@media print` ブロック 1 つ。テンプレは触らない。画面描画には
  一切影響させない(VRT が 0 diff で通ることが「画面を変えていない」の実測になる)
- トークンの上書きは `:root` にだけ書く。`[data-theme="dark"] { … }` を print 内に増やすと
  `src/pages/design-tokens.json.ts` がそれも dark 値として集約し、公開 `/design-tokens.json` の
  dark トークンが印刷値に化ける(実測)。`@theme` は `@layer theme` の中、`[data-theme="dark"]` と
  global.css の後続規則は unlayered なので、末尾の `:root` は同じ詳細度の後置として勝つ
- 素の要素セレクタ(`a` 等)は書かない。unlayered は Tailwind の全ユーティリティに勝つ
- `main` 内の外部リンクは `::after` で URL を併記し、`overflow-wrap: anywhere` で折り返す
- サイトフッターはリンク集(探す・学ぶ・サイトについて・姉妹サイト)と説明文・購読を落とし、
  お問い合わせと © 行(CC BY-SA 4.0・EEF 帰属)は残す。配布物から帰属・ライセンス表示を落とさない
- ダークで印刷してもライトに戻す。`--color-accent` と出典・コストのトークンも light 値を再宣言する
- 検査は `e2e/print.spec.ts`。`colorScheme: "dark"` で `emulateMedia({ media: "print" })` し、
  chrome の非表示・残す要素の描画(`toBeVisible`。`toContainText` は textContent を読むので
  `display: none` を検出できない)・配色・URL 併記・320px の横溢れ・本文リンクの色を見る

このリポ固有の差分:

- 目次(`.toc`。サイドバーとモバイルの `<details>`)、出典コピーのボタンとステータス、用語の
  ツールチップ(`.glossary-bubble`)も消す。出典の表記例(`#citation-text`)は残す — 配布物に出典が載る。
  サイドバーを含む grid の wrapper は `:has()` で `display: block` に戻し、空の列を残さない
- 本文リンクの色は `.prose-article a:not(.glossary-tip)` で書く。`.prose-article a` では既存の
  同名規則(用語リンクを除外している)に詳細度で負ける(実測)
- `.prose-article` が `17px` 固定(`p` / `li` はそれを継承)なので `html { font-size: 11pt }` が効かず、`p` / `li` に別に 11pt を当てる
- `<details>` はコラム 6 本のグラフのデータ表(`details.chart-data-table`)にもある。CSS では開けないので
  閉じたまま受け入れる(SVG のグラフ本体は印刷される)
- `inline-flex` の外部リンクは無い(dist 全 HTML で実測 0)ので、law の `display: inline` は写さない

## 結果

- A4 で指導法(メタ認知)6 ページ、コラム(フィンランド教育の神話)7 ページ(2026-09-15、`page.pdf` で実測)
- 印刷ボタンは置かない。必要になったら別 ADR
