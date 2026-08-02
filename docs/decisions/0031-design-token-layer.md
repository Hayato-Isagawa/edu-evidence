# 0031. 色トークンを `@theme` に移し、出典系統の色をトークン化する

- 状態: 採用
- 日付: 2026-08-03
- 関連 PR: #(本 ADR と同一 PR で確定)

## 背景

このリポジトリは規約が散文で厚く整備されている。`docs/BRAND.md` が 5 サイト横断の色体系を、`docs/STYLE.md` が余白の 5 原則と 6 段階スケールを定め、ADR 30 本のうち 11 本が色・タイポ・ダークモード・装飾語彙を決めている。

にもかかわらず実装の一貫性は領域によって大きく違う。

| 領域 | 実測 |
|---|---|
| 余白の任意値 | **0 箇所**(STYLE.md の規律が効いている) |
| 色の任意値 | **760 箇所**(`text-[var(--color-sub)]` 258 / `text-[var(--color-accent)]` 194 / `border-[var(--color-line)]` 126 …) |
| Tailwind パレット直書き | 192 箇所(amber 68 / rose 50 / sky 48 / emerald 16) |
| 見出しのバリエーション | h1 5 種 / h2 11 種(52 箇所) / h3 11 種(58 箇所) |
| カード枠 | 25 種(52 箇所) |
| CSS / トークンの自動検査 | **ゼロ**(22 スクリプトはすべてコンテンツ検査) |

**ADR がある領域だけが一貫している。** ADR 0009 が値まで決めた FV は 22 ページで完全に統一され、ADR 0008 が決めたアクセントバーの適用範囲も守られている。分裂しているのは h2・カード枠・矢印・バッジという ADR の無い領域だった。

### 760 箇所の任意値には単一の原因がある

`--color-*` は `:root` に定義されていて `@theme` に無かった。Tailwind v4 は `@theme` の `--color-*` からユーティリティを生成するため、`:root` にある間は `text-ink` も `bg-card` も存在しない。書き手に残された唯一の手段が `text-[var(--color-sub)]` という任意値だった。

つまりこれは規律の問題ではなく、**トークンの置き場所の問題**だった。

### ハードコードが招いていたダークモードの不具合 2 件

どちらも axe が見ない性質のもの(`text-decoration-color` と装飾境界)で、8 ページ × 2 テーマの監査を通過していた。

| 箇所 | light | dark |
|---|---|---|
| 用語リンクの下線 `#2b5d3a`(`global.css:640`) | 7.30 | **2.30**(WCAG 1.4.11 の 3:1 未達) |
| `.line-chart` の枠 `rgba(0,0,0,.06)` | 約 1.2 | **1.18**(黒のため背景と同化) |

## 決定

### 1. 色とフォントのトークンを `@theme` に移す

**名前も値も変更しない。** BRAND.md が 8 つのセマンティック名をファミリー 5 サイトで共有しており、light の実値は姉妹サイトと同一である必要がある(BRAND.md §2)。dark の実値は ADR 0013 + 0015 が実測コントラストを根拠に確定させている。移すのは置き場所だけ。

```css
@theme {
  --color-bg / ink / sub / line / card / accent / chart-red
  --font-serif / sans / mono
}

:root {
  /* 派生値は @theme に置けない(var() を含むため) */
  --color-accent-hover: color-mix(in oklab, var(--color-accent) 85%, black);
}

[data-theme="dark"] { /* 従来どおり */ }
```

**`[data-theme="dark"]` の上書きは効く。** `@theme` は `@layer theme` 内に出力され、`[data-theme="dark"]` は無レイヤなので後者が勝つ。ビルド済み CSS の出力順と、実際の computed style の両方で確認した(light `--color-ink: #1a1a1a` → dark `#d0d3dc`、`--color-accent-hover` の色混合も追随)。

生成されるユーティリティも確認済み。

```css
.text-ink{color:var(--color-ink)}
.bg-card{background-color:var(--color-card)}
.border-line{border-color:var(--color-line)}
```

`var()` 参照を保つので、テーマ切替はランタイムで効いたままになる。

### 2. 出典系統・コスト・評価の色をトークン化する

ADR 0016 は Hattie の amber に `dark:` 変種を足す対症療法を選び、「構造的なトークン化は将来課題として残す」と明記した。その将来をここで回収する。

| トークン | 由来 | 用途 |
|---|---|---|
| `--color-source-eef` / `-bg` | sky-800 / sky-50(dark: sky-200 / 10% 混色) | EEF バッジ |
| `--color-source-japan` / `-bg` | rose-700 / rose-50(dark: rose-200 / 同) | 日本のエビデンス |
| `--color-source-hattie` / `-bg` | amber-800 / amber-50(dark: amber-200 / 同) | Hattie |
| `--color-cost` | emerald-700(dark: emerald-300) | コスト表示 |
| `--color-rating` | amber-600 | ★ 表示 |

**値は Tailwind パレットの実値をそのまま移した**ので見た目は変わらない。境界色は各系統の 40% 混色で導出する(現行の `/40` と同義)。

### 3. ADR 0016 の「japan = 緑」を訂正する

ADR 0016 の対象表は日本のバッジを緑と書いているが、実装は一貫して rose(`text-rose-700` 10 箇所 / `dark:text-rose-200` 10 箇所)である。**実装を正とし、ドキュメント側を誤りとする。** 色は動かさない。

理由は 2 つ。緑は `--color-accent` がサイト全体で担っており、出典系統の 1 つに緑を割り当てると意味が衝突する。そして rose での運用実績がすでに 20 箇所ある。

### 4. `--leading-hero: 1.15` を定義する

ADR 0009 が決めた H1 の行送り。25 箇所すべてが `leading-[1.15]` という任意値で書かれていた。

### 5. ハードコード色をトークン参照に置き換える

- 用語リンクの下線と hover 色 → `var(--color-accent)`
- `.line-chart` の枠と表の罫線 → `var(--color-line)`、見出しセルの背景 → `var(--color-card)`

`box-shadow` の `rgba(0,0,0,…)` は対象外。影は両テーマで黒が正しい。

### 6. 余白には触らない

任意値がゼロで STYLE.md の 6 段階が守られている。ここに手を入れる理由がない。

## 影響

- `global.css` に +48 / −11 行。トークン 10 個を追加(出典 6 + コスト + 評価 + leading-hero、dark 変種 7)
- **見た目が変わるのはダークモードのバグ修正 2 件のみ**。用語リンクの下線が dark で 2.30 → 7.94、チャート枠が両テーマで同程度の視認性に揃う
- 既存の 760 箇所の任意値と 192 箇所のパレット直書きは**本 PR では置換しない**。ユーティリティが生えたので後続 PR で段階的に移す
- 型チェック 0 errors、E2E 50 件、a11y 16 件(8 ページ × light/dark)すべて通過

## 関連

- ADR 0008: 直線アクセントバーの適用範囲(装飾語彙の先例)
- ADR 0009: FV の縦積み構造(`--leading-hero` の由来)
- ADR 0011 / 0013 / 0015: ダークモードの方式と実値(本 ADR は値を変更しない)
- ADR 0016: Hattie amber の dark 変種(本 ADR 決定 2 で構造化、決定 3 で japan の表記を訂正)
- ADR 0030: dark コントラストと両テーマ監査(本 ADR のバグ 2 件は同監査を通過していた = axe が見ない領域だった)
- `docs/BRAND.md` §2: ファミリー共通の色トークン(名前と値の制約元)
- `docs/STYLE.md`: 余白の規律(本 ADR が触れない領域)
