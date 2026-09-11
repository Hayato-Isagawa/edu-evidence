# 0034. VRT のベースラインを「main のコード × PR のコンテンツ」で撮る

- 状態: 採用
- 日付: 2026-09-10
- 関連 PR: #(本 ADR と同一 PR で確定)

## 背景

ADR 0024 は VRT を導入するとき、コンテンツ編集で差分が埋もれることを避ける設計をとった
（引用は同 ADR の `## Context`）。

> 一方でコンテンツ(`src/content/**` の markdown)編集は毎回テキスト差分を生むため、全 PR に
> VRT をかけると差分がノイズだらけになる（ADR 0024 `## Context`）

その回避策が `paths` フィルタだった。ところが #432（`src/pages` だけの `h2` サイズ変更）が VRT を素通りしたのを受け、
**#433** が `src/pages/**`・`src/data/**`・`src/lib/**`・`src/plugins/**` を足した。このとき、
**「コンテンツ編集では起動しない」という前提が崩れた**。効果量の訂正は `src/content` と同じ PR で
`faq.astro` / `policy-evidence.astro` / `guide/indicators.astro` も触るので、実際には起動する。

実測（2026-09-10、直近 20 実行）:

- **15 実行が失敗し、その全部が `Compare PR against baseline` ステップ**
- 失敗テストは 62 件。ページ別に home 16 / faq 14 / columns-index 14 / strategy-detail 6 /
  concerns-index 6 / policy-evidence 3 / glossary 2 / about 1

赤には性質の違う 2 種類が混ざっている。

| 型 | 出どころ | 例 | 扱い |
|---|---|---|---|
| 波及型 | 他ファイルのコンテンツ修正が、`getCollection` / `src/data` を経由してこのページの描画を変えた | `index.astro` が strategies を `monthsGained` 降順で 74 行描画するので、1 件の訂正で並びと連番が動く | **消したい** |
| 直接型 | そのテンプレート自身、または `src/lib` が変わった | `style(strategies):` によるボックスの余白変更、`faq.astro` の散文の直接編集 | **残すべき** — #433 で `src/pages/**` を足した判断が仕事をしている証拠 |

`paths` を #433 以前に戻すと直接型まで見えなくなる。前者だけを止める手段が `paths` には無い。

## 決定

**ベースラインを「main のコード × PR のコンテンツ」で撮る。** 比較に残る差分がコード由来だけになり、
波及型が構造的に消える。

- `dist-main` = main のコード + **PR の** `src/content` / `src/data` / `src/content.config.ts`
- `dist-pr` = PR のコード + PR のコンテンツ

### 運ぶ素材の allowlist

`src/content/` と `src/data/` を `rsync -a --delete` で、`src/content.config.ts` を `cp` で運ぶ。

- `--delete` は必須。PR が消した md が main 側に残ると、消えたはずのカードがベースラインにだけ
  描かれて、それ自体が差分になる
- `src/content.config.ts` を同伴させないと、PR がスキーマを緩めて入れた値を main の zod が弾く
- `public/` は運ばない。`find src/content -type f ! -name "*.md"` が 0 件でコンテンツ編集者が
  画像を持ち込む経路が無く、`public/` にあるのはブランド資産と配信設定だから
- `package.json` / `package-lock.json` は運ばない。依存バンプの視覚影響は VRT が見るべきもの
  （ADR 0027 が Astro 7 移行を VRT で検証した）

allowlist は手書きの列挙なので腐る。`scripts/__tests__/workflows/vrt-baseline.test.mjs` が
`src/` の実ディレクトリを走査し、**運ぶ・`paths` で監視する・描画に入らないと明言する**の
三択を強制する。

### `src/data/**` を `paths` から外す

運ぶ以上、`paths` に残すと「起動はするが構造上ぜったいに差分が出ない」トリガになり、
15 分の CI を空回りさせる。同テストが「運ぶディレクトリは paths に載っていない」を固定する。

### degraded フォールバック

main のコードで PR のコンテンツをビルドできない経路が実在する — `index.astro` の
`featuredConcernSlugs` に無い slug、`faq.astro` の `months(slug)` が引けない戦略 md。
このときジョブを落とさず、main 自身のコンテンツで撮り直して従来動作に縮退する。VRT は
required check ではない（ADR 0024）ので、赤を出さずに縮退させる自由がある。

- 失敗の許容は**ビルドコマンド 1 つだけ**に掛ける。広く掛けると `npm ci` の失敗・ネットワーク断・
  pagefind の異常終了まで「degraded で続行」に落ち、インフラ障害が緑で通る
- **縮退側の撮り直しが失敗したらジョブを落とす**（main 自体が壊れている）
- 復元は `git checkout -- .` + `git clean -fd` に加えて `.astro` / `node_modules/.astro` /
  `node_modules/.vite` を明示削除する。`git clean` は `-x` が無いと gitignore 済みを消さないので、
  Astro の content layer キャッシュが残ると PR のコンテンツで描かれたページが混入する
