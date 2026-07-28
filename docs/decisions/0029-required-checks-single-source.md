# 0029. required check を classic ブランチ保護に一本化し、ruleset の重複を解消する

- 状態: 採用
- 日付: 2026-07-28
- 関連 PR: #405([`ADR 0028`](0028-content-checks-required.md))
- 関連: [`ADR 0022`](0022-dependabot-auto-merge-policy.md)(`strict = false` の意図)/ [`ADR 0028`](0028-content-checks-required.md)(**本 ADR で記述を訂正する**)

## 背景

ADR 0028 で `Content and consistency checks` を required check に昇格させたとき、確認したのは **classic ブランチ保護だけ**だった。

その後、Dependabot PR #394(linkinator 7.6.1 → 8.0.2)が `mergeable_state: behind` で詰まっていたため原因を追ったところ、**classic 保護とは別に ruleset `main-protection`(enforcement=active)が存在し、独自の `required_status_checks` を持っていた**ことが分かった。

```
ruleset の required_status_checks:
  strict_required_status_checks_policy: true
  required_status_checks: [{ context: "Playwright E2E" }]
```

GitHub は classic 保護と ruleset の両方を適用し、より厳しい方を採る。したがって**実効の strict は true** であり、ADR 0022 が「strict にすると Dependabot PR が main の更新のたびに rebase を要求され auto-merge が連鎖的に詰まる」として明示的に false を選んだ設定は、ruleset 側で打ち消されていた。#394 が `behind` で止まっていたのはこれが原因である。

あわせてファミリー 3 リポの構成を実測した(2026-07-28)。

| リポ | classic 保護 | ruleset の rules |
|---|---|---|
| **edu-evidence** | strict=false / `Playwright E2E` + `Content and consistency checks` | deletion / non_fast_forward / pull_request / **required_status_checks(strict=true)** |
| edu-watch | strict=false / `Playwright E2E` + `Persistent denylist consistency` | deletion / non_fast_forward / pull_request |
| edu-law | strict=false / `Build site` | deletion / non_fast_forward / pull_request |

**「classic 保護と ruleset の併存」自体は 3 リポ共通**で、required check を classic 側に置くのがファミリーの形だった。**edu-evidence の ruleset だけが `required_status_checks` を重複して持っていた**のが逸脱にあたる。

## 検討した選択肢

1. **ruleset にも `Content and consistency checks` を追加し、両方を維持する** — 定義箇所が 2 つのまま残り、片方だけ更新して気づかない事故が再発する。strict=true も残るため #394 の詰まりは解消しない
2. **ruleset から `required_status_checks` を外し、classic 保護に一本化する** — 姉妹 2 リポと同じ形になる。定義箇所が 1 つになり、ADR 0022 が意図した strict=false が実際に効く
3. **classic 保護を捨てて ruleset に一本化する** — GitHub の方向性には合うが、3 リポすべての移行が必要で、本件(#394 の詰まり解消)より範囲が大きい

## 決定

選択肢 2 を採る。edu-evidence の ruleset `main-protection` から `required_status_checks` ルールを削除し、required check は classic ブランチ保護のみで定義する。

```
ruleset  : deletion / non_fast_forward / pull_request
classic  : required = ["Playwright E2E", "Content and consistency checks"] / strict = false
```

`gh api PUT /repos/{owner}/{repo}/rulesets/{id}` は定義全体を要求するため、変更前の定義を取得して保存したうえで、`required_status_checks` のみを除いた rules 配列で更新した。他のルール(`deletion` / `non_fast_forward` / `pull_request`)と `conditions` / `bypass_actors` は変更していない。

### ADR 0028 の訂正

ADR 0028 は「`strict` は **false のまま**にする」と記述したが、これは classic 保護のみを見た記述であり、**当時の実効値は ruleset により true だった**。ADR は不変とする運用のため 0028 は書き換えず、本 ADR で訂正する。0028 の他の記述(required への昇格・context 名が job 名であること・Dependabot への影響)は現在も有効である。

## 帰結

### 利点

- required check の定義箇所が 1 つになり、「片方だけ更新して実効値がずれる」事故が構造的に起きなくなる
- ADR 0022 が意図した strict=false が実際に効くようになり、Dependabot PR が main の更新のたびに詰まることがなくなった。#394 は `behind` → `blocked` に変わり、残る要因は「required 昇格前に作られた PR のため新しい check が一度も走っていない」ことだけになった
- edu-evidence / edu-watch / edu-law の ruleset が同一構成になり、ファミリー横断で同じ説明が通る

### コスト

- **GitHub は classic ブランチ保護を非推奨の方向に進めており、将来 ruleset へ移す必要が生じうる**。そのときは 3 リポまとめて移行する
- required check の設定が GitHub の UI 上 2 箇所に分かれて見える状態は変わらない(ruleset にも「Require status checks」の項目自体は存在する)。空であることを確認する運用が要る

## 撤回 / 再検討の条件

- GitHub が classic ブランチ保護を廃止する、または ruleset への移行を強制する場合
- 姉妹リポ(edu-watch / edu-law)を ruleset 側へ寄せる判断をした場合。そのときは本 ADR も含めて 3 リポ同時に見直す
