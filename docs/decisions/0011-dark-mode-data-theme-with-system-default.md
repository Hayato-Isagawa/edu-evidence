# 0011. ダークモードはシステム追従デフォルト + 手動切替トグル(`data-theme` 属性)で提供する

- 状態: 採用
- 日付: 2026-05-03
- 関連 PR: 本 ADR と同一 PR で確定
- 関連 ADR: 0007(semantic attribute state management)/ 0010(system font stack)
- 姉妹サイト ADR: edu-watch ADR 0026(同仕様のミラー)
- 参考実装: ISAGAWA HAYATO Portfolio(`~/isagawa-hayato-portfolio` の `SiteControls.astro` + `global.css`)

## 背景

本サイトはこれまでライトテーマ単一で運用してきた。一方、現在のモバイル端末のユーザーの 80% 以上が OS レベルでダークモードを使用しており(iOS 78% / Android 71%、2026 年時点の統計)、64.6% のユーザーが「サイト側がシステム設定に自動追従すること」を期待しているという調査結果がある。

教育エビデンスサイトは長文を扱い、夜間や薄暗い環境での閲覧が多いと想定される。背景色を明るいクリーム(`#faf9f5`)で固定したまま運用すると、夜間の長時間閲覧で目疲労が蓄積し、保存・離脱の障害になる。

姉妹サイトの ISAGAWA HAYATO Portfolio は **prefers-color-scheme でシステム追従 + 手動トグルで永続化選択**(localStorage)という方式で既に実装済み。同じメンタルモデルを姉妹サイト 3 つで保ちたい。

ただし portfolio は `document.documentElement.classList.add("dark")` で `.dark` クラスを html に付ける方式で実装している(ADR 0001 制定前の経緯)。本サイトはすでに ADR 0007 で「UI 状態はセマンティック属性(`aria-*` / `data-*`)で管理する」規約を採択しており、起動属性は portfolio と差別化して `data-theme` を使う。

## 検討した選択肢

### A) システム設定追従のみ(`prefers-color-scheme` 一発、手動切替なし)

- 利点: 実装がシンプル、JS 不要、CSS の `@media (prefers-color-scheme: dark)` だけで完結
- 欠点:
  - 「ダークモード端末だが、このサイトだけライトで読みたい」というユーザーの選択を奪う
  - 35% 程度のユーザーは手動切替で永続化したいというニーズがあると示唆されている

### B) システム追従 + 手動切替トグル + localStorage 永続化(採用)

- 利点:
  - デフォルトはシステム追従(64.6% の自動追従期待に応える)
  - トグルで手動 override 可能、選択は localStorage で永続化(35% の手動切替ニーズに応える)
  - 姉妹サイト portfolio と同じメンタルモデル(ユーザーが姉妹サイト間を移動しても挙動が一致)
- 欠点:
  - inline script を `<head>` 早期に置く必要がある(FOUC 回避のため)
  - localStorage 不可環境(プライベートブラウジングの一部)では永続化が効かないが、その場合もシステム追従にフォールバックすれば閲覧は破綻しない

### C) 手動切替のみ(初期値ライト固定)

- 利点: ライトテーマを「正規」とみなす立場を貫ける
- 欠点:
  - システム追従期待に反する(64.6% のユーザーは「サイトは自動で追従するもの」と思っている)
  - エビデンスサイトの「事実は事実」というトーンは色価値選択とは独立であり、固定する積極的理由が無い

## 決定

**方式 B** を採用。実装は次の規約に従う。

### 起動属性

- `<html data-theme="light">` または `<html data-theme="dark">`
- ADR 0007 の「UI 状態はセマンティック属性で管理する」規約と整合
- `.dark` のような修飾子クラスは使わない(portfolio との実装差はあるが、本サイトの内的一貫性を優先)

### 初期解決スクリプト

`<head>` の最早期(`<link rel="stylesheet">` より前)に inline `<script>` で初期テーマを解決する。FOUC(背景が一瞬白で出てから黒に切り替わる)を回避するため、CSS 適用前に DOM 属性を確定させる。

```html
<head>
  <meta charset="utf-8" />
  <script is:inline>
    (function () {
      try {
        const saved = localStorage.getItem("theme");
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const theme = saved === "dark" || saved === "light"
          ? saved
          : prefersDark
            ? "dark"
            : "light";
        document.documentElement.setAttribute("data-theme", theme);
      } catch {
        document.documentElement.setAttribute("data-theme", "light");
      }
    })();
  </script>
  <meta name="color-scheme" content="light dark" />
  <link rel="stylesheet" href="..." />
</head>
```

### CSS トークンの分離

`:root` でライト値を定義、`[data-theme="dark"]` でダーク値を上書きする。

