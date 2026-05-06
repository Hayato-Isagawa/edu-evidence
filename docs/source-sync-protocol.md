# Source Sync Protocol

`src/content/strategies/*.md` の出典(EEF Toolkit / Hattie Visible Learning / 日本研究)を継続的に追従するための運用手順。

## §0 目的と適用範囲

### なぜ必要か

戦略の `monthsGained` / `evidenceStrength` は一次研究の更新に追従する必要がある。具体的には:

- **EEF Teaching and Learning Toolkit** は年に 1〜2 回 Phase 単位で改訂される(直近: 2026-01-13 Phonics)
- **Hattie Visible Learning** は 2023 年「The Sequel」で大規模改訂、`visiblelearningmetax.com` で継続更新中
- **日本研究**(国立教育政策研究所 / 文科省 / 各研究者)は不定期に新しい RCT・メタ分析が出る

「思い出した時にやる」運用にすると、古い数値が残ったまま気付かないリスクがある。本 protocol は **対象列挙の自動化**(`scripts/check-source-sync.ts`)+ **判定手順の文書化**(本ファイル)で、抜けを防ぐ。

### 対象

`src/content/strategies/*.md` の以下フィールド:

- `monthsGained`(整数、月換算)
- `evidenceStrength`
- `sourceUrl` / `sourceTitle`
- `evidence.{eef,japan,hattie}.{monthsGained,evidenceStrength,summary,citation,sourceUrl}` 併記

### 非対象

- 戦略本文の手動執筆部分(これは PR ごとに `edu-pre-write-verifier` / `edu-content-reviewer` agent で個別検証)
- コラム(`src/content/columns/*.md`)
- `digests` / `pages`(本 protocol の管轄外)

### 出典別チェック頻度

| セクション | 対象判定 | しきい値 | 頻度 |
|---|---|---|---|
| §1 EEF | `source === 'eef'` または `evidence.eef` 併記 | 30 日 | 月次 |
| §2 Hattie | `source === 'hattie'` または `evidence.hattie` 併記 | 365 日 | 年次(1 月) |
| §3 Japan | `source === 'japan'` または `evidence.japan` 併記 | 365 日 | 年次(4 月) |

1 戦略が複数 § の対象になりうる(例: `source: mixed` で `evidence.eef` と `evidence.japan` 併記の戦略は §1 と §3 の両方に出る)。

### 自動化の境界

- **自動**: 対象戦略の列挙(`scripts/check-source-sync.ts`、しきい値超過分を出典別に出力)
- **対話**: WebSearch / WebFetch / 値判定は Claude Code セッションで人間が判断する(機械的には決定できないため)

## §1 EEF Toolkit 整合性チェック(月次運用)

### 対象数

- `source: eef` 28 件
- `evidence.eef` 併記分(`source: mixed` 等から 22 件)
- 合計: 約 50 件

### 主情報源の優先順位

| 優先度 | 経路 | 用途 |
|---|---|---|
| 1 | **WebSearch** で `EEF Toolkit <strand 名> months progress` 等のクエリを **3 種類の角度** で実行 | 実質的に EEF 公式本文の数値を取得可能 |
| 2 | **二次情報源 WebFetch**: Headteacher Update / InnerDrive / Bromley / R.I.S.E. 等の英国系教育レビューサイト | 1 の裏付け |
| 3 | **CDN 直 WebFetch**: `d10a08pz293654.cloudfront.net` / `d2tic4wvo1iusb.cloudfront.net` | explainer / Toolkit guide PDF を取得(Technical Appendix の各 strand ファイル名は不明、上位ガイドのみ) |

### 機械的に取れない経路(避ける)

- `curl` / `WebFetch` 直で `educationendowmentfoundation.org.uk/education-evidence/...` → 403 全滅(UA 偽装 / apiv3 / api / Googlebot / レガシーパスすべて不可)
- `archive.ph` / Bing cache / Wayback Machine → 取得不可

### 判定ロジック

| 条件 | 取り扱い |
|---|---|
| WebSearch 3/3 が同じ数値で一致 | 値更新可、`evidence.eef` 全フィールド追随 |
| 2/3 一致 + 二次情報源 1 件以上で同値裏付け | 値更新可 |
| それ未満 | **据え置き**、`lastVerified` のみ rolling(memory rule 2 厳格適用) |

### 出力

