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
- `evidence.eef.{monthsGained,strength,note,kind,archivedAt}` / `evidence.japan.{monthsGained,strength,note,researcher}` / `evidence.hattie.{cohensD,note}` 併記
- 同期で書き換える `methodology.{studies,effectSize}`

### 非対象

- 戦略本文の手動執筆部分(これは PR ごとに `edu-pre-write-verifier` / `edu-content-reviewer` agent で個別検証)
- コラム(`src/content/columns/*.md`)
- `digests` / `pages`(本 protocol の管轄外)

### 出典別チェック頻度

| セクション | 対象判定 | しきい値 | 頻度 |
|---|---|---|---|
| §1 EEF | `source === 'eef'` または `evidence.eef` 併記。ただし `evidence.eef.archivedAt` を持つもの(下記「凍結した出典」)と、`evidence.eef.kind: evidence-review` のもの(下記「判定ロジック」の委託レビューの段落)は除く | 30 日 | 月次 |
| §2 Hattie | `source === 'hattie'` または `evidence.hattie` 併記 | 365 日 | 年次(1 月) |
| §3 Japan | `source === 'japan'` または `evidence.japan` 併記 | 365 日 | 年次(4 月) |

1 戦略が複数 § の対象になりうる(例: `source: mixed` で `evidence.eef` と `evidence.japan` 併記の戦略は §1 と §3 の両方に出る)。

**`lastVerified` は戦略に 1 つで、出典ごとには持たない。** そのため §1 で EEF だけに当たり直しても日付が進み、§2・§3 の 365 日の判定もそこから数え直される。§2・§3 の確認の本体は日付のしきい値ではなく、各 § の「タイミング」に書いた毎年の全件レビューである(`docs/CONTENT_GUIDELINES.md`「lastVerified の運用」の「限界」)。

### 自動化の境界

- **自動**: 対象戦略の列挙(`scripts/check-source-sync.ts`、しきい値超過分を出典別に出力)
- **対話**: curl(Wayback)/ WebSearch / WebFetch / 値判定は Claude Code セッションで人間が判断する(機械的には決定できないため)

## §1 EEF Toolkit 整合性チェック(月次運用)

### 対象数

- `source: eef` 28 件
- `evidence.eef` 併記分(`source: mixed` 等から 23 件)
- 合計: 51 件。うち凍結 1 件(`early-years-intervention`)と委託レビュー 1 件(`digital-technology`)を除いた 49 件が対象(2026-09-27 の `check:source-sync` 実測)

### 凍結した出典(`evidence.eef.archivedAt`)

