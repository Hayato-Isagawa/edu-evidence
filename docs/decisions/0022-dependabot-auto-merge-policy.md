# ADR 0022: Dependabot patch/minor 自動マージ運用と main ブランチ保護

## Status

採択 (2026-05-14)

## Context

EduEvidence JP は 1 人開発の Astro サイトで、依存更新は `.github/dependabot.yml` により毎週月曜 09:00 JST に Dependabot が PR を生成する。これまで全 PR を手動マージしていたが、`@types/*` や `eslint` 系の patch / minor 更新まで毎週手動レビューするのは編集コンテンツへの集中を阻害していた。

一方で「全部自動マージ」も採れない。Astro / React / TypeScript の major は破壊的変更を含むことが多く、過去にも `typescript` major が `@astrojs/check` の peer dependency と衝突して `npm ci` を壊した経緯がある(`.github/dependabot.yml` の `ignore` ブロックで TypeScript major を除外している理由)。

CI は `e2e.yml`(Playwright E2E、PR トリガー、ビルド + 37 テスト)が動いており、Cloudflare Pages も PR ごとにプレビューデプロイを走らせる。前者は自前管理で挙動が予測できるが、後者は CF 側のデプロイ仕様変更で詰まるリスクがある(過去にも CF Pages の build status reporting が変わったことがある)。

## Decision

Dependabot の patch / minor を CI green 後に自動マージし、major のみ手動レビューする運用に切り替える。

### 自動マージ機構

`.github/workflows/dependabot-auto-merge.yml` が `pull_request` で起動し、`github.actor == 'dependabot[bot]'` の場合のみ `dependabot/fetch-metadata@v2` で update-type を取得、`semver-major` 以外で `gh pr merge --auto --squash --delete-branch` を発火する。

### main ブランチ保護

`gh api PUT /repos/Hayato-Isagawa/edu-evidence/branches/main/protection` で以下を設定:

- `required_status_checks.contexts = ["Playwright E2E"]`(自前 CI のみ。Cloudflare Pages は含めない)
- `required_status_checks.strict = false`(strict にすると Dependabot PR が main の更新ごとに rebase を要求され auto-merge が連鎖的に詰まるため)
- `required_pull_request_reviews = null`(1 人開発のためレビュー必須にしない)
- `enforce_admins = false`(初期値。手動の hotfix 経路を残す。運用が安定したら true への昇格を検討)
- `restrictions = null` / `allow_force_pushes = false` / `allow_deletions = false`

### 前提条件 3 点

1. `allow_auto_merge = true`(リポジトリ Settings > General)
2. main ブランチ保護で required CI が登録済(本 ADR で設定)
3. Settings > Actions > General の「Allow GitHub Actions to create and approve pull requests」が有効

3 つすべて揃わないと `gh pr merge --auto` は permission エラーで失敗する。3 点とも 2026-05-14 時点で適用済。

### major の扱い

`.github/dependabot.yml` の `ignore` で長期的に許容できない major を明示除外する(現在は `typescript`)。除外していない major は Dependabot が PR を出すが、本ワークフローでは auto-merge せず、編集者が手動でレビュー・マージする。

## Consequences

### 利点

- 毎週 5〜10 件発生する patch / minor PR の手動マージ作業がなくなり、編集コンテンツ作業時間を確保できる
- CI green が required になったため、テスト破壊コミットが main に直接届かなくなる
- ブランチ保護で `allow_force_pushes = false` / `allow_deletions = false` のため、main の事故消失リスクが構造的に消える

### コスト

- ブランチ保護で main 直 push が不可になる(今後すべて PR 経由)。1 人開発で稀に main を直接更新していた場合の作業手順変更
- Dependabot による依存更新がプッシュごとに自動的に main に反映されるため、月次で `git log --since="last month" --grep=Dependabot` 等で変更履歴をまとめて確認する運用が必要
- `enforce_admins = false` のため、緊急時に管理者(本人)が保護をバイパスできる。これは hotfix 経路の意図的な確保であり、運用安定後の `true` 昇格は別 ADR で判断

### 影響範囲

- ローカルからの `git push origin main` は今後拒否される。すべて feature ブランチ + PR 経由
- Cloudflare Pages のデプロイは PR プレビュー / main デプロイともに変化なし(required check に含めていないため)
- `.github/dependabot.yml` の構成自体は変更なし。本 ADR は「既存設定の上に auto-merge と branch protection を重ねる」変更

## References

- `.github/workflows/dependabot-auto-merge.yml`(PR #188 で導入、2026-05-13 マージ)
- `.github/dependabot.yml`(既存。`typescript` major ignore あり)
- `~/.claude/templates/dependabot/`(本運用の標準形を雛形化、新規リポジトリ展開用)
- 姉妹サイト: edu-watch ADR 0041、edu-law ADR 0004(同じ運用方針を 3 リポジトリ横断で採用)
- isagawa-hayato-portfolio は private/Free のためブランチ保護不可 → 本 ADR の運用対象外、手動マージ継続
