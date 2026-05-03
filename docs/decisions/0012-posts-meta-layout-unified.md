# 0012. 投稿系ページ(コラム / ダイジェスト)のメタ配置を姉妹サイトで統一する

- 状態: 採用
- 日付: 2026-05-03
- 関連 PR: 本 ADR と同一 PR で確定
- 関連 ADR: 0009(stacked hero with large H1)
- 姉妹サイト ADR: edu-watch ADR 0027(同仕様のミラー)

## 背景

edu-evidence のコラム個別ページと edu-watch のダイジェスト個別ページは、いずれも「読み物」系の投稿ページである。両者は性質が異なる(コラム = ストック型 / ダイジェスト = フロー型)が、ヘッダー周りのメタ情報配置(戻る link / 公開日の位置 / 日付フォーマット / kicker サイズ)はサイト共通の枠組みであり、両サイトで揃っていることが望ましい。

実機で並べると次の差分があった:

| 要素 | edu-evidence(コラム個別) | edu-watch(ダイジェスト個別) |
|---|---|---|
| 戻る link 位置 | header の **上**(独立ブロック、`pt-10 pb-6`) | header の **下**(メタ情報の後) |
| 公開日の位置 | kicker 行に統合(`Column — 2026-05-03 / 最終更新 ...`) | H1 直下の専用メタ行(`期間 / 公開:`) |
| 日付フォーマット | `2026-05-03`(ISO 直書き) | `2026年5月3日`(Intl 整形) |
| kicker font-size | `text-xs` | `text-[10px]` |
| sub-kicker(`コラム` 等の日本語ラベル) | あり | なし |

一覧ページも同様に日付フォーマットが分かれており(edu-evidence: ISO / edu-watch: Intl + 曜日付き)、姉妹サイト間で「投稿系の見え方」が分裂していた。

姉妹サイトで投稿系ページの読み味が分裂すると、ユーザーが両サイトを行き来したときにコグニティブコストが発生する。memory rule 7「edu-watch の UI/UX は edu-evidence に揃える」の延長として、本 ADR で投稿系のメタ配置規約を確定する。

## 検討した選択肢

### A) 現状を維持し、両サイトで個別最適を許す

- 利点: 既存実装を変えない
- 欠点: 両サイト間の体験差が残り続ける、新規投稿系ページを追加するたびに同じ判断を再決定することになる

### B) edu-evidence 側に edu-watch を寄せる(コラム流に統一)

- 利点: edu-evidence は本家でページ数も多い
- 欠点:
  - kicker 行に日付を統合する書式は、ダイジェスト固有の「期間 + 公開日」のような複数日付表示と相性が悪い
  - 戻る link が header 上にある古い editorial 様式は現代の Web で減っている
  - ISO 直書き日付は教員読者にとって読みづらい

### C) edu-watch 側に edu-evidence を寄せる(ダイジェスト流に統一、採用)

- 利点:
  - 戻る link が header 末尾にある現代的な配置
  - 日付を H1 直下の専用メタ行に置けば、ダイジェスト固有の「期間 + 公開日」のような複数日付も同じ枠で表現できる
  - Intl 整形(`2026年5月3日`)は教員読者にとって読みやすい
- 欠点:
  - edu-evidence のコラムページを書き換える工数(機械的)
  - sub-kicker(`コラム` 日本語ラベル)を捨てるが、kicker 英語ラベルだけで意味は通る

## 決定

**選択肢 C** を採用。投稿系ページ(コラム / ダイジェスト個別)のメタ配置を次の規約で統一する。

### 個別ページのヘッダー構造

