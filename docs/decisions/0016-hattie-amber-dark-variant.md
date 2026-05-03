# 0016. Hattie バッジと amber 系ボックスにダーク variant を追加する

- 状態: 採用
- 日付: 2026-05-04
- 関連 PR: 本 ADR と同一 PR で確定(ADR 0013 / 0014 / 0015 と同 PR にバンドル)
- 関連 ADR: 0011(dark mode data-theme with system default)/ 0013(dark mode greyscale tuning)
- 姉妹サイト: edu-watch には Hattie / amber 系の表示が無いため、本 ADR は edu-evidence のみ

## 背景

ADR 0013-0015 でダーク本文の読み味は完成したが、本番運用で「Hattie の部分がとても見えにくい」というフィードバック。

調査したところ、Hattie 関連と一部の解説ボックスで amber 色が **hard-coded で light テーマ専用** に設定されており、`[data-theme="dark"]` でも色が切り替わらないままダーク背景上に重なっていた:

| 箇所 | hard-coded class | dark 背景上の問題 |
|---|---|---|
| Hattie バッジ(6 箇所共通) | `text-amber-800 border-amber-800/40 bg-amber-50` | bg `#fffbeb`(極薄黄、明度 ~99%)が dark `#16181d` 上で「光る」、文字 `#92400e`(暗茶、明度 ~25%)が薄黄バッジ内で読めるが浮く |
| 戦略個別 Hattie 詳細ボックス | `text-amber-700`(label / 値)+ `bg-amber-50/30` | **`text-amber-700` `#b45309` × dark bg `#16181d` のコントラスト ~3.5:1 で AA 未達、文字が読めない** |
| `/guide/evidence` の解説ボックス | `bg-amber-50/30 border-amber-600/30` | dark 上で薄黄背景が浮く、本文 `--color-ink` で書かれているテキストは読めるが境界が違和感 |

特に戦略個別ページの **Hattie 詳細ボックスの `text-amber-700` × dark bg** はコントラスト 3.5:1 で WCAG AA(4.5:1)未達。これがユーザーが「とても見えにくい」と感じた直接原因。

amber 系の hard-coded は ADR 0011 のダークモード採択前から存在しており、「light テーマ専用」のままダークモードを後付けしたため、各箇所の `dark:` variant が漏れていた。

## 検討した選択肢

### A) すべての hard-coded amber を CSS トークン化(`--color-source-hattie` 等を新設)

- 利点: 構造的に正しい、ADR 0007 のセマンティック属性方針と整合
- 欠点: トークン設計に踏み込む変更で範囲が広い、本セッションのスコープを超える

### B) 各箇所に Tailwind の `dark:` variant を追加(採用)

- 利点:
  - 最小コストで AA / AAA 達成
  - Tailwind の `@variant dark` バインド(ADR 0011)が既に効いているので、`dark:text-amber-300` 等の utility がそのまま機能する
  - 将来的に A 案でトークン化する余地は残す
- 欠点: hard-coded の点が増える(ただし既存の hard-coded 構造は維持)

### C) Hattie バッジを灰色系に変える

- 利点: 色管理がシンプル
- 欠点: Hattie バッジの amber 色は `evidence.eef`(青)/ `evidence.japan`(緑)と並列で出典別に色分けする UI 設計の一部。色を捨てると意味機能が失われる

## 決定

**選択肢 B** を採用。Hattie 関連の amber 色 hard-coded 箇所すべてに `dark:` variant を追加し、`/guide/evidence` の amber 解説ボックスにも同様の dark variant を追加する。

### 修正パターン

#### Hattie バッジ(6 箇所共通)

```diff
- text-amber-800 border-amber-800/40 bg-amber-50
+ text-amber-800 border-amber-800/40 bg-amber-50 dark:text-amber-200 dark:border-amber-200/40 dark:bg-amber-200/10
```

ダーク変換:
- `text-amber-200` = `#fde68a`(明るい黄、明度 ~85%)
- `border-amber-200/40` = 同色 40% 透過
- `bg-amber-200/10` = 同色 10% 透過(ダーク背景にうっすら黄味)

コントラスト確認:
- `#fde68a` × `#16181d` ≈ 13:1(AAA)
- `bg-amber-200/10` の実効背景は dark bg にほぼ等しい