EEF 側で値が固定され、更新される経路が無い出典(strand が廃止され、`sourceUrl` を Wayback のスナップショットに固定した等)は、`evidence.eef.archivedAt: "YYYY-MM-DD"`(固定したスナップショットの日付)を書く。`check:source-sync` はこれを持つ出典を対象数から外し、レポートの各 § に「凍結(対象外): N 件」として列挙する(外したことを黙って消さない)。`archivedAt` を足す・変える編集は `.claude/hooks/pre-edit-frontmatter-immutable.cjs` の保護キーに入っているので確認が出る(#621)。凍結した出典には優先度 0 の CDX を掛けない(`sourceUrl` が既に Wayback の URL)。**`check:stale` の 365 日は対象のまま** — スナップショットが生きていることの確認は年 1 回残す。現時点の該当は `early-years-intervention`(2020-10-30、#617 / #618)。

### 主情報源の優先順位

| 優先度 | 経路 | 用途 |
|---|---|---|
| 0 | **Wayback Machine の生バイト**: CDX(`https://web.archive.org/cdx/search/cdx?url=<sourceUrl>&output=json&filter=statuscode:200&from=<年>`)で timestamp を取り、`curl -sL --compressed "https://web.archive.org/web/<TS>id_/<sourceUrl>"` で生 HTML を得る | 一次資料そのもの。月数は `Impact (months)` 直後の `+N`、確実性は `Evidence strength` 直後に並ぶ `inline-flex` 5 個のうち `opacity-20` を持たないものの数(散文 `based on <level> evidence` と突き合わせる)、研究数は `Number of studies`、レビュー月は `Review last updated`。Internet Archive は断続的に 503 / 429 / "Temporarily Offline" を返すのでリトライする。200 の記録が無ければ `filter` を外して 301 を確かめ、sourceUrl が 301 なら転送先で引き直して `sourceUrl` も付け替える |
| 1 | **WebSearch** で `EEF Toolkit <strand 名> months progress` 等のクエリを **3 種類の角度** で実行 | 実質的に EEF 公式本文の数値を取得可能 |
| 2 | **二次情報源 WebFetch**: Headteacher Update / InnerDrive / Bromley / R.I.S.E. 等の英国系教育レビューサイト | 1 の裏付け |
| 3 | **CDN 直 WebFetch**: `d10a08pz293654.cloudfront.net` / `d2tic4wvo1iusb.cloudfront.net` | explainer / Toolkit guide PDF を取得(Technical Appendix の各 strand ファイル名は不明、上位ガイドのみ) |

### 機械的に取れない経路(避ける)

- `curl` / `WebFetch` 直で `educationendowmentfoundation.org.uk/education-evidence/...` → 403 全滅(UA 偽装 / apiv3 / api / Googlebot / レガシーパスすべて不可)
- `archive.ph` / Bing cache → 取得不可。Wayback Machine は `id_` の生バイト取得なら通る(上表の優先度 0。#612 / #613 の照合で実測)

### 判定ロジック

| 条件 | 取り扱い |
|---|---|
| Wayback 生 HTML(優先度 0)で月数・南京錠・散文が読め、南京錠の計数と散文が一致 | 値更新可、`evidence.eef` 全フィールド追随。WebSearch の裏付けは不要 |
| WebSearch 3/3 が同じ数値で一致 | 値更新可、`evidence.eef` 全フィールド追随 |
| 2/3 一致 + 二次情報源 1 件以上で同値裏付け | 値更新可 |
| それ未満 | **据え置き**(`docs/CONTENT_GUIDELINES.md` Rule 1.1 を厳格適用 — 根拠の無い数値を書かない)。取れた結果が**すべて**現在の値と一致するなら `lastVerified` のみ rolling。1 件でも現在と違う値を示す結果が出た、または何も取れなかったときは `lastVerified` も更新せず、次回の照合に回す |

「値更新可」に当たり、現在と違う値が確定したら「食い違いが見つかった」に当たる。値をその PR で直すなら `lastVerified` も更新する。直さないなら更新せず、issue に回す(`CONTENT_GUIDELINES.md`「lastVerified の運用」)。§2・§3 も同じ扱い。ここでいう「更新しない」は、この節の照合だけで `lastVerified` を進めないという意味で、同じ PR で他のページの出典に当たり直して一致した場合の更新までは打ち消さない(打ち消すのは、確定した食い違いを直さない場合だけ)。

**「照合結果が現在の値と一致した」とは**、表の 1〜3 行目で確定した値が現在の値と一致したこと、または表の最下行で、取れた結果がすべて現在の値と一致したことをいう。結果が割れて値が確定しなかった場合は当たらない(#166 の Phonics は 2/3 が +5・1/3 が +6 と割れ、PR 本文は二次情報源の裏付けを挙げていない)。本書の以下の「一致」は、下の委託レビューと試験報告(`kind: trial`)の段落を除き、この意味で使う。§2・§3 も同じ。

**`evidence.eef.kind: evidence-review` の戦略(Toolkit の strand ではなく EEF の委託レビューを出典にしたもの)は、この判定ロジックと §1 の月次の対象外。** 上の表は Toolkit の strand のページの値を前提にしているので、委託レビューには当てはまらない(`digital-technology` では、WebSearch が撤去済みの Toolkit の値を引用したままの二次サイトを拾うので、3/3 一致が成立して消えた値が戻りうる。#561)。照合は、`sourceUrl` のページからリンクされている PDF(`d2tic4wvo1iusb.cloudfront.net`)を `curl` で取り、`pdftotext -layout` で読んで行う。CDN から取れなければ、PDF の URL を Wayback の `id_` で引く。PDF の記述がページの値と一致したら `lastVerified` を進める。取れなかったら進めない。食い違いが見つかったら、その PR で直す場合を除いて進めず、issue に回す。`check:source-sync` は §1 の対象数から外して「委託レビュー(対象外)」に列挙する。`check:stale` の 365 日は対象のまま。該当は次の 1 件(2026-09-27 時点):

| 戦略 | 照合先 |
|---|---|
| `digital-technology` | `education-evidence/evidence-reviews/digital-technology-2019`(EEF 委託レビュー)。Toolkit strand は 2026-09-08 時点の一覧に無い |

**`evidence.eef.kind: trial` の戦略(EEF の試験報告を出典にしたもの)は §1 の月次の対象で、判定表の代わりに次の手順で照合する。WebSearch の 3/3 の判定は、どの手順でも使わない**(最初の試験の値を引用したままの二次サイトが 3/3 を作りうる。委託レビューと同じ理由)。EEF は同じ取り組みの追試を公表することがある(`reciprocal-teaching` は 2 本、`philosophy-for-children` は 2021 年に再試験)ので、月次の対象に残す。

1. 下の表の試験ページを、優先度 0 と同じく Wayback の CDX でスナップショットを探し、`id_` の生 HTML で読む。月数は、タグを外したテキストで `Impact (months)` の説明文の直後に出る値(例: `0 months`。生 HTML では数値と `months` が別の要素に分かれるので、生のまま grep しても当たらない)で、`evidence.eef.monthsGained`(無ければ `evidence.eef.note` に書いた値)と照合する。確実性は、優先度 0 と同じく南京錠の数を読み、`note` に書いた値と照合する
2. 同じ取り組みの新しい試験のページが無いかを、CDX の前方一致(`url=educationendowmentfoundation.org.uk/projects-and-evaluation/projects/&matchType=prefix`)を取り組みの名前で絞って確かめる
3. 最新のスナップショットが試験の公表より前で値が無いとき、または Wayback が答えないときは、ブラウザで実見する(`CONTENT_GUIDELINES.md` §7 と同じ扱い)

月数と確実性が一致したら `lastVerified` を進める。取れなかったら進めない。食い違いが見つかったら、その PR で直す場合を除いて進めず、issue に回す。該当は次の 4 件(スナップショットの値は 2026-09-28 に確認)。いずれも `projects-and-evaluation/projects/` の下のページ:

| 戦略 | 照合先 | 最新のスナップショットの値 |
|---|---|---|
| `lesson-study` | `lesson-study` | 0 months(2026-09-07) |
| `philosophy-for-children` | `philosophy-for-children-effectiveness-trial`(再試験。本サイトの値)。最初の試験は `philosophy-for-children`(+2 months) | 0 months(2026-08-11) |
| `inquiry-based-learning` | `project-based-learning` | -2 months(2026-08-02) |
| `reciprocal-teaching` | `fft-reciprocal-reading-2023-24-trial`(2 本目。本サイトの値)。1 本目は `reciprocal-reading`(+2 months) | 値なし。最新は公表前の 2025-10-09 なので、手順 3 で照合する |

### 出力

- 値更新がある場合: PR ドラフト(コミット粒度: 1 戦略 1 PR、または同 strand 複数戦略を 1 PR にまとめる)
- 値更新が無い場合: 照合結果が現在の値と一致した戦略だけを `lastVerified` 単独の rolling PR にする(前例: PR #166 の reading-comprehension)。値が確定せず現在と違う値を示す結果が出た(#166 の Phonics のように割れた場合を含む)、または取れなかった戦略は PR に含めない

### ローテーション

49 件を月 4〜5 件で 1 年 1 周。`scripts/check-source-sync.ts --section eef` がしきい値超過(30 日)を提示し、その中から優先度の高い strand(EEF が新フェーズ公開した順)を選ぶ。30 日は候補を出すためのしきい値で、1 年で 1 周する運用では超過が常に残る。超過があること自体は異常ではない。

## §2 Hattie Visible Learning 整合性チェック(年次運用)

### 対象数

- `source: hattie` 1 件(teacher-credibility)
- `evidence.hattie` 併記分(`source: hattie` 以外から 35 件)
- 合計: 36 件(2026-09-27 の `check:source-sync` 実測)

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
- それ未満 → 据え置き(`lastVerified` の扱いも §1 の表の最下行と同じ)

### タイミング

毎年 1 月に対象の全件をレビュー。Hattie の改訂が公表された場合は中間で実施。

### Hattie 値の運用上の注意

CLAUDE.md コンテンツ編集の鉄則に従い、Hattie は出典優先度 3(EEF・日本研究より下)で参考値扱い。`source: hattie` を新規付与せず、`evidence.hattie` 併記のみ拡張する。既存 `source: hattie`(teacher-credibility)は維持。

## §3 日本研究(source: japan)整合性チェック(年次運用)

### 対象数

- `source: japan` 13 件
- `evidence.japan` 併記分(`source: japan` 以外から 10 件)
- 合計: 23 件(2026-09-27 の `check:source-sync` 実測)

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

毎年 4 月(年度初め)に対象の全件をレビュー。学習指導要領改訂や全国学力調査結果の公表があった場合は中間で実施。

### sourceUrl 制約(CONTENT_GUIDELINES Rule 1.2b)

- 一次研究ドメインのみ: `nier.go.jp` / `mext.go.jp` / `*.ac.jp` / `doi.org` / `j-stage.go.jp`
- NG: 教育新聞・朝日新聞・読売新聞・書籍紹介ページ・SNS

二次情報は本文の `culturalContext` で参考引用するに留め、`sourceUrl` には置かない。

## §4 共通: 値更新時の手続き

### 手順

1. 照合結果が現在の値と一致したか(§1「判定ロジック」の定義)、食い違いをこの PR で直す場合に、対象戦略の `lastVerified` を当日日付に更新する(`YYYY-MM-DD` 形式)。それ以外は更新しない
2. **値が変わった場合**:
   - frontmatter `monthsGained` / `evidenceStrength` / `evidence.<src>.monthsGained` 等を更新
   - 本文中の数値表記も追随(例: 「約 5 ヶ月」「+5 ヶ月」)
   - `culturalContext` に値変更の経緯を 1-2 行追記
3. **値が変わらない場合**:
   - 照合結果が現在の値と一致したときだけ、`lastVerified` のみ rolling
4. ローカル検証: `npm run check:all` を通す(`astro check` / `check:text` / `check:consistency` / `check:links:source` / `check:links:internal` ほか。**`check:stale` は `check:all` に入っていない**ので、要るときは単体で走らせる)
5. 別途 `npm run check:source-sync` で次回チェック対象を確認(本 PR の対象から外れているか)
6. PR 作成(タイトル英語、本文日本語 — `CONTRIBUTING.md`「コミットメッセージ / PR タイトル規約」)
7. **マージしない** — 編集者(ユーザー)のレビューを待つ

### PR 本文に含める要素

- 対象 strand / 対象戦略リスト
- 各戦略の旧値 → 新値(値更新時)
- 検証経路: Wayback の timestamp(優先度 0)/ WebSearch クエリ / 二次情報源 URL / 判定根拠(優先度 0 の一致 or 3/3 or 2/3 + secondary)
- `npm run check:all` の結果(0 errors)

### 据え置きで `lastVerified` 単独 rolling する場合

PR タイトル例(前例 PR #166):
```
chore(strategies): roll lastVerified for <strategy-slug> after EEF Phase X cross-check
```

PR 本文には:

- 照合結果が現在の値と一致した根拠
- 「スコープに含めなかったもの」: 値が確定せず現在と違う値を示す結果が出た、または取れなかった戦略とその結果(#166 では、2/3 が +5・1/3 が +6 と割れた Phonics を含めず、`lastVerified` も動かしていない)
- 次回再検証の予定時期

を明記する。

## §5 運用記録

### 月次 / 年次の実行記録

各実行は `.claude/state/active.md` の本セッション欄に「Source Sync §1 月次実行: 2026-MM-DD、対象 N 件、PR #X 作成」と 1 行記録する。

### CI 化(将来案)

GitHub Actions schedule で月次に `npm run check:source-sync` を回す仕組みはまだ無い。§1 は 30 日を超えた戦略が常に残る運用なので(§1「ローテーション」)、「検出があれば issue を立てる」形にすると毎月 issue が立つ。立てるなら、その月に照合する候補の一覧として立てる。

## 関連ドキュメント

- [`CLAUDE.md`](../CLAUDE.md) — コンテンツ編集の鉄則(出典優先度)
- [`docs/CONTENT_GUIDELINES.md`](CONTENT_GUIDELINES.md) — Rule 1.1 / 1.2 / 1.2a / 1.2b(出典・sourceUrl 制約)
- [`docs/context-management.md`](context-management.md) — `.claude/state/active.md` 運用
- [`scripts/check-source-sync.ts`](../scripts/check-source-sync.ts) — 対象列挙ツール
- [`scripts/check-stale.ts`](../scripts/check-stale.ts) — 出典問わず 365 日経過の汎用チェック
