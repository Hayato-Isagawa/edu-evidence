# EduEvidence JP — Spacing Style Guide

このドキュメントは padding / margin / gap の使い分けと、サイト全体で使うスペーシングスケールを定義します。新規ページ / コンポーネント追加時、既存コードのリファクタ時、コードレビュー時の判断基準としてください。

> **コンテンツ追加時(strategy / column の追加・編集)** は [CONTENT_GUIDELINES.md](./CONTENT_GUIDELINES.md) を必ず参照。エビデンスベースのサイトとして守るべき編集ポリシー(数値・引用論文の検証ルール)を定めています。

---

## 0. 基本方針

> **役割でツールを選ぶ。値ではなく構造で揃える。**

- 「内側の余白」 → padding
- 「flex / grid 子要素の間隔」 → gap
- 「通常フロー下の縦リズム」 → 親の `space-y-*`(= owl selector)
- 「個別の例外」 → `mt-*` / `mb-*`(最終手段)

---

## 1. 5原則

### 原則 1 — インナー幅は **必ず padding** で確保

`max-w-*` の中身を内側に寄せる余白は padding で書く。`mx-*` で代替しない。

```html
<!-- OK -->
<main class="mx-auto max-w-6xl px-3 xs:px-4 sm:px-6 md:px-10">

<!-- NG -->
<main class="max-w-6xl mx-6">
```

### 原則 2 — セクション間の縦リズムは **section 自身の `py-*`** が持つ

各セクションが自分の上下余白を抱える。次のセクションを margin で押し下げない。

```html
<!-- OK -->
<section class="py-10 xs:py-14 sm:py-20 md:py-28">...</section>
<section class="py-10 xs:py-14 sm:py-20 md:py-28">...</section>

<!-- NG -->
<section class="py-20">...</section>
<section class="mt-20 pb-20">...</section>
```

### 原則 3 — 兄弟要素の縦間隔は **親の `space-y-*`** に集約

`mb-*` / `mt-*` を子に散らさない。親が一括管理する。

```html
<!-- OK -->
<div class="space-y-6">
  <p class="font-mono text-xs">EYEBROW</p>
  <h1 class="text-5xl">Heading</h1>
</div>

<!-- NG -->
<div>
  <p class="font-mono text-xs mb-6">EYEBROW</p>
  <h1 class="text-5xl">Heading</h1>
</div>
```

### 原則 4 — flex / grid の中は **`gap-*` 一択**

子要素に `mr-*` / `ml-*` / `mb-*` を書かない。

```html
<!-- OK -->
<div class="flex gap-4">
  <a>...</a><a>...</a><a>...</a>
</div>

<!-- NG -->
<div class="flex">
  <a class="mr-4">...</a>
  <a class="mr-4">...</a>
  <a>...</a>
</div>
```

### 原則 5 — コンポーネントは **外側 margin を持たない**

再利用コンポーネント(`StrategyRow` 等)に `mb-*` / `mt-*` を書かない。間隔は親が `space-y-*` / `gap-*` で決める。

```html
<!-- OK -->
<div class="space-y-0">
  <StrategyRow />
  <StrategyRow />
</div>

<!-- NG -->
<StrategyRow class="mb-8" />
```

---

## 2. スペーシングスケール(6段階)

「どの値を使うべきか」を揃えるための共通スケール。**この6段階以外の値は使わない**。

| 用途 | base (<480) | xs: (≥480) | sm: (≥640) | md: (≥768) | Tailwind 値 |
|---|---|---|---|---|---|
| **Micro** — アイコンと文字、密接ペア | 4 | 4 | 4 | 4 | `*-1` |
| **Tight** — ラベルと値、行内の小要素 | 8 | 8 | 8 | 8 | `*-2` |
| **Default** — 段落、リスト項目間 | 12 | 12 | 12 | 12 | `*-3` |
| **Block** — ブロック要素同士 | 16 | 16 | 16 | 16 | `*-4` |
| **Group** — 見出しと本文ブロック | 24 | 24 | 24 | 24 | `*-6` |
| **Section** — セクション垂直余白 | 40 | 56 | 80 | 112 | `*-10/14/20/28` |

### スケール適用例

