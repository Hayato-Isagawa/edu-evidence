# 0007. UI 状態はセマンティック属性(aria-* / data-*)で管理する

- 状態: 採用
- 日付: 2026-04-27
- 関連 PR: #(本 ADR と同一 PR で確定)

## 背景

ヘッダーを sticky 化し、モバイルメニュー展開時に背景スクロールを固定する改修(PR `feat/sticky-header-and-scroll-lock`)を実施するにあたり、UI の状態(メニュー開閉、スクロール固定など)をどう表現するかを決める必要があった。

選択肢として、

- **A) スタイル駆動の修飾子クラス**(例: `is-open` / `--open` / `menu-open`)
- **B) HTML 標準のセマンティック属性**(`aria-expanded` / `data-state` など)

がある。既存実装(`src/layouts/Layout.astro`)は既に B 寄りで、ハンバーガーボタンに `aria-expanded` 、モバイルナビに `data-state="open|closed"` を持たせ、Tailwind 4 の属性セレクタ variant(`data-[state=open]:opacity-100`)で見た目を制御していた。

新しく追加する状態(`<body>` のスクロール固定)を `body.menu-open` のようなクラスで表すと、既存の属性駆動方針と混在し、状態の真実(source of truth)が二重化する。

## 検討した選択肢

### A) スタイル駆動の修飾子クラス(例: `body.menu-open`, `.header--sticky`)

- 利点: BEM などの命名規約に沿う、CSS 側の可読性が高い場合がある
- 欠点:
  - 状態がクラス名で表現されるためスクリーンリーダーや支援技術には伝わらない
  - JS が「状態を更新する」のではなく「クラス名を付け替える」関心になり、状態管理と視覚表現が結合する
  - 同一の状態を別の文脈で参照したい場合(例: テストでメニュー開閉を assert)に名前ベースのフックに依存する

### B) HTML 標準のセマンティック属性(`aria-expanded` / `data-state` / `inert` / カスタム `data-*`)

- 利点:
  - `aria-expanded` などは支援技術が既定で解釈する。a11y と視覚状態が一致する
  - JS の関心は「属性を更新する」だけで、見た目は CSS 属性セレクタが追従する
  - 同一属性が DOM 検査・テスト・CSS の共通フックになる
  - Tailwind 4 はネイティブで `data-[state=open]:` `aria-expanded:` などの variant をサポートしている
- 欠点:
  - 属性セレクタは複数値の表現にやや冗長(`data-state="open"` vs クラス `.open`)
  - 既存メンバーが BEM 流派なら学習コストがある(本プロジェクトは個人運営のため該当なし)

## 決定

**B) を採用。本リポジトリの DOM 駆動 UI 状態は HTML セマンティック属性で表現する。**

### 具体ルール

1. **開閉/可視性のような状態**: `aria-expanded` を支援技術向けの真実の値とし、CSS フック(`data-state="open|closed"`)を併設する
2. **フォーカス制御**: 閉じている領域には `inert` を付与する
3. **複数要素にまたがる状態**(例: メニューが開いているとき body のスクロールを止めたい): スコープに最も近い祖先要素(典型的には `<body>` または `<html>`)に `data-*` を付ける(本件では `<body data-menu="open|closed">`)。命名規約は `data-<scope>` で短く保つ
4. **スタイルは属性セレクタで参照**: Tailwind の `data-[state=open]:`、`aria-expanded:`、生 CSS の `body[data-menu="open"]` を使う。`is-open` / `--open` 等の修飾子クラスは追加しない
5. **JS の責務**: 状態の更新(`element.dataset.menu = "open"`、`element.setAttribute("aria-expanded", "true")`)のみ。CSS クラスの付け外しで見た目を制御しない
6. **初期値**: クライアント JS 実行前から正しい初期 DOM が得られるよう、サーバー側(Astro)で初期属性を出力する(例: `<body data-menu="closed">`、`<nav data-state="closed" inert>`)

### 既存コードとの整合

- 既存の `<button id="menu-toggle" aria-expanded>` と `<nav data-state="open|closed">` は本ルールにそのまま準拠している
- 本 PR で追加した `<body data-menu="open|closed">` も同じ流儀
- 修飾子クラス(`is-*`, `--*`)を新たに追加しない

## 帰結

### 良い帰結

- 状態の真実が DOM 属性に一元化される(JS / CSS / 支援技術 / E2E テストが同じ属性を見る)
- a11y が「視覚状態に追従する追加実装」ではなく既定で成立する
- `prefers-reduced-motion` のようなメディアクエリと組み合わせやすい(状態 × メディア の二軸で表現できる)
- ADR として明文化することで、将来コラボレータが入った際の規約が明確になる

### トレードオフ

- 「複数値の状態」を表すとき `data-state="closed"` のような書き方になり、`.closed` クラス比 1〜2 文字長い
- CSS 側で属性セレクタの specificity を意識する必要がある(クラスと同じ 0,1,0 なので実用上は問題なし)
- BEM ベースの素材を移植する際、命名の翻訳工程が増える

## 撤回 / 再検討の条件

- 将来、属性セレクタが Tailwind / 主要ブラウザでサポート低下した場合(現状の見通しでは発生しない)
- 共同開発者が増え、BEM/CSS Modules 流派の方針を全体採用したほうが学習コストを下げられると判断された場合
- React/Vue のクライアント主導 UI に大きく舵を切り、属性ではなく state hook 主導の表現に移行する場合
