# 0014. 本文タイポグラフィを可読性重視にチューニングする

- 状態: 採用
- 日付: 2026-05-03
- 関連 PR: 本 ADR と同一 PR で確定(ADR 0013 と同 PR にバンドル)
- 関連 ADR: 0010(system font stack)/ 0013(dark mode readability tuning)
- 姉妹サイト ADR: edu-watch ADR 0029(同仕様のミラー)

## 背景

ADR 0013 で dark の greyscale 値を再調整し背景・本文色の階調は改善されたが、本番運用で **本文(`.prose-article`)が依然として「読みにくい」「薄く感じる」** というフィードバックが残った(2026-05-03、ADR 0013 マージ前 preview 確認時点)。

本文系の現状設定を点検すると、3 つの要因が積み重なっていた:

1. `html` に `-webkit-font-smoothing: antialiased` を明示
2. `.prose-article` の `font-size: 16px`(UI には十分だが本文には小さい)
3. `.prose-article` の `line-height: 1.95`(やや広い)

それぞれが dark 環境での「文字の痩せ」「行間スカスカ」「視線移動の長さ」を生んでいた。

### 原因の分析

#### `-webkit-font-smoothing: antialiased`

Safari / Chrome で **サブピクセルレンダリングを強制的に切る** ベンダープレフィックス。subpixel-antialiased(既定挙動)に比べて文字 stem が細く描画される。**dark 背景 + light 文字** では特にこの差が顕著で、stem の細さが「薄い」「読みにくい」体感を生む。

近年のモダンサイト(react.dev、GitHub、Vercel など)はこの宣言を **明示的に置いていない**(=ブラウザ既定の `auto` に任せる)ことを直近の確認(react.dev 本体 CSS bundle 直接取得)で検証済み。

#### `font-size: 16px` の小ささ

長文閲覧の現代標準は **17–18px**(react.dev は約 17px、Medium は 18–21px)。16px は UI 要素には十分だが、本文の長文には小さい。日本語は欧文より字面が複雑で、同じ font-size でも視認性が落ちやすい。

#### `line-height: 1.95` の広さ

`body` は 1.8、`.prose-article` は 1.95 とそこから上乗せされていた。1.95 は段落内の縦移動が大きく、視線が「次の行を探す」コストを上げ、「文字がスカスカ」「沈んだ」印象を生む。長文の現代標準は **1.7–1.85** 帯。

## 検討した選択肢

### A) `font-smoothing` 撤回のみ

- 利点: 1 行の変更
- 欠点: font-size と line-height が業界標準から外れているため、根本的な読み味改善には不十分

### B) A + `font-size` 17px + `line-height` 1.8(採用)

- 利点:
  - 3 要因をまとめて解消
  - light テーマにも好影響(本文サイズ・行間は light/dark 共通の改善)
  - react.dev / Medium の長文体験帯に揃う
- 欠点: light テーマにも影響するので、light 側も合わせて目視確認が必要

### C) B + dark 時のみ `font-weight: 450` 程度を上書き

- 利点: dark 文字 stem の太さを底上げできる
- 欠点: edu サイトは ADR 0010 で system-font-stack を採用しており、Hiragino Kaku Gothic ProN は Variable Font ではなく **W3 (400) と W6 (500) の 2 段階**。中間値 450 は無効化され 400 のまま、500 を指定すると一気に太る。リスクに対する効果が読めない

## 決定

**選択肢 B** を採用。本文のタイポグラフィ 3 要因を一括で調整する。

### 変更内容

```diff
 html {
   font-family: var(--font-sans);
   background: var(--color-bg);
   color: var(--color-ink);
   font-feature-settings: "palt";
-  -webkit-font-smoothing: antialiased;
   text-rendering: optimizeLegibility;
   ...
 }

 .prose-article {
-  font-size: 16px;
-  line-height: 1.95;
+  font-size: 17px;
+  line-height: 1.8;
   text-wrap: pretty;
 }
```

### 維持する要素

- `text-rendering: optimizeLegibility`: ligature / kerning の品質向上に有用、削除しない
- `font-feature-settings: "palt"`: 日本語の半角プロポーショナルを維持
- `body { line-height: 1.8 }`: そのまま(`.prose-article` の 1.8 と一致するようになる)
- `.prose-article` の段落・見出し・リスト・引用・テーブルなど、他の組版規約: 変更なし
- ADR 0010 の system-font-stack: 維持

### 注: PR 構成について

本 ADR は ADR 0013(dark greyscale tuning)と同 PR にバンドルする。理由:

- ユーザーフィードバックの起点が「ダークモードが読みにくい」であり、`#152` の preview 確認の延長で本問題が浮上した
- light/dark で挙動が分かれない改善(`font-smoothing` / `font-size` / `line-height` は全テーマ共通)であり、ADR 0013 の dark 専用調整と組み合わせて読み味が完成する
- 別 PR にすると preview 確認が二度手間になる

PR タイトル / 本文は両 ADR の対象を明示する。

## アクセシビリティ

- WCAG SC 1.4.4 Resize text: 17px は rem 換算可、200% ズームでも崩れない
- WCAG SC 1.4.8 Visual Presentation: line-height 1.8 は推奨範囲(1.5 以上)を満たす
- WCAG SC 1.4.12 Text Spacing: line-height / paragraph spacing の調整余地を保持
- font-smoothing 撤回はブラウザ既定の最適化に任せるため、OS のアクセシビリティ設定(高コントラスト等)とも整合しやすい

## 観測

- preview デプロイで代表ページ(コラム個別 / 戦略個別 / FAQ / ガイド)の本文を Mac Safari / iPhone Safari の light/dark 双方で目視
- light テーマで本文が「太く感じる」副作用が無いこと(`font-smoothing` 撤回はブラウザ既定の subpixel 描画に戻るだけで、過剰太字化はしない見込み)
- E2E 全件 pass、a11y baseline に変化なし

## 関連参照

- ADR 0010(system font stack、本 ADR の前提)
- ADR 0013(dark mode readability tuning、同 PR にバンドル)
- react.dev 本体 CSS bundle(`-webkit-font-smoothing` を明示しないモダンサイトの実例)
- edu-watch ADR 0029(同仕様のミラー、姉妹サイト同時適用 — memory rule 7)
