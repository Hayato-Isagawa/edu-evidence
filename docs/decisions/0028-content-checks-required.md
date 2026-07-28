# 0028. Content Checks を main の required check に昇格する

- 状態: 採用
- 日付: 2026-07-28
- 関連 PR: #403(チェックスクリプト追加)/ #404(CI 実行)
- 関連: [`ADR 0022`](0022-dependabot-auto-merge-policy.md)(main ブランチ保護の初期設定。本 ADR で `contexts` を追加する)

## 背景

PR #401 で、EEF が 5 段階中 4(一部は 3)としている確実性評価を、サイトが「EEF で ★5」と表示していた乖離を是正した。この誤りは 5 つの戦略ページにまたがり、**数ヶ月にわたって本番に残っていた**。

残った理由は単純で、**★ を検証する仕組みが存在しなかった**ことにある。`scripts/check-consistency.ts` は `monthsGained` しか見ておらず、他のどのスクリプトも ★ を見ていなかった。

そこで PR #403 で `scripts/check-evidence-strength.ts` を追加し、PR #404 で `.github/workflows/checks.yml`(`Content Checks`)から 7 本のチェックを PR ごとに自動実行するようにした。

ただしこの時点では、チェックが赤くなっても **マージ自体は可能** だった。同じ種類の放置を構造的に防ぐには、失敗を検知するだけでなく、失敗したまま main に入れないようにする必要がある。

## 検討した選択肢

1. **通常の check のまま運用する** — マージ可否は編集者の判断に委ねる。導入コストはゼロだが、放置の再発防止は人間の規律に依存したままで、#401 が起きた状況と本質的に変わらない
2. **required check に昇格する** — チェックが赤い PR はマージできなくなる。Dependabot の auto-merge も同じ条件に従う
3. **昇格に加えて `required_status_checks.strict` も有効にする** — マージ前に main の最新を取り込むことを強制する。チェックの信頼度は上がるが、ADR 0022 が明示的に避けた設定

## 決定

選択肢 2 を採る。`required_status_checks.contexts` に `Content and consistency checks` を追加する。

```
required_status_checks.contexts: ["Playwright E2E", "Content and consistency checks"]
required_status_checks.strict:   false
```

`gh api PATCH /repos/{owner}/{repo}/branches/main/protection/required_status_checks` でサブリソースのみを更新し、ADR 0022 が定めた他の設定(`enforce_admins: false` / `required_pull_request_reviews: null` / `restrictions: null` / `allow_force_pushes: false` / `allow_deletions: false`)はそのまま維持する。

`strict` は **false のまま**にする。ADR 0022 が述べているとおり、strict にすると Dependabot PR が main の更新のたびに rebase を要求され、auto-merge が連鎖的に詰まるためである。

context に指定する文字列は、workflow 名の `Content Checks` ではなく **job 名の `Content and consistency checks`** である。GitHub は job 名を status check の context として報告するため、workflow 名を指定すると永久に満たされない required check ができてしまう。

## 帰結

### 利点

- チェックが失敗している PR は main にマージできなくなり、#401 のような乖離が「気づかれないまま本番に残る」経路が塞がる
- 対象は 7 本(Astro 型チェック / textlint / 読者リテラシー / 長文検出 / `monthsGained` 整合 / エビデンス強度整合 / `lastVerified` 期限切れ)で、いずれも昇格時点で green

### コスト

- **Dependabot の auto-merge もこのチェックの通過が条件になる**。ADR 0022 の auto-merge は required CI が green のときに発火するため、依存更新が Astro 型チェックや textlint を壊した場合、その PR は自動マージされず滞留する。これは望ましい挙動だが、滞留が常態化するようなら運用の見直しが要る
- リンク切れ検査(`check:links` / `check:links:source`)は `Content Checks` に含めていないため、required の対象外である。これはネットワーク依存で不安定なためで、週次の `link-check.yml` が引き続き担当する

## 撤回 / 再検討の条件

- Dependabot PR の滞留が常態化し、依存更新の適用が遅れることが実害になった場合
- `Content Checks` が、コンテンツの問題ではない理由(CI 環境側の不安定さなど)で頻繁に赤くなる場合
- `enforce_admins` を `true` に昇格させる判断をする場合は、ADR 0022 が述べているとおり別 ADR で扱う
