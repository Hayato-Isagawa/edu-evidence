# 0018. 静的 default OG 画像を整備し、個別 OG を持たないページのフォールバックとする

- 状態: 採用
- 日付: 2026-05-04
- 関連 PR: 本 ADR と同一 PR で確定
- 関連 ADR: 0017(OG 画像生成用フォントをリポジトリに同梱する)
- 姉妹サイト ADR: edu-watch ADR 0032(同方針のミラー、PR #89 マージ済)

## 背景

ADR 0017 で動的 OG 画像生成を整理したが、対象は **戦略個別ページ(`/strategies/[...slug]`)に限定** している。トップ・コラム一覧・カテゴリページ・ハブ系ページなど、固有の動的データを持たない URL は `src/layouts/Layout.astro` の以下のフォールバックに依存する。

```ts
const ogImage = ogImagePath ? `${siteUrl}${ogImagePath}` : `${siteUrl}/og-image.png`;
```

実態は次のとおり。

- `public/og-image.png` は本サイトの初期段階で配置された旧画像で、現行のブランド体系(深緑 `#2b5d3a` のアクセント、wordmark `EduEvidence JP`、トップ H1「エビデンスを、現場の指導へ。」)を反映していない
- 姉妹サイト edu-watch には `public/og-image.png` がそもそも存在せず、SNS シェア時に画像が表示されない状態だった
- どちらも build を 1 回流せば改善できるが、再生成スクリプトが整備されていないため運用上の継続性がない

## 検討した選択肢

### A) 静的 default PNG を 1 枚整備し、個別 OG を持たないページの共通フォールバックとする(採用)

- 利点:
  - 動的生成と違い build-time コストゼロ。Cloudflare Pages の build 時間を増やさない
  - SNS 露出の少ない URL(カテゴリ・媒体ページ等)に過剰投資しない
  - 1 枚の PNG をブランド改修の節目で再生成すれば良く、運用が単純
  - 姉妹サイト edu-watch でも同じスクリプト構成を持てて整合する
- 欠点:
  - カテゴリ別 / 媒体別の見分けがシェア時にはつかない(URL とタイトルで識別する)

### B) 動的 OG をトップ・カテゴリ等にも拡張する

- 利点: ページごとの絵がリッチになる
- 欠点: トップ・カテゴリの内容は固定であり、動的化の利点が薄い。build-time の生成枚数が増えてビルド遅延のリスクが上がる

### C) 主要ハブだけ個別の静的 PNG を持つ(トップ・`/columns` など 2〜3 枚)

- 利点: 主要ハブのシェア時の見栄えだけは強くできる
- 欠点: 静的 PNG が複数になり管理が増える割に、案 A との差分が小さい

## 決定

**選択肢 A** を採用。`scripts/generate-default-og.ts` を新規作成し、`npm run og:default` で `public/og-image.png` を再生成できるようにする。Layout のフォールバック実装は既に `/og-image.png` を指しているため変更不要。

### 変更内容

- `scripts/generate-default-og.ts` 新規。ADR 0017 と同じ Satori + Sharp + 同梱フォント(`scripts/fonts/noto-sans-jp-bold.bin`)で 1200×630 の PNG を生成
- `package.json` に `"og:default": "tsx scripts/generate-default-og.ts"` を追加
- `public/og-image.png` を新レイアウトで上書き

### レイアウト構成(本 ADR で確定)

| 要素 | 内容 |
|---|---|
| 背景 | `#faf9f5`(本サイトの surface トークン) |
| 左端アクセントバー | 8px、`#2b5d3a`(`--color-accent` 相当) |
| kicker | `EduEvidence JP`、深緑、letter-spacing `0.18em`、UPPERCASE |
| ヘッドライン | 「エビデンスを、」「現場の指導へ。」(2 行)、84px、Black |
| サブ | 「経験と勘に、もうひとつの視点を。」、26px、Bold、`#3a3a36` |
| ドメイン | `edu-evidence.org`、18px、`#6b6b66`、右下 |

トップ H1 の言い回しと完全一致させる方針で、ブランドの「エビデンスを、現場の指導へ。」を SNS シェアでも読み手に最初に届ける。

## 帰結

- `og:image` メタタグの実体が現行ブランドに揃う
- `npm run og:default` 1 コマンドでブランド改修時に再生成できる
- 動的 OG(ADR 0017、戦略個別)+ 静的 default OG(本 ADR、それ以外)で OG 全体の責任分界が明確になる

## スコープ外

- カテゴリ別 / 媒体別 / 月別アーカイブ等の動的 OG 化は本 ADR の範囲外。SNS シェア計測で必要と判明した時点で別 ADR で検討
- コラム個別ページの動的 OG 化も本 ADR の範囲外(現状は default PNG にフォールバック)

## 撤回 / 再検討の条件

- SNS シェア計測でカテゴリ別 OG の有意な効果が観測されたら、案 C(主要ハブのみ静的個別)へ拡張
- 戦略以外の個別ページにも動的 OG を入れる判断が出たら、ADR 0017 のスコープを拡大する形で別 ADR を起こす

## 関連参照

- ADR 0017(OG 画像生成用フォントをリポジトリに同梱する)
- edu-watch ADR 0032(同方針のミラー、edu-watch の `public/og-image.png` 新規整備を含む)