- 値更新がある場合: PR ドラフト(コミット粒度: 1 戦略 1 PR、または同 strand 複数戦略を 1 PR にまとめる)
- 値更新が無い場合: `lastVerified` 単独 rolling PR(前例: PR #166 reading-comprehension)

### ローテーション

50 件を月 2-3 件で 1 年 1 周。`scripts/check-source-sync.ts --section eef` がしきい値超過(30 日)を提示し、その中から優先度の高い strand(EEF が新フェーズ公開した順)を選ぶ。

## §2 Hattie Visible Learning 整合性チェック(年次運用)

### 対象数

- `source: hattie` 1 件(teacher-credibility)
- `evidence.hattie` 併記分: 約 39 件
- 合計: 約 39 件

### 主情報源の優先順位

| 優先度 | 経路 | 用途 |
|---|---|---|
| 1 | **`visiblelearningmetax.com`**(WebFetch 可能、継続更新メタ分析データベース) | 最新 effect size の取得 |
| 2 | **Hattie 自著最新改訂版**(2023 「Visible Learning: The Sequel」、以後改訂時) | 公式記述の確認 |
| 3 | **二次情報源**(Corwin / Routledge レビュー、研究者ブログ) | 1-2 の裏付け |

### 判定ロジック

§1 と同じ:

- 1+2 で同値裏付け → 値更新可
- 1 のみ + 二次源 1 件以上 → 値更新可
- それ未満 → 据え置き

### タイミング

毎年 1 月に全 39 件レビュー。Hattie の改訂が公表された場合は中間で実施。

### Hattie 値の運用上の注意

CLAUDE.md コンテンツ編集の鉄則に従い、Hattie は出典優先度 3(EEF・日本研究より下)で参考値扱い。`source: hattie` を新規付与せず、`evidence.hattie` 併記のみ拡張する。既存 `source: hattie`(teacher-credibility)は維持。

## §3 日本研究(source: japan)整合性チェック(年次運用)

### 対象数

- `source: japan` 13 件
- `evidence.japan` 併記分: 約 22 件
- 合計: 約 22 件

### 主情報源の優先順位

| 優先度 | 経路 | 用途 |
|---|---|---|
| 1 | **国立教育政策研究所**(`nier.go.jp`、WebFetch 可能) | 公式発表・調査結果 |
| 2 | **文部科学省**(`mext.go.jp`、WebFetch 可能) | 学習指導要領・全国学テ等 |
| 3 | **該当研究者の最新発信**(researchmap, 大学公式ページ, J-STAGE) | 改訂・追試の有無 |
| 4 | **二次情報源**(教育新聞 / 朝日新聞 EduA / 学校教育研究所) | 1-3 の裏付け |

### 判定ロジック

§1 と同じ。

### タイミング

毎年 4 月(年度初め)に全 22 件レビュー。学習指導要領改訂や全国学力調査結果の公表があった場合は中間で実施。

### sourceUrl 制約(memory rule 14、CONTENT_GUIDELINES Rule 1.2b)

- 一次研究ドメインのみ: `nier.go.jp` / `mext.go.jp` / `*.ac.jp` / `doi.org` / `j-stage.go.jp`
- NG: 教育新聞・朝日新聞・読売新聞・書籍紹介ページ・SNS

二次情報は本文の `culturalContext` で参考引用するに留め、`sourceUrl` には置かない。

## §4 共通: 値更新時の手続き

### 手順

1. 対象戦略の `lastVerified` を当日日付に更新(`YYYY-MM-DD` 形式)
2. **値が変わった場合**:
   - frontmatter `monthsGained` / `evidenceStrength` / `evidence.<src>.monthsGained` 等を更新
   - 本文中の数値表記も追随(例: 「約 5 ヶ月」「+5 ヶ月」)
   - `culturalContext` に値変更の経緯を 1-2 行追記
3. **値が変わらない場合**:
   - `lastVerified` のみ rolling
4. ローカル検証: `npm run check:all` を通す(`check:text` / `check:consistency` / `check:stale` / `check:links:source` / `astro check`)
5. 別途 `npm run check:source-sync` で次回チェック対象を確認(本 PR の対象から外れているか)
6. PR 作成(タイトル英語、本文日本語、memory rule 18)
7. **マージしない**(memory rule 13、ユーザーレビュー待ち)

### PR 本文に含める要素

- 対象 strand / 対象戦略リスト
- 各戦略の旧値 → 新値(値更新時)
- 検証経路: WebSearch クエリ / 二次情報源 URL / 判定根拠(3/3 or 2/3 + secondary)
- `npm run check:all` の結果(0 errors)

### 据え置きで `lastVerified` 単独 rolling する場合

PR タイトル例(前例 PR #166):
```
chore(strategies): roll lastVerified for <strategy-slug> after EEF Phase X cross-check
```

PR 本文には:

- なぜ据え置きと判断したか(2/3 で +5、1/3 で +6 等の分裂結果)
- 次回再検証の予定時期

を明記する。

## §5 運用記録

### 月次 / 年次の実行記録

各実行は `.claude/state/active.md` の本セッション欄に「Source Sync §1 月次実行: 2026-MM-DD、対象 N 件、PR #X 作成」と 1 行記録する。

### CI 化(将来案)

GitHub Actions schedule で月次に `npm run check:source-sync` を回し、検出があれば issue を立てる仕組みは別 PR で扱う(本 PR の対象外)。

## 関連ドキュメント

- [`CLAUDE.md`](../CLAUDE.md) — コンテンツ編集の鉄則(出典優先度)
- [`docs/CONTENT_GUIDELINES.md`](CONTENT_GUIDELINES.md) — Rule 1.1 / 1.2 / 1.2a / 1.2b(出典・sourceUrl 制約)
- [`docs/context-management.md`](context-management.md) — `.claude/state/active.md` 運用
- [`scripts/check-source-sync.ts`](../scripts/check-source-sync.ts) — 対象列挙ツール
- [`scripts/check-stale.ts`](../scripts/check-stale.ts) — 出典問わず 365 日経過の汎用チェック
