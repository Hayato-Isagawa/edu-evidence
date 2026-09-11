# 0035. 依存の更新でも VRT を走らせる

- 状態: 採用
- 日付: 2026-09-11
- 関連 PR: #(本 ADR と同一 PR で確定)

## 背景

ADR 0034 は、ベースラインへ運ぶ素材から `package.json` / `package-lock.json` を外す理由を
「依存バンプの視覚影響は VRT が見るべきもの（ADR 0027 が Astro 7 移行を VRT で検証した）」と書いた。
しかし VRT の `paths` にはどちらも無く、**依存だけを更新する PR では VRT が起動していなかった**。
直近 60 日にマージされた Dependabot PR 41 件のうち、npm の更新 39 件はすべて VRT の対象外だった
（2026-09-11 実測。残る github-actions の更新 2 件は `vrt.yml` 自身を触るので走ったが、いずれも
VRT の完了前にマージされている）。

ADR 0027 の検証は手動の移行 PR で、`astro.config.mjs` も触っていたから走ったにすぎない。「見るべきもの」は
意図であって実績ではなかった。

姉妹リポでは扱いが割れている。edu-law は `package-lock.json` を、okinawa-in-data は両方を `paths` に
載せており、edu-watch と isagawa-hayato-portfolio は載せていない（2026-09-11 に各リポの `vrt.yml` を実見）。

## 検討した選択肢

1. **`package-lock.json` を `paths` に足す**（edu-law と同じ形）。lock は `package.json` を触る変更を
   必ず伴い、キャレット範囲内の更新も拾うので上位集合になる
2. **`package.json` と lock の両方を足す**（okinawa-in-data と同じ形）。実効は 1 と同じ
3. **足さず、本 ADR で「見ていない」と訂正するだけ**。major の更新は `workflow_dispatch` で手動実行する

## 決定

**1 を採り、ファミリー全体をこの形に揃える。** 本 PR は edu-evidence だけを変え、他のリポは
コンテンツ中立ベースライン（ADR 0034）の横展開と同じ `vrt.yml` を触るので、リポごとに 1 つの PR で
まとめて揃える。okinawa-in-data の `package.json` 行は残しても実効が変わらないので、揃えるのは
lock の行の有無だけ。

理由:

- 費用がほぼ無い。公開リポなので Actions の分は課金されず、1 run は 5 分前後（直近 30 run のうち
  28 run が 4〜6 分）。人の待ち時間も増えない（下の限界のとおり、auto-merge は VRT を待たない）
- major の更新はオートマージされず人が PR を見るので、そこでは事前ゲートとして効く。ADR 0027 の
  検証はこの型で、`workflow_dispatch` を思い出さなくても走るようになる
- 「足さない」で揃える方が高くつく。edu-law と okinawa-in-data は理由をコメントに残して載せており、
  それを剥がす変更になる
- ベースラインは lock を運ばない（ADR 0034）ので、依存 bump の run で比較に残るのは依存の差だけ

## 帰結

### 限界（必ずコメントに書く）

- **非 major の bump ではゲートにならない。** required check は Content Checks と E2E（並列で
  各 1.5 分程度）で、`dependabot-auto-merge.yml` の `gh pr merge --auto` はそれしか待たない。
  Dependabot PR は作成から約 2 分でマージされる（#566 で実測）のに対し VRT は 5 分前後なので、
  結果はマージ後に出る。実際に VRT が走った #385 も、VRT の完了（13:50）より前にマージされた（13:48）。
  残るのは PR 上の check の色と、7 日で消える差分画像（artifact の `retention-days: 7`）だけ
- ファミリーで依存 bump が見た目を変えた実例はまだ無い（okinawa-in-data は astro 7.1.6 → 7.2.0 を
  撮り比べて byte 同一だったと記録している）。当面この run が残すのは「変わっていないことの記録」
- 非公開リポ（okinawa-in-data / isagawa-hayato-portfolio）では Actions の分が課金対象で、
  課金が止まっている間は job 自体が起動しない

### ADR 0034 の訂正

ADR は不変とする運用のため 0034 は書き換えず、本 ADR で訂正する。

| 箇所 | 訂正 |
|---|---|
| 運ぶ素材の allowlist「`package.json` / `package-lock.json` は運ばない。依存バンプの視覚影響は VRT が見るべきもの」 | 運ばない判断は維持。ただし本 ADR までは `paths` に無く、依存だけの PR では VRT が起動していなかった |
| 「`src/data/**` を `paths` に残すと…15 分の CI を空回りさせる」 | 1 run は 5 分前後。15 分は直近 100 run（2026-06-25 以降）のどれとも一致せず、再現できなかった。`vrt.yml` の timeout の注記にある「edu-evidence 13.6 分」（2026-08-19）も、当日の VRT run は 1 件で 5.5 分。timeout は 45 分 |
| ADR 0024 の訂正表「ゲートの paths 列挙 … 本 ADR で `src/data/**` が削除された」 | 本 ADR で `package-lock.json` が追加された |

ADR 0024 の「視覚変更 PR でしか起動しないため required には含めない」は、依存 bump でも起動するようになり
前提が弱くなる。required にしない決定自体は変えない（`paths` による限定起動と required は両立しない）。

## 撤回 / 再検討の条件

- Dependabot PR の VRT が赤になっても誰も見ない状態が続くなら、赤を Issue に流す仕組みを足すか、
  `paths` から外して本 ADR を撤回する
- VRT を required にする決定（ADR 0024 の変更）をするなら、`paths` による限定起動と両立しないので
  本 ADR も見直す
