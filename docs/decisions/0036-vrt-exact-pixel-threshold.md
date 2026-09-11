# 0036. VRT の判定を比率から `threshold: 0` + `maxDiffPixels: 0` に変える

- 状態: 採用
- 日付: 2026-09-11
- 関連 PR: #(本 ADR と同一 PR で確定)

## 背景

VRT の判定は導入時（ADR 0024）から `maxDiffPixelRatio` で行っており、0.01 が緩すぎた（`h2` の
`letter-spacing` 0.06em の変更で 30 件中 2 件しか落ちない）ため 0.001 に下げた経緯が `CLAUDE.md` にある。
ADR 0033 の「それでも pass するのは…0.01 に届かないため」は、その時点の値で書かれている（ADR 0034 が注記）。

姉妹リポ edu-law は、比率では塞がらない取り逃がしが 2 系統あることを実測して比率をやめている
（`playwright.vrt.config.ts` のコメントと同リポの `CLAUDE.md`）:

- **長さ**: 許容量 = 総ピクセル数 × 比率なので、ページの長さに比例する。edu-law では 0.001 の許容が
  短いページと長いページで約 15 倍開き、公式解説名を 8 文字増やした差分 1036px が許容 5636px の中に
  収まって通った
- **色**: Playwright が pixelmatch に渡す `threshold`（既定 0.2）未満の色差は差分として数えられない。
  比率を 0 まで下げても色だけの変更は捕まらず、`threshold: 0` にして初めて赤になった

このリポの 15 URL × 2 projects も同じ判定器を使っているので、同じ穴がある。

## 検討した選択肢

1. **`threshold: 0` + `maxDiffPixels: 0`**（edu-law と同じ）。ノイズが 0 でなければ使えないので、
   CI で測ってから置く
2. 比率を据え置き、`threshold` だけ下げる。長さの穴が残る
3. 比率を据え置く。ファミリーで判定基準が割れたままになる

## 決定

**1 を採り、ファミリー全体をこの形に揃える**（edu-watch / okinawa-in-data / isagawa-hayato-portfolio は
別 PR で、edu-law は済み）。

`threshold` と `maxDiffPixels` は最終判定だけでなく撮影の安定化ループ（連続 2 枚が一致するまで撮り直す）の
収束条件でもあるので、収束しなければ `expect.timeout` に達して落ちる。ノイズは「PR 自身の VRT run」で測った —
この PR は設定と文書しか変えないので、ベースライン（main のコード × PR のコンテンツ）と PR 側の `dist` は
同一になり、赤が出ればそれはすべてノイズになる。

### ノイズ測定（2026-09-11）

`workflow_dispatch` で本ブランチの VRT を 3 回まわした（run 34581514173 / 34582030231 / 34582511483）。
3 回とも `MODE: neutral`、ベースラインの `origin/main` は `1a6ea58` で不変、撮影 30 / 比較 30 が全通過、
"Failed to take two consecutive stable screenshots" は 0 件。手元（macOS）でも同一 `dist` の撮り比べで 30 / 30。

## 帰結

- 閾値 0 はバイト完全一致ではない。pixelmatch の `includeAA`（既定 false、Playwright は上書きしない）により
  アンチエイリアスと判定された画素は数えないので、エッジだけが変わる変更は盲点として残る
- `maxDiffPixels` は未指定でも 0 だが、型定義が契約ではない（"unset by default"）ので明示する。
  `threshold` の既定 0.2 が判定を黙って殺していたのと同じ形に戻さないため
- `retries: 0` は維持する。安定化ループで収まらなかった問題まで握りつぶすことになるため

### 訂正

ADR は不変とする運用のため、旧 ADR は書き換えず本 ADR で訂正する。

| 箇所 | 訂正 |
|---|---|
| ADR 0024「`toHaveScreenshot` の差分閾値」／`CLAUDE.md` に残る「0.01 → 0.001」の経緯 | 比率そのものをやめた。0.001 は長さと色の 2 系統を取り逃がす |
| ADR 0033「`maxDiffPixelRatio: 0.01` に届かないため」 | ADR 0034 が「現在 0.001」と注記済み。本 ADR 以降は比率ではない |

## 撤回 / 再検討の条件

- CI で収束失敗（"Failed to take two consecutive stable screenshots"）が繰り返し出るなら、`maxDiffPixels` を
  ノイズの実測値に置き直す（比率には戻さない）