- 相は `::warning` と `$GITHUB_STEP_SUMMARY`（比較の**前**に無条件で書く）に加えて、
  **artifact 名**（`vrt-report-<mode>`）にも出す。赤い run で人が実際にクリックするのは
  artifact であって summary ではない。
  **三項で「neutral だけ素の名前」にはできない** — GitHub の式は空文字を falsy として扱うので
  `X == 'neutral' && '' || format(...)` は常に右辺を返す。常時サフィックスにして、ベースライン
  ステップが `mode` を書く前に落ちた run は `vrt-report-nobaseline` になるようにした
- **比較ステップの名前は変えない。** `(code-only diff)` と付けると degraded の run で名前が嘘になる

### 逃がし

`workflow_dispatch` に `neutral`（既定 true）を足す。コンテンツ側の値の描画幅をわざと変える
変更（issue #518 に対する PR #540 の「測定なし」導入が実例）では、素の main ベースラインで撮り直せる。

`inputs.neutral == false` とは書かない。GitHub の式は型が違うと数値に寄せるので、
`pull_request`（null）でも真になり既定が反転する。`github.event.inputs.neutral || 'true'` を使う。

## ADR 0024 / 0033 の訂正

ADR は不変とする運用のため（ADR 0029 と同じ）、両者は書き換えず本 ADR で訂正する。

**ADR 0024**

| 箇所 | 訂正 |
|---|---|
| 背景「コンテンツ編集は…全 PR に VRT をかけると差分がノイズだらけになる」 | 前提は正しいが、`paths` では防げなかった。防ぐ場所は比較の側 |
| 対象 URL「計 16」と changelog を含む列挙 | 実件数は **15**。changelog は #433 で対象外にした（問題が現れたのは #428。経緯は `vrt/pages.spec.ts` 冒頭） |
| ゲートの paths 列挙 | #433 で `src/pages/**`・`src/lib/**`・`src/plugins/**`・`src/data/**` が追加され、本 ADR で `src/data/**` が削除された |
| 「検出される差分は実変更のみとなる」 | 成り立っていなかった。他ファイルのコンテンツ修正の波及が混ざっていた |
| 帰結「コンテンツ編集 PR は対象外のため、日常のテキスト更新を妨げない」 | #433 以降は偽。本 ADR で実質的に回復する |
| コスト「main と PR を 2 回ビルドする」 | degraded では 3 回になる |

**ADR 0033**（「それでも pass するのは…`maxDiffPixelRatio: 0.01` に届かないため」）

閾値は現在 **0.001**（`playwright.vrt.config.ts`）で、当時の判定は再現していない。なお当該ラベルは
`strategies/[...slug].astro` などテンプレートのリテラルなので、**本 ADR の中立化では消えない**。

## 帰結

### 検証（すべて 2026-09-10 の実測。基準は `origin/main` = `f8aa151`、ピクセル比較は macOS ローカルで 2 ビルドを撮り比べた）

| 検証 | 結果 |
|---|---|
| 合成変異 M1（`outdoor-learning.md` の `monthsGained: 0→3` / `monthsUnmeasured: true→false`） | 中立化なし **2 赤**（home の desktop / mobile）、中立化あり **30 全通過** |
| 検出力（`global.css` の `h2` に `letter-spacing: 0.06em`） | 素の比較で **19/30 赤**。M1 を重ねて中立化しても**同じ 19 件・同一集合**（`diff` で完全一致） |
| 過去 PR の再現（#491 `fix(content): correct subject-specialist effect sizes`。`99d9759` と その親を撮り比べ） | 中立化なし **5 赤**（columns-index ×2 / home ×2 / policy-evidence ×1）→ 中立化あり **1 赤**（policy-evidence のみ）。この PR は `policy-evidence.astro` も編集しているので、残るのが正しい。**当時の CI 記録（run 33311424107）は 4 赤で policy-evidence を含まない** — 基準が違う（CI は当時の main とのマージ結果を Linux で、こちらは親コミットとの比較を macOS で撮っている）ので、母数の一致は期待できない |
| degraded 経路（`npm` をシムに差し替えて分岐を実行） | mode=degraded、警告が出る、ビルドは 2 回、worktree が main の内容へ復元され dirty 0 |
| インフラ障害（全ビルド失敗 / `npm ci` 失敗） | いずれも rc=1 でジョブが落ちる（degraded に落ちない） |
| ガードの変異試験 16 種 | 全件で赤。消去型（運ぶ素材の削除・`--delete` 削除・`node_modules/.astro` の削除漏れ・`Report baseline mode` ごと削除・`id: baseline` 削除・`--update-snapshots` 削除）、**並べ替え型**（運ぶのをビルドより後ろへ移す ＝ ベースラインが main 自身のコンテンツで焼かれるのに `mode=neutral` と報告される）、握りつぶし型（`npm ci` に `\|\|` / `set +e` で囲む / 撮り直しの失敗を許容 / `continue-on-error`）、式の型（型変換で反転する形・artifact 名を固定／三項に戻す）、`src/data/**` を paths に戻す、`src/` に新ディレクトリを足す |

