# 0009. ファーストビュー(Hero)は縦積み + 大型 H1 を共通スタイルとする

- 状態: 採用
- 日付: 2026-05-02
- 関連 PR: 本 ADR と同一 PR で確定。後続 PR で全 FV ページ + 姉妹サイト edu-watch にも展開
- 関連 ADR: 0001(plant-motif brand)/ 0007(semantic attribute state)

## 背景

`/`(トップ)・`/columns`(コラム一覧)・`/concerns`(悩み一覧)・`/policy-evidence`・コラム個別ページ・戦略個別ページ・ガイド系・FAQ・About など、サイトの各ページ冒頭(ファーストビュー = FV)はこれまで **12-col grid の 2 列レイアウト**(左 8 に kicker + H1、右 4 に説明文)で実装してきた。

姉妹サイト edu-watch は同じ Layout / global.css を共有しているにもかかわらず、FV だけは **縦積み(stacked)レイアウト**(kicker → H1 → 説明文 → メタ情報)で実装されており、両サイトで FV の文法が分かれていた。

実機で並べると次の点が確認された:

- edu-evidence の 2 列レイアウトは、デスクトップで H1 と説明文が左右に分離するため、視線を H1 から説明文へ移すときに大きな水平移動が発生する
- 説明文ブロックの幅が右 col-span-4 = 約 280-360px に固定されるため、3 段落の説明文が縦に長くなり、密度が上がりすぎる
- モバイルでは grid-cols-12 が縦積みになり、レイアウトがブレる(デスクトップとモバイルでメタファーが揃わない)
- edu-watch の H1 は `text-3xl sm:text-4xl md:text-5xl` で、edu-evidence の `text-5xl md:text-7xl` より明らかに小さく、姉妹サイトとして印象が揃わない

2024–2026 年の主要モダンサイト(Stripe / Linear / Vercel / Anthropic / Apple など)はいずれも **縦積み Hero + 大型 H1 + `max-w-2xl` 程度の説明文** を採用しており、12-col grid の左右分割は editorial / news 系の限定的な文脈に残るだけになっている。

## 検討した選択肢

### A) 現状の 2 列レイアウトを維持し、edu-watch を edu-evidence に揃える

- 利点: edu-evidence の既存実装を全面的に維持できる
- 欠点:
  - モダン Web のスタンダードからは外れた古い editorial 様式が続く
  - モバイルとデスクトップでメタファーが揃わない問題は解消しない
  - edu-watch の縦積み実装を 2 列レイアウトへ書き換えるのは情報量と合わない

### B) edu-watch の縦積みレイアウト + edu-evidence の H1 サイズ感で共通化(採用)

- 利点:
  - 視線の流れが上から下へ一直線で、論理順序と視覚順序が揃う(WCAG SC 1.3.2 と整合)
  - レスポンシブが自然 — モバイルもデスクトップも同じ縦積み構造、breakpoint 差分が H1 サイズと余白だけ
  - 説明文を `max-w-2xl`(約 672px = 60–75 字 / 行)で読みやすく抑えられる
  - 大型 H1 がページのランドマーク要素として機能する印象を保てる
- 欠点: edu-evidence の FV ページを全件書き換える工数(機械的)

### C) 各ページごとに最適なレイアウトを選ぶ

- 利点: 自由度が高い
- 欠点: 規約として機能せず、ページ間の一貫性が崩れる(ブランド毀損)

## 決定

ファーストビュー(各ページ冒頭の `<section>`)は次の共通スタイルで実装する。edu-evidence・edu-watch 両サイトに同方針を適用する。

### 構造

