# 0019. OG 画像キャッシュ更新ポリシー(姉妹サイト ADR の edu-evidence 適用)

- 状態: 採用
- 日付: 2026-05-05
- 関連 PR: 本 ADR と同一 PR で確定
- 起点 ADR: ISAGAWA HAYATO Portfolio ADR 0003(共通フレーム + SNS runbook の元、PR #44 マージ済)
- 関連 ADR: 0017(動的 OG 画像生成用フォント同梱)/ 0018(静的 default OG 画像)
- 姉妹サイト ADR: edu-watch ADR 0034(同方針のミラー、別 PR で確定予定)

## 背景

姉妹リポジトリ ISAGAWA HAYATO Portfolio で ADR 0003 として OG 画像キャッシュ更新ポリシーを確定した。共通の判断フレーム(更新が必要 / 不要のケース、選択肢 C = URL クエリ + Facebook/LinkedIn Debugger 併用)と SNS 別 runbook(Facebook / LinkedIn / Slack / X)は portfolio ADR 0003 に同梱されている。本 ADR は edu-evidence 固有の OG 構成への適用を扱う。

edu-evidence の OG は 2 系統で構成されている:

- **動的 OG(戦略個別)**: `/og/${slug}.png`(73 枚、`src/pages/og/[...slug].png.ts` が build 時生成、ADR 0017 でフォント同梱)
- **静的 default OG**: `/og-image.png`(ADR 0018 で整備、戦略以外のすべてのページの fallback)

両者で更新トリガーと頻度が異なるため、portfolio とは別レイヤの判断が必要(portfolio は静的 1 枚のみ、ブランド改修時のみの更新)。

## 共通フレームの再掲(portfolio ADR 0003 より)

- **採用方針**: URL クエリ `?v=` で別 URL 化(主軸) + Facebook / LinkedIn の公式 Debugger で念押し(併用)
- **X(旧 Twitter)** には公式リフェッチ手段が 2022 年 8 月以降存在しない → URL クエリ方式が事実上唯一の確実策
- **判断基準**: OG 画像の見た目に差分が出るか。出るなら `?v=` を更新、出ないなら据え置き
- **SNS 別 runbook**(Facebook / LinkedIn / Slack / X の操作手順): portfolio ADR 0003 §runbook を参照(本 ADR では再掲しない)

## 検討した選択肢

### A) 戦略個別 OG と静的 default OG で異なる `?v=` 戦略を取る(採用)

- 戦略個別 OG: frontmatter `lastVerified` を `?v=YYYYMMDD` として流用
- 静的 default OG: ブランド改修時の `?v=YYYYMMDD`(portfolio と同方針)

**利点**:

- 戦略個別 OG は内容変更(タイトル / monthsGained / 出典 / 効果サマリー変更)で `lastVerified` が更新される運用と整合し、`?v=` 更新が **frontmatter 編集だけで自動化** される
- `scripts/check-stale.mjs` による期限切れ検出フローと矛盾しない(検証日更新 → OG キャッシュ更新が連動)
- 静的 default はブランド改修時のみ手動更新、頻度低
- 既存スキーマを再利用、新しい frontmatter フィールド追加が不要

**欠点**:

- `Layout.astro` での URL 構築ロジックが動的 / 静的で分岐する(現状単純な if 三項演算子の延長で対応可能)

### B) 全 OG を `?v=YYYYMMDD` で統一管理(全 OG 共通の単一定数)

- 利点: 単一規則
- 欠点: 73 戦略の内容変更が `?v=` に伝搬されないため、戦略個別 OG の SNS キャッシュ問題が残る(73 戦略の内容更新のたびに共通定数を変える運用は破綻する)

### C) クエリを使わず、画像ファイル名自体を変える

- 利点: HTTP/CDN キャッシュ規則と素直に整合
- 欠点: 戦略個別 OG では非現実的(73 ファイル名を変える運用、過去 URL の死活管理)。静的 default のみ採用してもメリット小

## 決定

**選択肢 A を採用。**

### 1. 戦略個別 OG の `?v=` — frontmatter `lastVerified` 流用

`Layout.astro` の `ogImagePath` 経由で渡される URL に対して、`ogVersion` プロパティで `?v=` を付与する。戦略ページからは `entry.data.lastVerified` の `-` を除いた `YYYYMMDD` を渡す:

```diff
 // src/layouts/Layout.astro(該当部分、本 ADR 採択時点ではまだ実装しない)
 interface Props {
   title?: string;
   description?: string;
   ogImagePath?: string;
+  ogVersion?: string;  // YYYYMMDD 形式、戦略個別ページのみ渡す
   articleJsonLd?: object;
   breadcrumbJsonLd?: object;
   longForm?: boolean;
 }

- const ogImage = ogImagePath ? `${siteUrl}${ogImagePath}` : `${siteUrl}/og-image.png`;
+ const versionQuery = ogVersion ? `?v=${ogVersion}` : "";
+ const ogImage = ogImagePath
+   ? `${siteUrl}${ogImagePath}${versionQuery}`
+   : `${siteUrl}/og-image.png?v=${OG_DEFAULT_VERSION}`;
```

```diff
 // src/pages/strategies/[...slug].astro(該当部分)
   ogImagePath={`/og/${entry.id}.png`}
+  ogVersion={entry.data.lastVerified.replaceAll("-", "")}
```

`lastVerified` は `src/content.config.ts` の zod スキーマで required、`YYYY-MM-DD` 形式で必ず存在する。

### 2. 静的 default OG の `?v=` — ブランド改修時の手動更新

`OG_DEFAULT_VERSION` 定数を導入する。配置先は `src/data/og-version.ts`(新規、`siteConfig` に置いてもよいが OG 専用の値なので独立モジュールとする)。

```typescript
// src/data/og-version.ts
export const OG_DEFAULT_VERSION = "20260504"; // ADR 0018 で /og-image.png を整備した日
```

ブランド改修時(深緑トークン変更 / wordmark 変更 / `scripts/generate-default-og.ts` のレイアウト変更等で `public/og-image.png` の見た目が変わる場合)に、`OG_DEFAULT_VERSION` を生成日に揃えて更新する。

### 3. 本 ADR 採択時点での実装範囲

portfolio ADR 0003 と揃えて、**本 ADR を採択する PR では `Layout.astro` 等のコード変更を行わない**。理由:

- ADR は方針の固定が役割、実装は別 PR で動作確認しながら進める
- 実装は `Layout.astro` + `src/data/og-version.ts`(新規)+ `src/pages/strategies/[...slug].astro` の 3 箇所が連動するため、レビュー粒度を分けたい

実装 PR の構成は次のとおり(別 PR で起こす):

1. `src/data/og-version.ts` を新規作成、`OG_DEFAULT_VERSION = "20260504"` を export
2. `Layout.astro` の `Props` に `ogVersion` を追加、`ogImage` 構築を `?v=` 付き URL に変更
3. `src/pages/strategies/[...slug].astro` で `ogVersion={entry.data.lastVerified.replaceAll("-", "")}` を渡す
4. ビルド後に `dist/index.html` 等を grep して `og:image` の URL に `?v=` が含まれていることを確認

## 判断フレーム — edu-evidence 固有の更新トリガー

### 戦略個別 OG(`/og/<slug>.png`)

| 操作 | OG 更新が必要か | 仕組み |
|---|---|---|
| 戦略のタイトル変更 | 必要 | `lastVerified` を更新する運用ルールに従えば `?v=` が自動更新 |
| `monthsGained` の数値変更 | 必要 | 同上 |
| `evidenceStrength` / `cost` 変更 | 必要 | 同上 |
| `subjects` 配列の変更 | 必要 | 同上 |
| 本文 markdown の編集(OG に出ない範囲) | 不要 | OG 画像の見た目に出ないため `lastVerified` 更新不要(OG 観点では) |
| `scripts/og-image.ts` のレイアウト変更 | **全戦略で必要** | この場合は別 ADR or 全戦略の `lastVerified` 一括更新コミットが要る(後述) |

`og-image.ts` のレイアウト自体を変える場合は、73 戦略の `lastVerified` を全件更新するか、別の `?v=` ハンドリングを検討する必要がある(本 ADR のスコープ外、その時点で別 ADR を起こす)。

### 静的 default OG(`/og-image.png`)

| 操作 | OG 更新が必要か | 仕組み |
|---|---|---|
| ブランド改修(色トークン / wordmark / tagline) | 必要 | `OG_DEFAULT_VERSION` を生成日に手動更新 |
| `scripts/generate-default-og.ts` のレイアウト変更 | 必要 | 同上 |
| ハブページ(トップ / コラム一覧)の本文・カードレイアウト変更 | 不要 | OG 画像自体は変わらない |

## edu-evidence 固有の運用ワークフロー

### 戦略を更新するとき(コンテンツ編集者向け)

1. frontmatter の `lastVerified` を更新コミット日に書き換える(現行運用と同じ)
2. ビルド時に `/og/<slug>.png` が再生成される
3. デプロイ後、必要に応じて Facebook Sharing Debugger / LinkedIn Post Inspector で `https://edu-evidence.org/strategies/<slug>/` を再スクレイプ
4. X 側は `?v=` が変わっているので新規投稿に新 OG が反映、過去シェアは最大 7 日待ち(portfolio ADR 0003 §runbook §2 と同じ)

### ブランド改修するとき(設計者 / 開発者向け)

1. `scripts/generate-default-og.ts` のレイアウトまたはトークンを変更
2. `npm run og:default` で `public/og-image.png` を再生成
3. `src/data/og-version.ts` の `OG_DEFAULT_VERSION` を改修日(YYYYMMDD)に更新
4. 同一コミットで `public/og-image.png` と `og-version.ts` を含める
5. デプロイ後、portfolio ADR 0003 §runbook §2 に従って Facebook/LinkedIn Debugger で念押し

### 動的 OG レイアウト全体改修(設計者 / 開発者向け、まれ)

1. `src/lib/og-image.ts` または `src/pages/og/[...slug].png.ts` のレイアウト変更
2. 73 戦略の `lastVerified` を一括更新するコミット(or 別 ADR で個別ハンドリングを設計)
3. 通常デプロイ

## 影響

- 次回の戦略コンテンツ更新コミットで初めて `?v=` 付きの OG URL が出力される(実装 PR マージ後)
- 過去にシェアされた戦略 URL の OG キャッシュは、各 SNS の自然失効(約 7 日)を待つ + 必要なら Debugger で念押し
- ブランド改修ワークフローに「`OG_DEFAULT_VERSION` を更新する」ステップを追加

## スコープ外

- `og:title` / `og:description` のキャッシュ更新(SNS が `?v=` なしでも検出するケースが多く、本 ADR では画像に絞る)
- `og-image.ts` のレイアウト全体改修時の 73 戦略一括 `lastVerified` 更新 — 必要になった時点で別 ADR
- コラム個別ページ(`/columns/<slug>/`)の動的 OG 化 — 現状静的 default にフォールバック、ADR 0018 のスコープ外決定と整合
- カテゴリ・媒体・月別アーカイブ等の動的 OG 化 — ADR 0018 と同じくスコープ外

## 撤回 / 再検討の条件

- X が公式の Card Validator 相当を再提供した場合、portfolio ADR 0003 とともに選択肢 B(URL クエリなし + Debugger 単独)へ戻すか再検討
- Cloudflare Pages 等で `og:image` にクエリを付けた際の HTTP/CDN キャッシュ挙動に不具合が出た場合、選択肢 C(画像ファイル名自体に日付)へ切り替え
- 戦略個別 OG を `lastVerified` ベースで `?v=` 化したことで、コンテンツ編集者が `lastVerified` の意味を「最終研究検証日」と「OG キャッシュ更新日」の二重で扱うことに混乱が生じた場合、専用の `ogVersion` フィールドを frontmatter に追加して分離する

## 関連参照

- 起点 ADR: ISAGAWA HAYATO Portfolio ADR 0003(共通フレーム + SNS runbook、`docs/decisions/0003-og-cache-refresh-policy.md`)
- ADR 0017(動的 OG 画像生成用フォント同梱)
- ADR 0018(静的 default OG 画像)
- 姉妹サイト ADR: edu-watch ADR 0034(同方針のミラー、別 PR で確定予定)
- [Twitter card validator is gone — X Developers](https://devcommunity.x.com/t/twitter-card-validator-is-gone-and-it-does-not-work/218740)
- [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
- [LinkedIn Post Inspector ヘルプ](https://www.linkedin.com/help/linkedin/answer/a6233775)