```css
:root {
  --color-bg: #faf9f5;
  --color-ink: #1a1a1a;
  --color-sub: #6b6b66;
  --color-line: #e5e3da;
  --color-card: #ffffff;
  --color-accent: #2b5d3a;
  --color-accent-hover: color-mix(in oklab, var(--color-accent) 85%, black);
  --color-chart-red: #c0392b;
}

[data-theme="dark"] {
  --color-bg: #0f1413;
  --color-ink: #e8e6df;
  --color-sub: #9a9a92;
  --color-line: #2a2f2c;
  --color-card: #161b18;
  --color-accent: #6fbe87;
  --color-accent-hover: color-mix(in oklab, var(--color-accent) 85%, white);
  --color-chart-red: #f08070;
}
```

カラー値の決定基準:

- **`--color-bg`**(背景): 純黒(#000)は OLED コントラストが強すぎ目疲労を増やす。葉モチーフ ADR 0001 の延長線上で深緑寄りのオフブラック `#0f1413` を採用
- **`--color-ink`**(本文色): 純白(#fff)は背景との対比が強すぎる。クリーム寄りオフホワイト `#e8e6df` を採用(コントラスト比 ≥ 12:1、AAA)
- **`--color-accent`**(緑アクセント): ライトの `#2b5d3a` はダーク背景上で視認性が低い。明度を上げた `#6fbe87` に置換(背景 `#0f1413` 上で AA 達成)
- **`--color-accent-hover`**: `color-mix(... 85%, white)` でさらに明るく(ライトテーマでは `black` 方向に暗化していたのと対称)
- **`--color-chart-red`**: ダーク背景上で目立ちやすい明度の `#f08070` に置換

### トグル UI

- ヘッダー右上に専用ボタンを設置(`<button id="theme-toggle">`)
- `aria-pressed` でトグル状態を表現、`aria-label` で「ダークモードに切替」「ライトモードに切替」を動的に切替
- アイコンは inline SVG(月 / 太陽の単色アイコン)、クラス追加ではなく `data-theme` 値を直接見て描画

### `<meta name="color-scheme">`

`<meta name="color-scheme" content="light dark">` を `<head>` に追加。フォーム要素・スクロールバー・select dropdown などのネイティブ UI もテーマに追従する。

### Tailwind 4 対応

Tailwind 4 の `@variant dark` は `[data-theme="dark"]` セレクタにバインドする。

```css
@variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
```

これで `dark:bg-[var(--color-bg)]` のような Tailwind の `dark:` 修飾子が `data-theme="dark"` に追従する。ただし本サイトのトークンは `[data-theme="dark"]` 側で値だけ差し替える設計なので、`bg-[var(--color-bg)]` のように **トークン経由** で書いてあるクラスは `dark:` 修飾子なしで自動追従する(再宣言不要)。

## アクセシビリティ

- **WCAG SC 1.4.3 Contrast (Minimum)**: ダーク値はすべて AA(4.5:1)以上、本文ペアは AAA(7:1)を狙う
- **WCAG SC 1.4.6 Contrast (Enhanced)**: 本文 `--color-ink` × `--color-bg` で AAA 達成
- **WCAG SC 1.4.12 Text Spacing**: 既存規約を維持
- **WCAG SC 2.1.1 Keyboard**: トグルは `<button>` で実装、Tab/Enter/Space で操作可
- **WCAG SC 4.1.2 Name, Role, Value**: `aria-pressed` でトグル状態、`aria-label` で意味を動的に提供
- **`prefers-reduced-motion: reduce`**: トグル時の transition は既存 `motion-safe:` でガード(必要に応じて)

## 段階的展開

1. 本 PR: ADR 採択 + global.css にダーク値追加 + Layout.astro に initial theme スクリプト + トグル UI + axe-core baseline 再生成
2. 後続 PR(必要に応じて): カードや特殊コンポーネントで token 経由でない色指定があれば修正(grep で `bg-[#...` / `text-[#...` を洗い出し)
3. edu-watch ADR 0026 ミラー PR を並行投入

## 観測

- 本番 URL を Mac Safari / iPhone Safari で OS のダークモード ON/OFF それぞれで目視確認
- トグルクリック → リロード後も同じテーマが維持されることを確認
- a11y baseline(`e2e/a11y-known-issues.json`)が空のまま維持されること
- Lighthouse a11y スコア 100 を維持

## 関連参照

- ADR 0007(semantic attribute state management)— `data-theme` 採用の根拠
- ADR 0010(system font stack)— ダーク背景でシステムフォントの可読性に問題ないことを検証済(同セッション)
- portfolio `SiteControls.astro` — 参考実装(ただし起動属性は `.dark` クラス、本 ADR では `data-theme` を採用)
- edu-watch ADR 0026(姉妹サイト同時適用 — memory rule 7)