```html
<section class="pt-10 sm:pt-14 md:pt-20 lg:pt-28 pb-10 sm:pb-14 md:pb-20 border-b border-[var(--color-line)]">
  <p class="font-mono text-xs uppercase tracking-widest text-[var(--color-accent)]">
    {Kicker テキスト(英語、Eyebrow ラベル)}
  </p>
  <p class="mt-1 text-xs text-[var(--color-sub)]">
    {Sub-kicker(任意、日本語ラベル)}
  </p>
  <h1 class="mt-5 font-black text-4xl sm:text-5xl md:text-6xl lg:text-7xl leading-[1.15] tracking-tight">
    {ページの主見出し}
  </h1>
  <div class="mt-6 max-w-2xl space-y-4 text-[var(--color-sub)] text-sm sm:text-base leading-loose">
    <p>{説明文 1}</p>
    <p>{説明文 2}</p>
  </div>
</section>
```

### 決定値

| 要素 | 値 |
|---|---|
| H1 レスポンシブ | `text-4xl sm:text-5xl md:text-6xl lg:text-7xl`(36px → 48px → 60px → 72px) |
| H1 line-height | `leading-[1.15]` |
| H1 letter-spacing | `tracking-tight` |
| H1 font-weight | `font-black`(900) |
| 説明文の最大幅 | `max-w-2xl`(672px) |
| 説明文の line-height | `leading-loose` |
| Kicker | `font-mono text-xs uppercase tracking-widest text-[var(--color-accent)]` |
| Section padding | `pt-10 sm:pt-14 md:pt-20 lg:pt-28 pb-10 sm:pb-14 md:pb-20`(下端は次セクションへの接続度合いに応じて pb 削減可) |
| Border | `border-b border-[var(--color-line)]`(セクション区切りが必要なページ) |

### 適用先

- edu-evidence の全 FV ページ(トップ、コラム一覧、コラム個別、悩み一覧、policy-evidence、ガイド系、About、FAQ、changelog、検索、404 等)
- edu-watch の全 FV ページ(トップ、ダイジェスト一覧・個別、カテゴリ別、媒体別、About、changelog 等)

ページごとに必要な要素(メタ情報行、CTA ボタン、検索バー等)は H1 と説明文ブロックの **下** に追加する。FV の主軸は kicker + H1 + 説明文 の縦積みで固定する。

### 例外

- **個別記事系ページ**(コラム個別 / 戦略個別 / ダイジェスト個別)は、frontmatter のメタ情報(日付・タグ・出典バッジなど)を H1 直下に置く必要があるため、H1 サイズは 1 段下げて `text-3xl sm:text-4xl md:text-5xl lg:text-6xl` を使ってよい(ページ階層が一段下がるため)
- **記事本文との視覚的つながり** を優先する個別ページでは、`pb-*` を `pb-8 sm:pb-10` 程度に詰めてよい

## アクセシビリティ

- **WCAG SC 1.3.2 Meaningful Sequence**: 縦積みは論理順序 = 視覚順序、達成
- **WCAG SC 1.4.4 Resize text**: Tailwind の `text-{size}` は rem ベースで定義され、200% ズーム可
- **WCAG SC 1.4.10 Reflow**: 縦積みは 320px 幅でも overflow なし
- **WCAG SC 2.4.6 Headings and Labels**: H1 は各ページ 1 つで明確、ランドマークとしての役割を保つ
- **コントラスト比**: 既存トークン(`--color-ink` / `--color-accent` / `--color-sub`)を維持、AA 達成済み

## 段階的展開

1. 本 PR: ADR 採択 + edu-evidence のトップページ FV(`src/pages/index.astro`)を先行適用
2. 後続 PR: edu-evidence の他 FV ページ全件適用(機械的)
3. 後続 PR: edu-watch の全 FV ページに同スタイル適用(H1 サイズが大きくなる方向の更新)

## 関連参照

- `docs/STYLE.md` 全体(Spacing 規約)— FV の上下 padding は本 ADR の値を採用、それ以外は `STYLE.md` のスケールに従う
- `docs/CONTENT_GUIDELINES.md` Rule 1.11 — コラム本文の経験談セクションは本 ADR の対象外(本文セクションのスタイル)