```html
<header class="pt-10 sm:pt-14 md:pt-20 lg:pt-28 pb-12 border-b border-[var(--color-line)]">
  <p class="font-mono text-xs uppercase tracking-widest text-[var(--color-accent)]">
    {Kicker}  <!-- 例: "Column" / "Weekly digest" -->
  </p>
  <h1 class="mt-5 font-black text-3xl sm:text-4xl md:text-5xl lg:text-6xl leading-[1.15] tracking-tight">
    {タイトル}
  </h1>
  <p class="mt-3 text-sm text-[var(--color-sub)] font-mono tracking-wide">
    <time datetime={ISO}>公開: {Intl 整形日付(曜日付き)}</time>
    {更新あり ? <span class="ml-3"><time datetime={ISO}>最終更新: ...</time></span> : null}
    {期間あり ? <span class="ml-3"><time datetime={ISO}>期間: ...</time></span> : null}
  </p>
  <p class="mt-6 text-[var(--color-sub)] text-sm sm:text-base leading-loose max-w-2xl">
    {summary}
  </p>
  {タグ / TopicBadge 等 ? <div class="mt-6 ...">{...}</div> : null}
  <p class="mt-4 text-[var(--color-sub)] text-sm leading-relaxed">
    <a href="{一覧 URL}" class="link-underline">← {コラム / ダイジェスト} 一覧</a>
    <span class="ml-3"><a href="/" class="link-underline">トップ</a></span>
  </p>
</header>
```

### 決定値

| 要素 | 値 |
|---|---|
| Kicker | `font-mono text-xs uppercase tracking-widest text-[var(--color-accent)]` 英語ラベルのみ(日本語 sub-kicker は廃止) |
| H1 | ADR 0009 の個別ページ例外節に従う(`text-3xl sm:text-4xl md:text-5xl lg:text-6xl`) |
| メタ行(日付) | `mt-3 text-sm text-[var(--color-sub)] font-mono tracking-wide`、`<time datetime>` 必須 |
| 日付フォーマット(個別) | `Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo" })` で `2026年5月3日(土)` 形式 |
| 日付フォーマット(一覧) | 上記から `weekday` を外した `2026年5月3日` 形式(行幅を抑える) |
| Summary | `mt-6 text-[var(--color-sub)] text-sm sm:text-base leading-loose max-w-2xl` |
| タグ / TopicBadge 等の補助メタ | `mt-6 flex flex-wrap gap-*`(必要なページのみ) |
| 戻る link | header 末尾、`mt-4`、`link-underline` で「← 一覧」+ 「トップ」(中黒や `|` 区切りではなく `ml-3` の余白で並べる) |

### 廃止する要素

- 個別ページ header **上** の独立した「← 一覧へ戻る」ブロック → header 末尾に統一
- kicker 行への日付埋め込み → H1 直下のメタ行に分離
- 日本語 sub-kicker(`コラム` などの単独ラベル) → kicker 英語ラベルだけで十分
- ISO 直書きの日付 → Intl 整形に統一

### 統一しない(維持する)要素

- コラムの通し番号(`01`, `02`, ...): シリーズ性の表現として有用、ダイジェストには無くてよい
- ダイジェスト固有の「期間表示(`weekStart 〜 weekEnd`)」: コラムには無くてよい、メタ行内で `公開:` の隣に併記
- TopicBadge(ダイジェスト)/ tag chip(コラム)の見た目差異: データ構造が異なるため
- 一覧ページの hover 挙動差(コラム = カード全体 hover、ダイジェスト = link-underline): ストック型は探索的、フロー型は索引的、という性格差を反映

## アクセシビリティ

- 日付は `<time datetime="YYYY-MM-DD">` で機械可読 ISO 値を保持(スクリーンリーダー / SEO 双方に有利)
- 戻る link は header 末尾に置くが、Tab 順序としては summary の後に来るため自然
- WCAG SC 1.3.1 Info and Relationships: kicker `<p>` + H1 `<h1>` + メタ `<p>` の意味構造は維持
- WCAG SC 1.4.3 Contrast: 既存トークン(`--color-sub`, `--color-accent`)のまま AA 達成

## 段階的展開

1. 本 PR: ADR 採択 + edu-evidence のコラム個別ページ + 一覧ページに適用
2. 後続 PR(姉妹側): edu-watch ADR 0027 + ダイジェスト個別/一覧で kicker サイズ + 一覧日付フォーマットを揃える(ダイジェスト個別の構造は既に本 ADR の規約とほぼ同じ)
3. 将来の新規投稿系ページ(ガイド系の長文記事など)も本 ADR に従う

## 関連参照

- ADR 0009 stacked hero(H1 サイズ規約は本 ADR の対象外、そちらに従う)
- memory rule 7「edu-watch の UI/UX は edu-evidence に揃える」(本 ADR は逆方向の整列だが、姉妹サイト間の整合性を優先する点で同じ精神)
- edu-watch ADR 0027(同仕様のミラー)