#### 戦略個別 Hattie 詳細ボックス

```diff
- <div class="border border-[var(--color-line)] rounded-xl p-5 space-y-2 bg-amber-50/30">
+ <div class="border border-[var(--color-line)] rounded-xl p-5 space-y-2 bg-amber-50/30 dark:bg-amber-300/5">
- <span class="... text-amber-700">Hattie (Visible Learning)</span>
+ <span class="... text-amber-700 dark:text-amber-300">Hattie (Visible Learning)</span>
- <span class="font-black text-xl text-amber-700 tabular-nums">d = ...</span>
+ <span class="font-black text-xl text-amber-700 dark:text-amber-300 tabular-nums">d = ...</span>
```

ダーク変換:
- `text-amber-300` = `#fcd34d`(中明度黄、明度 ~75%)
- `bg-amber-300/5` = 同色 5% 透過(ダーク背景にうっすら黄味)

コントラスト確認:
- `#fcd34d` × `#16181d` ≈ 11:1(AAA、改善前 ~3.5:1 から大幅改善)

#### `/guide/evidence` の解説ボックス

```diff
- <div class="border border-amber-600/30 rounded-xl p-5 bg-amber-50/30 space-y-3">
+ <div class="border border-amber-600/30 rounded-xl p-5 bg-amber-50/30 space-y-3 dark:border-amber-400/30 dark:bg-amber-400/5">
```

これは Hattie ではなく「日本の教育現場でよくある例」(校内研究の Level 1 解説)の警告風ボックスだが、同じ amber-50 を使っているため同時に dark variant を追加。

### 修正対象箇所

| ファイル | 行 | 種別 |
|---|---|---|
| `src/components/StrategyRow.astro` | 32 | Hattie バッジ(badgeConfig) |
| `src/components/RelatedStrategyCard.astro` | 34 | 同上 |
| `src/pages/strategies/[...slug].astro` | 59 | 同上 |
| `src/pages/strategies/[...slug].astro` | 248-252 | Hattie 詳細ボックス |
| `src/pages/index.astro` | 222 | Hattie バッジ(直書き) |
| `src/pages/index.astro` | 244 | 同上 |
| `src/pages/guide/indicators.astro` | 247 | 同上 |
| `src/pages/guide/indicators.astro` | 272 | 同上 |
| `src/pages/guide/evidence.astro` | 197 | 解説ボックス(Hattie 以外、同じ amber-50 使用) |

### 維持する設計

- light テーマの amber 色: 完全維持(`text-amber-800 / border-amber-800/40 / bg-amber-50` 等は light で表示されている見え方そのまま)
- バッジの色分け方針: 維持(eef = 青、japan = 緑、hattie = 黄/橙)
- 構造的なトークン化(選択肢 A): 将来課題として残す

## アクセシビリティ

- WCAG SC 1.4.3 Contrast (Minimum):
  - **改善前 戦略個別 `text-amber-700` × dark bg ≈ 3.5:1 で AA 未達** → 改善後 `text-amber-300` × dark bg ≈ 11:1 で AAA
  - バッジ `text-amber-200` × dark bg ≈ 13:1 で AAA
- `/guide/evidence` の解説ボックスは本文 `--color-ink` で書かれているため、本文コントラストは ADR 0015 の `#D0D3DC` × dark bg ≈ 11.6:1 で AAA(変化なし)

## 観測

- preview デプロイで以下を Mac Safari / iPhone Safari の OS dark で目視:
  - 戦略個別ページの「Hattie (Visible Learning)」ボックスのラベル・効果量 d 値が読めること
  - トップページ・コラム個別・指導法一覧で Hattie バッジが「光らず」「読める」こと
  - `/guide/evidence` の amber 解説ボックスがダーク背景に馴染むこと
- 既存 a11y baseline(`e2e/a11y-known-issues.json`)に新規違反が出ないこと

## 関連参照

- ADR 0007(semantic attribute state management、`data-theme` 採用)
- ADR 0011(dark mode 採択、本問題が顕在化した起点)
- ADR 0013-0015(同 PR にバンドルされた dark 関連 ADR)
- 将来課題: `--color-source-hattie` / `--color-source-eef` / `--color-source-japan` のトークン化(別 ADR で検討)
