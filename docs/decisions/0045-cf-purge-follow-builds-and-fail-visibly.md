# 0045. cf-purge は本番に出なかったビルドで赤になり、置き換えたビルドを追い、確かめられないときは purge して赤で終わる(edu-watch ADR 0080〜0082 ミラー)

- 状態: 採用
- 日付: 2026-10-27
- 関連 PR: #(本 ADR と同一 PR で確定)
- 関連 ADR: 0032(「失われるもの 2」の tag を引けないときの経路を本 ADR で上書き)、edu-watch ADR 0080・0081・0082(原本)、edu-law ADR 0033(同ミラー)

## 背景

`cf-purge.yml` は main への push ごとに Workers Builds の該当ビルドの完了を待ち、ゾーン(3 サイトで共有)のキャッシュを purge する。これまでの書き方は次のとおりだった。

- 15 秒 × 40 回(10 分)で待つのをやめ、`exit 0` で終わる
- `success` と `fail` / `cancelled` しか知らず、`terminated` / `skipped` は待ち続けた末に緑で終わる。`fail` も `exit 0`
- script tag を引けないと 3 分待って purge し、緑で終わる(ADR 0032 がトークンの差し替え前でも CI を落とさないために残した経路)
- builds API のエラーは `2>/dev/null` と「待つ」に紛れる
- 同じ SHA のビルドを一覧の最初の 1 件で選ぶ(並び順は API が保証していない)

姉妹リポ edu-watch は同じ書き方で、2026-10-23 に `terminated` のビルドを 10 分待って緑で終わった(purge もしていない)。edu-watch はこれを ADR 0080〜0082 で直し、テストを付けた。

2026-10-27 に Cloudflare の builds API で、このリポのビルドを全 582 件(main 270 件)数えた。いずれもビルドの作成時刻から数えた値である。

- main の success は 220 件。作成から成功までの最長は 1064 秒(約 18 分)で、10 分を超えたものが 9 件あった。今の 10 分の待ちでは purge に届かない
- main の skipped は 48 件。どれにも、置き換えた新しい main のビルドが一覧にあった。skipped のビルドの作成から、置き換えたビルドの停止までの最長は 1780 秒(約 30 分)
- main の fail と terminated が 1 件ずつあった。同じ SHA の main のビルドが 2 件ある commit が 2 つあった(success と fail、success と terminated)
- `created_on` は全件 `YYYY-MM-DDTHH:MM:SS.sssZ`、本番のトリガーは 1 つ

トークンは 2026-08-05 に Workers Scripts: Read へ差し替え済みで、ADR 0032 が緑のまま purge する経路を残した理由はもう無い。

## 決定

edu-watch の `cf-purge.yml` と `cf-purge-workflow.test.mjs` を移植する。挙動は edu-watch ADR 0080〜0082 と同じ。

- `fail` / `failure` / `terminated`、未知の値、期限切れは exit 1
- 自分のビルドが `skipped` / `cancelled` なら、同じトリガーで自分より後に作られた main の最新ビルドを追う。`success` なら purge、失敗なら赤。新しいビルドが一覧に無ければ purge せず exit 0
- 同じ SHA のビルドは `created_on` を時刻として並べ、最も新しいものを見る
- ビルドを確かめられないとき(tag を引けない・401 / 403 / 404・一時的な失敗が 5 回続く・429 のまま期限に届く)は、開始から 3 分待って purge し、exit 1。ADR 0032 の「警告して固定待機してから purge」の経路は、この「purge して赤」で上書きする
- 429 は `Retry-After` と通常の間隔の長い方だけ待ち(上限 300 秒)、失敗の回数に数えない
- 待ちは経過時間で打ち切る。自分のビルドに 25 分、置き換えたビルドを追う分を含めて全体で 45 分。curl に `--max-time 20`、`timeout-minutes` は 20 から 55 にする

テストは `scripts/__tests__/workflows/` に置き、行頭の `test(` しか許さない検査(`check-scripts.test.mjs`)に合わせて、edu-watch のループを 1 行ずつの登録に展開した。

## 帰結

- 直前に skipped が無い `GITHUB_TOKEN` のマージ(Dependabot の自動マージ)は、変わらず purge されない(最大で Edge TTL の 10 分)
- 追った先のビルドが失敗すると、人の push の run が赤になる
- トークンの権限が外れている間は、main への push のたびに赤になる
- 正常に遅いだけのビルドでも 25 分を超えると赤になる。実測の最長は約 18 分

## 撤回 / 再検討の条件

- 作成から成功まで 25 分、または skipped から置き換えたビルドの停止まで 45 分を超えるビルドが出たとき