```html
<!-- Micro: ラベルと値が一体 -->
<div class="space-y-1">
  <div class="text-xs text-sub">サーバー</div>
  <div class="text-xl font-black">¥3,000</div>
</div>

<!-- Tight: 見出しと密に続く本文 -->
<div class="space-y-2">
  <h3 class="font-bold">具体的なイメージ</h3>
  <p>...</p>
</div>

<!-- Default: 連続する段落 -->
<div class="space-y-3">
  <p>...</p>
  <p>...</p>
  <p>...</p>
</div>

<!-- Block: カード内のブロック要素 -->
<div class="border rounded-xl p-6 space-y-4">
  <h2>Title</h2>
  <div>...</div>
</div>

<!-- Group: 見出しグループ -->
<div class="space-y-6">
  <h2>Section Title</h2>
  <div>...</div>
</div>

<!-- Section: ページのセクション -->
<section class="py-10 xs:py-14 sm:py-20 md:py-28">...</section>
```

---

## 3. インナー幅 padding スケール

サイト共通のコンテナ(`max-w-6xl`)の左右 padding。

| ブレークポイント | 値 |
|---|---|
| base (<480) | `px-3`(12px) |
| xs: (≥480) | `px-4`(16px) |
| sm: (≥640) | `px-6`(24px) |
| md: (≥768) | `px-10`(40px) |

```html
<div class="mx-auto max-w-6xl px-3 xs:px-4 sm:px-6 md:px-10">...</div>
```

---

## 4. ブレークポイント定義

| 名前 | 幅 | 用途 |
|---|---|---|
| (base) | 0+ | コンパクトスマホ(320–479) |
| `xs:` | 480+ | 標準/大型スマホ(480–639) |
| `sm:` | 640+ | 横持ちスマホ・小型タブレット(640–767) |
| `md:` | 768+ | タブレット縦・小型 PC(768–1023) |
| `lg:` | 1024+ | デスクトップ(1024+) |
| `xl:` | 1280+ | 大型デスクトップ |
| `2xl:` | 1536+ | 超大型 |

`xs: 480px` は `global.css` で `--breakpoint-xs: 30rem` として定義済み。

---

## 5. h3 ネストパターン

入れ子の見出し(h2 配下に h3 が複数)では「外側スケール = 内側スケール × 3 倍」のリズムを守る。

```html
<!-- 外側 space-y-6(Group)、内側 space-y-2(Tight) -->
<div class="space-y-6">
  <p>導入文</p>

  <div class="space-y-2">
    <h3 class="font-bold">①小見出し</h3>
    <p>本文</p>
  </div>

  <div class="space-y-2">
    <h3 class="font-bold">②小見出し</h3>
    <p>本文</p>
  </div>
</div>
```

これにより `h3` の前に強いリズム(24px)、`h3` の後に弱いリズム(8px)が自然に生まれます。

---

## 6. 認められた例外

以下のケースに限り `mt-*` / `mb-*` を使ってよい。

| ケース | 例 |
|---|---|
| **ベースライン微調整(< 4px)** | `mt-0.5`(2px)— アイコンとテキストの視覚的中央揃え |
| **レスポンシブで列構成が変わる時の垂直オフセット** | `mt-2 md:mt-0`(モバイル時のみ列ラップ後に追加スペース) |
| **既存ライブラリ / プラグインが要求** | `prose` 等のサードパーティ CSS |

これら以外で `mt-*` / `mb-*` を書く必要が出たら、まず親の構造で解決できないか考える。

---

## 7. コードレビュー判定

PR や新規実装時、以下のいずれかに該当したら指摘:

- [ ] `mx-*` でインナー幅を作っている → padding に変える
- [ ] `mt-*` / `mb-*` が3つ以上連続している兄弟要素 → 親の `space-y-*` に集約
- [ ] `flex` / `grid` の子に `mr-*` / `ml-*` がある → 親の `gap-*` に変える
- [ ] スケール6段階(1, 2, 3, 4, 6, 10/14/20/28)以外の値が使われている → 近いスケール値に丸める
- [ ] コンポーネントが外側 margin を持っている → 削除し、利用側で `space-y-*` 管理
- [ ] 「次のセクション」に `mt-*` を付けている → 当該セクションの `py-*` に統合

---

## 8. 関連ファイル

- `src/styles/global.css` — `--breakpoint-xs` 定義
- `src/layouts/Layout.astro` — インナー幅 / footer の参考実装
- `src/pages/index.astro` — `space-y-*` パターンの参考実装
- `src/components/StrategyRow.astro` — 「コンポーネントが外側 margin を持たない」例
