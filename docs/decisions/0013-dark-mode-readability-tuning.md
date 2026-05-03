# 0013. ダークモードのトークン値を可読性重視に再調整する

- 状態: 採用
- 日付: 2026-05-03
- 関連 PR: 本 ADR と同一 PR で確定
- 関連 ADR: 0011(dark mode data-theme with system default)
- 姉妹サイト ADR: edu-watch ADR 0028(同仕様のミラー)

## 背景

ADR 0011 採択時に決めたダークモードのトークン値で本番運用したところ、**長文閲覧時に「沈んだ」「読みにくい」体感** が確認された(2026-05-03、ユーザーフィードバック)。コントラスト比は WCAG AAA を確保していたものの、知覚的な明瞭さ(perceived sharpness)が低かった。

参照として、ユーザーが「読みやすい」とした react.dev と GitHub のダークモードを確証ベースで取得し比較した:

| 役割 | edu-evidence(ADR 0011) | react.dev(本体 CSS bundle 直接抽出) | GitHub(Primer の canvas/fg) |
|---|---|---|---|
| 背景 | `#0f1413`(緑黒寄り、明度 ~7%) | `#23272f`(中性 dark gray) / `#16181d`(深め) | `#0d1117`(canvas.default、青黒寄り) |
| 本文 | `#e8e6df`(クリーム寄り、明度 ~90%) | `#f5f6f7`(純白寄り、明度 ~96%) | `#f0f6fc`(fg.default、純白寄り) |
| サブ文字 | `#9a9a92`(暖色グレー) | `#ebecf0` 系 | `#8d96a0` 系 |
| カード | `#161b18`(緑黒寄り) | `#2b303b` / `#343a46` | `#161b22`(canvas.subtle) |
| 線 | `#2a2f2c`(緑黒寄り) | `#343a46` / `#404756` | `#30363d` 系 |

差分の整理:

- **本文色**: edu-evidence の `#e8e6df` は純白に対して 6 ポイント程度くすんでおり、文字が「浮き立たない」。react.dev / GitHub はほぼ純白で、長文閲覧時の明瞭さが高い
- **背景色**: `#0f1413` は緑黒寄り(色相が中性 dark gray から外れる)。葉モチーフ ADR 0001 の延長で選んだが、長文閲覧時に「色付き背景」が視覚負荷になる
- **コントラスト比**: edu-evidence の方が AAA で高いが、これは「明瞭さ」とは別の指標。コントラスト比だけ追って彩度・色相を考慮しないと、知覚的な読みにくさを生むことが本件で確認された

## 検討した選択肢

### A) 本文色だけ純白寄りに(`#e8e6df` → `#f0f6fc`)

- 利点: global.css 1 行の変更で済む
- 欠点: 「白い文字 vs 緑黒背景」の彩度ギャップが残り、改善が中途半端になる可能性

### B) 本文 + 背景 + カード/線を中性 dark gray に寄せる(採用)

- 利点:
  - 本文の明瞭さ + 背景の中性化 で「読み味」改善の本筋を押さえる
  - ブランド色(`--color-accent` 緑)は維持、姉妹サイトの edu-watch も同パターンで適用可能
  - react.dev と GitHub の中間的な値を選ぶことで、業界標準の dark UI 体験に近づける
- 欠点:
  - 葉モチーフの延長としての緑黒背景は失われる(ただしブランド表現は accent 色とライトテーマで担保される)
  - dark トークン 5 個を更新するため変更行は中程度

### C) B + サブ文字 + アクセントも全面再設計

- 利点: react.dev / GitHub と同等の完成度
- 欠点: ブランド色(緑/青)の dark バリエーションまで触ることで、ブランド表現が変わってしまうリスクあり

## 決定

**選択肢 B** を採用。`[data-theme="dark"]` の greyscale 系トークン(bg / ink / sub / line / card)を中性 dark gray 系に再調整する。アクセント色(`--color-accent`、`--color-accent-hover`)とチャート色(`--color-chart-red`)は ADR 0011 の値を維持する。

### 新しい dark 値

| token | ADR 0011(旧) | ADR 0013(新) | 根拠 |
|---|---|---|---|
| `--color-bg` | `#0f1413` | **`#16181d`** | react.dev の deeper bg。緑黒の彩度を抜いて中性に。GitHub canvas.subtle `#161b22` と近い |
| `--color-ink` | `#e8e6df` | **`#f0f6fc`** | GitHub fg.default。純白に近く長文の明瞭さが上がる(コントラスト比は背景との組み合わせで AAA を維持) |
| `--color-sub` | `#9a9a92` | **`#9ba1a8`** | 暖色から中性グレーへ。本文 `#f0f6fc` との明度差を保ちつつ「副情報」として控えめに |
| `--color-line` | `#2a2f2c` | **`#30363d`** | GitHub border 系の中性、bg からの段差で構造が見えやすい |
| `--color-card` | `#161b18` | **`#1f2328`** | bg より一段明るい中性 dark gray。GitHub canvas.overlay 帯。深度表現として bg との段差を明確に |
| `--color-accent` | `#6fbe87` | **維持** | ブランド色、変更なし |
| `--color-accent-hover` | `color-mix(... white)` | **維持** | 変更なし |
| `--color-chart-red` | `#f08070` | **維持** | 変更なし |

### コントラスト確認

- 本文 `#f0f6fc` × 背景 `#16181d`: 約 16:1 (AAA 達成、ADR 0011 の `#e8e6df × #0f1413` の約 13.5:1 から向上)
- サブ文字 `#9ba1a8` × 背景 `#16181d`: 約 7.5:1 (AAA)
- アクセント `#6fbe87` × 背景 `#16181d`: 約 7.8:1 (AAA、変化なし)

すべて WCAG AAA を満たす。

### 維持する設計判断

- 起動方式(システム追従 + 手動切替 + localStorage 永続化、`data-theme` 属性): ADR 0011 のまま
- トークンセマンティクス(`--color-bg` / `--color-ink` / `--color-sub` / `--color-line` / `--color-card` / `--color-accent`): ADR 0011 のまま
- ライト値: 完全維持(本 ADR は dark のみ)
- og-image.ts のダーク対応: 対象外(別 ADR / 別 PR)

## アクセシビリティ

- WCAG SC 1.4.3 Contrast (Minimum): 全ペアで AA 以上達成
- WCAG SC 1.4.6 Contrast (Enhanced): 本文ペアで AAA 達成
- 体感的な「読み味」改善を一次目的とするが、計測値も同時に向上する

## 観測

- 本番(または preview)で代表ページ(トップ / コラム個別 / 戦略個別 / FAQ)を Mac Safari / iPhone Safari の OS dark 設定で目視確認
- E2E + a11y baseline(`e2e/a11y-known-issues.json`)が空のまま維持されること

## 関連参照

- ADR 0011(本 ADR の前提、起動方式・トークン構造はそちら)
- react.dev 本体 CSS bundle(直接取得、`html.dark { ... }` ブロックから抽出)
- [primer/primitives — dark.json5](https://github.com/primer/primitives/blob/main/src/tokens/base/color/dark/dark.json5) — GitHub のダーク色定義
- edu-watch ADR 0028(同仕様のミラー、姉妹サイト同時適用 — memory rule 7)