19/30 は `CLAUDE.md` が記録していた値と一致した。同じ実験について
`playwright.vrt.config.ts` のコメントは「portfolio で実施、36 件中 34 件が通った」と書いており
母数が違うが、これは別リポでの実験なので矛盾ではない。

### 利点

- 他ファイルのコンテンツ修正が波及しただけの赤が構造的に消える
- テンプレート・共有コンポーネント・`global.css` の回帰は、実測で**同一集合**のまま残る

### コスト

- degraded ではベースラインを 2 回ビルドする（合計 3 回）
- allowlist の維持が要る。ガードが三択を強制するので、忘れると赤くなる

### 受け入れた死角

- **`.astro` に直接書かれた散文・数値は中立化されない。** 実体がコンテンツでも、置き場所が
  コードなのでコード側の変更として扱われる。`faq.astro` の `faqSections`、
  `policy-evidence.astro` の `comparisons`、`about.astro`、`guide/indicators.astro` が該当する。
  直近 20 実行の失敗 62 件のうち、この型は **最大 16 件**（faq 12 / policy-evidence 3 / about 1）。
  faq の 14 件のうち 2 件は #515（`src/lib/glossary-inline.ts` の修正）由来で、`faq.astro` の
  散文ではない。また `faq.astro` は `getCollection("strategies")` も描画しているので、
  faq の赤は原理上「波及型」にもなりうる — この行は表の他の行より確度が低い。
  **リテラル散文を `src/data/` へ移せば本 ADR の仕組みがそのまま効く**（CI の再変更は要らない）
- **コンテンツ起因のレイアウト崩れが見えなくなる。** 長い見出しが折り返して崩れる類は、
  両側に同じ文字列が入るので差分にならない。PR #540（issue #518 の「測定なし」導入でラベル幅が
  変わる）が実例。
  `workflow_dispatch` の `neutral=false` が逃がしになる
- **`src/data/` の中のロジック変更が見えなくなる。** `concerns.ts` の `getAllConcerns` /
  `getConcernIndex`、`glossary.ts` の `tooltipTerms` は純データではない。データとロジックを
  別ファイルに割れば、ロジック側を `paths` に戻せる
- **`src/content.config.ts` の `.default()` は描画される値**なので、既定値だけを変える変更は
  混在 PR で隠れる。同ファイルは `paths` に無いため単独では VRT が起動しない
- `changelog.astro` はエントリが `.astro` にあるので中立化されない。VRT の対象から外している
  理由（#428）は本 ADR では変わらない

### `.astro` の散文の移設(2026-09-11 追記)

上の「受け入れた死角」の列挙は本 ADR 採用時(2026-09-10)の状態。その後、次の 2 本を `src/data/` へ移した:

- `faq.astro` の `faqSections` → `src/data/faq.ts`
- `policy-evidence.astro` の `comparisons` → `src/data/policy-evidence.ts`

移設前後で `dist` の HTML は byte 一致(差分は `design-tokens.json` の `generatedAt` だけ)。
上で名指しした 4 本のうち残るのは `about.astro` と `guide/indicators.astro`(散文がマークアップ
直書きで、データ定数を持たない)。上の列挙は直近 20 実行の赤から拾ったもので網羅ではなく、
同型のデータ定数に散文を持つページは他にもある(`seasonal/july.astro` の `scenes`、
`guide/index.astro` の `guides`。いずれも VRT 対象)。

移設に伴って変わる点:

- `faq.ts` は `buildFaqSections(months)` という**関数**を持つので、「`src/data/` の中のロジック変更が
  見えなくなる」の該当ファイルに加わる。ただし判断を持つ `months`(`getCollection` → `effectLabel`)は
  `faq.astro` 側に残しており、関数の中身は回答文への補間だけ
- degraded の例に挙げた「`faq.astro` の `months(slug)` が引けない戦略 md」は、slug の一覧が PR 側の
  `faq.ts`(運ばれる側)から来るようになったので、その形では起きない。残るのは `faq.ts` の export の形を
  main の `faq.astro` が読めなくなる型
- `check:tokens` は `.astro` しか走査していなかったので、`src/data/` 配下の `.ts` も対象にした
  (回答文の `class` 属性が検査から外れないように)

なお本 ADR を確定した PR は #565。

## 参照

- `.github/workflows/vrt.yml` / `scripts/__tests__/workflows/vrt-baseline.test.mjs`
- ADR 0024（VRT の導入）/ ADR 0027（Astro 7 移行を VRT で検証）/ ADR 0029（ADR を書き換えず
  後続 ADR で訂正する運用）/ ADR 0033（`lastVerified`）
