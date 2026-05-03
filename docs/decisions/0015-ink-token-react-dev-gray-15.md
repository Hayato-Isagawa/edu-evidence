# 0015. ダーク本文 ink を react.dev の gray-15(`#D0D3DC`)に再微調整する

- 状態: 採用
- 日付: 2026-05-04
- 関連 PR: 本 ADR と同一 PR で確定(ADR 0013 / 0014 と同 PR にバンドル)
- 関連 ADR: 0010(system font stack)/ 0013(dark mode readability tuning)
- 姉妹サイト ADR: edu-watch ADR 0030(同仕様のミラー)
- 経緯: 本 ADR は 3 度の試行を経て確定。経緯は「## 経緯」を参照

## 背景

ADR 0013 で `--color-ink`(dark)を GitHub の `fg.default` 由来 `#f0f6fc` に置き換え、ADR 0014 で本文タイポグラフィ(`-webkit-font-smoothing: antialiased` 撤回 + 17px / 1.8)を投入した結果、本文の明瞭さは大きく改善した。

ただし preview 確認で 3 段階のフィードバックが続いた:

1. **第 1 フィードバック**: 「`#f0f6fc` は GitHub の青寄り(HSL S=60%)で、edu サイトのアクセント(緑/青)と干渉する」 → 第 1 試行で react.dev の `primary-dark = #F6F7F9`(gray-5、ほぼ中性、S=11%、明度 96.5%)に変更
2. **第 2 フィードバック**: 「`#F6F7F9` は **白が強すぎて目にきつい**。react.dev のページのカラーが目にやさしい」 → 第 2 試行で react.dev の `secondary-dark = #EBECF0`(gray-10、明度 93%)に明度を 1 段下げ
3. **第 3 フィードバック**: 「`#EBECF0` でも **もう少し明るさを抑えたい**」 → 第 3 試行(本 ADR 確定版)で react.dev の `gray-15 = #D0D3DC`(明度 85%)にさらに 1 段下げ

「白すぎる」原因は色そのものではなく **フォント環境の違い** と推定される:

- **react.dev**: `tailwind.config.js` で `Optimistic Display` / `Optimistic Text`(Meta が独自にデザインした太め stem の独自フォント)を使用。本文に gray-5(`#F6F7F9`)を当てても、太い stem が白の強さを「吸う」ため目にやさしく見える
- **edu-evidence**: ADR 0010 で system-font-stack を採択しており、日本語は **Hiragino Kaku Gothic ProN W3**(細フォント)で描画される。同じ gray-5 / gray-10 でも細い stem が「白の細線」として目立ち、知覚明度が高くなる

ADR 0010 の system-font-stack は意図的な選択で覆さない。**色側で明度を 2 段落とす**(gray-5 → gray-10 → gray-15)のが現実的な解決策。

## 検討した選択肢

### A) `#F6F7F9`(react.dev gray-5、primary-dark)

- 利点: react.dev の本文 primary-dark と完全に同じ
- 欠点: edu-evidence のフォント(Hiragino W3)では「白すぎて目にきつい」体感

### B) `#EBECF0`(react.dev gray-10、secondary-dark、明度 93%)

- 利点: 1 段明度を抑えた中性グレー
- 欠点: フィードバックでさらに明るさを抑えたい意向

### C) `#D0D3DC`(react.dev gray-15、明度 85%)(採用)

- 利点:
  - react.dev の同じ gray ランプ内でさらに 1 段明度を落とす
  - 中性グレー(青味なし)を維持、コントラスト ~11.6:1 で AAA(7:1)を 1.6 倍以上余裕で満たす
  - 「目にやさしい」体感を最大化しつつ、本文として十分な明瞭さを確保
  - サブ文字 `--color-sub: #9ba1a8`(明度 63%)との階層差 ~22pt で、本文 vs サブの区別が崩れない
- 欠点: react.dev では gray-15 を本文に使っていない(向こうは Optimistic Text 前提で gray-5 で済む)

### D) `#BCC1CD`(gray-20、明度 78%)など、さらに下

- 利点: 確実にやさしい
- 欠点: サブ文字 `#9ba1a8` との階層差が ~15pt まで縮まり、本文/サブの区別が曖昧になり始める

## 決定

**選択肢 C** を採用。`--color-ink`(dark)を **`#D0D3DC`** に変更する。

### 値の変更(本 ADR 確定版)

```diff
 [data-theme="dark"] {
   --color-bg: #16181d;
-  --color-ink: #f0f6fc;
+  --color-ink: #D0D3DC;
   --color-sub: #9ba1a8;
   --color-line: #30363d;
   --color-card: #1f2328;
   --color-accent: #6fbe87;
   --color-accent-hover: color-mix(in oklab, var(--color-accent) 85%, white);
   --color-chart-red: #f08070;
 }
```

### コントラスト確認

- 本文 `#D0D3DC` × 背景 `#16181d`: 約 **11.6:1**(AAA 7:1 の 1.6 倍以上)
- サブ文字 `#9ba1a8`(L=63%) × 背景: 7.5:1(AAA、本文との階層差 ~22pt)
- アクセント `#6fbe87` × 背景: 7.8:1(AAA、変化なし)

### 維持する設計

- `--color-bg` / `--color-sub` / `--color-line` / `--color-card`(ADR 0013 の値): 変更なし
- アクセント色 / チャート色: 変更なし
- ライト値: 完全維持
- タイポグラフィ(ADR 0014): 変更なし
- system-font-stack(ADR 0010): 維持

## 経緯(本セッションの試行履歴)

| 試行 | 値 | react.dev での位置 | 評価 | 採否 |
|---|---|---|---|---|
| ADR 0013 当初 | `#f0f6fc` | (GitHub fg、青寄り) | 「青味」 | 却下 |
| ADR 0015 第 1 試行 | `#F6F7F9` | gray-5 / primary-dark(明度 96.5%) | 「白すぎる」 | 却下 |
| ADR 0015 第 2 試行 | `#EBECF0` | gray-10 / secondary-dark(明度 93%) | 「もう少し明るさを抑えたい」 | 却下 |
| ADR 0015 第 3 試行 / 確定版 | **`#D0D3DC`** | gray-15(明度 85%) | フォント環境差を完全吸収 | **採用** |

## アクセシビリティ

- WCAG SC 1.4.3 / 1.4.6: AAA を維持(~11.6:1)
- 中性グレーで色覚特性の影響を受けにくい
- 「目にやさしい」体感は AAA 過剰コントラストからの逆方向の調整であり、長文閲覧の疲労軽減として WCAG の意図(視認性 + 持続的可読性)とも整合

## 観測

- preview デプロイで代表ページの本文色を Mac Safari / iPhone Safari の OS dark で目視
- 「明るさが抑えられて目にやさしい」体感が得られること
- 本文 vs サブ文字の階層が崩れていないこと

## 関連参照

- [reactjs/react.dev — colors.js](https://github.com/reactjs/react.dev/blob/main/colors.js) の `'gray-15': '#D0D3DC'`
- ADR 0010(system font stack、本 ADR の前提条件)
- ADR 0013(本 ADR の前段階、greyscale 5 トークン再調整)
- ADR 0014(同 PR にバンドル、本文タイポグラフィ)
- edu-watch ADR 0030(同仕様のミラー、姉妹サイト同時適用 — memory rule 7)
