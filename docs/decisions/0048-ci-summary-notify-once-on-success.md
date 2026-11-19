# 0048. PR の Actions が全部成功したときだけ、PR に 1 回だけ通知する(ci-summary・edu-law ADR 0036 ミラー)

- 状態: 採用
- 日付: 2026-11-19
- 関連 PR: #632(導入・2026-09-19)・#854(重複防止の印を bot のコメントからだけ拾う)。本 ADR はその決定を後から記録する
- 関連 ADR: edu-law 0036(原本。選択肢の比較と反対意見の全文)

## 背景

GitHub Mobile の「ワークフロー実行」の通知は workflow run 1 本ごとに届き、PR 1 本で何度も鳴っていた。#632(2026-09-19)で `.github/workflows/ci-summary.yml` を足し、PR に 1 件コメントを付けて通知を 1 回にまとめた。ファミリーで最初に入れたのは edu-law で、#632 は同じ日の Hayato-Isagawa/edu-law#266 とその修正の Hayato-Isagawa/edu-law#269 を合わせた形を入れた。

方針は `ci-summary.yml` の冒頭のコメント・`CLAUDE.md`・`CONTRIBUTING.md` に書かれていたが、決定として記録した ADR はどのリポにも無かった。edu-law が ADR 0036 を原本として書いたので、本 ADR はそのミラーとして同じ決定を記録する。

## 決定

edu-law ADR 0036 の決定をこのリポでも採る。

- PR の commit に付いた GitHub Actions の check-run が全部完了し、全部成功したときだけ、その PR に管理者への @メンション付きのコメントを 1 件付ける。`skipped` と `neutral` は成功として扱う
- 失敗したときは何もしない。集約 workflow 自身を赤にすると、それが別の通知源になるため
- 見るのは GitHub Actions の check-run だけ。Cloudflare Workers Builds の check-run は `workflow_run` を起こさないので待たない
- 起動元の workflow の `conclusion` では絞らない。成否は check-run の走査が全件で見る
- Dependabot が起こした run では動かない(起動元の run の `triggering_actor` で判定する)
- 同じ commit には 1 回だけ。コメントに commit の SHA を含む印を入れ、github-actions[bot] のコメントにだけ印を探す(このリポでは #854 から。公開リポなので、誰かが印を先に書けば通知を止められてしまうため)

起動する workflow の列挙・権限・判定の本体の正典は `ci-summary.yml` で、`scripts/__tests__/workflows/ci-summary-workflow.test.mjs` が workflow 全体を固定している。本 ADR には列挙を写さない。

## 帰結

原本の帰結は、原本の ADR 0032(E2E を required にした決定)に触れる箇所を除いて、このリポにも当てはまる。このリポで required にしている check は ci-summary より前に決めたもので(ADR 0022・0028。いまの置き場は ADR 0029 の classic 保護)、ci-summary の死角を理由にしていない。

原本は反対意見(通知の受け方は個人の作業嗜好で、ADR の対象外ではないか)に答えて、ADR にする理由を挙げている。そのうち「死角を別の決定が前提にしている」は、このリポでは当たらない。残りの理由(リポの中身として公開リポに残る・全 PR にコメントが付く・書き込みトークンで走る `workflow_run` を 1 本抱える・ファミリーで原本を決めておく)は、このリポにも当てはまる。

このリポで読むときの点:

- 失敗はこの仕組みでは通知されない。required の check が赤のままでは、保護をバイパスしない限りマージできない(管理者はバイパスできる。ADR 0022)。それでも、赤になったことは PR の check 一覧を見るまで分からない。required でない workflow の赤は、マージも止めず通知もされない。Dependabot が起こした run では、成功も通知しない
- 壊れても静かに壊れるので、workflow 全体と `run:` の本文をテストで固定している(`CLAUDE.md` の「ビルド・テスト」の節の `ci-summary-workflow.test.mjs` の段落)
- PR 起動の workflow を足したら、`workflows:` の列挙にも足す。列挙と各 workflow の `on:` の突き合わせはテストが見ている

## 撤回 / 再検討の条件

原本の条件に従う。原本が撤回・上書きされたら、本 ADR も同じ形で見直す。
