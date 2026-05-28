# Supply Chain Audit 2026-05-27〜28

**実施日**: 2026-05-28
**対象リポ**: edu-evidence
**main commit**: `10b2b8fa02ea566ca46952018adb164181c599c8`
**working tree**: clean (untracked なし)
**実施範囲**: A (npm TrapDoor) / D (AI 設定隠し Unicode) / F (GitHub Actions Megalodon)
**対象外**: B (PyPI) / C (Crates.io) / E (Composer) — Astro+Node スタックのみ

## サマリー

- A: **PASS** (詳細 §A)
- D: **PASS** (詳細 §D)
- F: **PASS** (詳細 §F)
- 結論: **SAFE**

## A. npm 依存 TrapDoor

### 検査対象

- `/Users/Hayato/edu-evidence/package-lock.json` (lockfileVersion 3, 約 535KB)
- `/Users/Hayato/edu-evidence/package.json`
- `/Users/Hayato/edu-evidence/node_modules/` (top 2 階層)

### 既知 8 パッケージの grep 結果

検索パターン: `wallet-security-checker` / `defi-threat-scanner` / `token-usage-tracker` / `prompt-engineering-toolkit` / `llm-context-compressor` / `ddjidd564` / `asdxzxc` / `trap-core`

| 検査対象 | 結果 |
|---|---|
| package-lock.json grep | (no match) |
| package.json grep | (no match) |
| node_modules ディレクトリ名一致 | (no match) |
| postinstall scripts (lockfile) | 該当なし |
| preinstall scripts (lockfile) | 該当なし |

### 検出件数

**0 件**

## D. AI 設定隠し Unicode

### 検査対象 (raw bytes 検査のみ。テキスト Read 禁止)

リポローカル 8 ファイル:
- `CLAUDE.md`
- `.claude/settings.json`
- `.claude/agents/edu-content-reviewer.md`
- `.claude/agents/edu-pre-write-verifier.md`
- `.claude/state/active.md`
- `.claude/state/archive/pre-2026-05-12-session-34.md`
- `.claude/state/archive/pre-2026-05-22-session-29.md`
- `.claude/state/archive/sessions-29-53.md`

グローバル `~/.claude/` 配下 719 ファイル (全 4 リポ共通検査として 1 回):
- batch1 (top-level + agents + commands + rules + projects + hooks): 344 ファイル
- batch2 (skills 全体): 375 ファイル

### 検出対象 byte 列

U+200B (E2 80 8B) / U+200C (E2 80 8C) / U+200D (E2 80 8D) / U+FEFF (EF BB BF) / U+2060 (E2 81 A0) / U+180E (E1 A0 8E) / U+00AD (C2 AD)

### スクリプト

`~/audit-2026-05-27/detect_unicode.py` — `open(path, 'rb')` で raw bytes 検査、検出時は hex のみ出力 (検出文字そのものは出力しない、AI 攻撃発火回避)

### 検出件数

**0 件** (ローカル 8 + グローバル 719 = 計 727 ファイル、findings: [])

## F. GitHub Actions Megalodon

### 検査対象

`.github/workflows/*.yml` 計 4 本:
- dependabot-auto-merge
- stale-check
- link-check
- e2e

### 不審 author / C2 ドメイン grep

検索パターン: `build-bot` / `auto-ci` / `ci-bot` / `pipeline-bot` / `build-system@noreply.dev` / `ci-bot@automated.dev` / `216.126.225.129` / `flipboxstudio.info` / `ddjidd564.github.io` / `m-kosche.com` / `git-service.com` / `git-tanstack.com` / `getsession.org` / `api.masscan.cloud`

結果: **(no match)**

### 隠し Unicode 検査 (workflows 4 本)

`detect_unicode.py` 実行結果: `{"scanned_files": 4, "total_findings": 0, "findings": []}`

### attack window (2026-05-18〜2026-05-22) GitHub Actions run 確認

`gh run list -R Hayato-Isagawa/edu-evidence --created '2026-05-18..2026-05-22' --limit 50` 実行。確認したラン名はすべてリポの既知 PR / 既知メンテナンスに対応:
- `fix(columns): correct juvenile delinquency column accuracy issues (#203)`
- `content(columns): add juvenile delinquency Japan reality column (#202)`
- `docs: add CONTEXT.md as agent-facing domain dictionary (#201)`
- `chore(docs): extend active.md template to 6 subsections with implementation-notes`
- FSM attainment finding (EEF Student Grouping Study)
- `chore(security): pin GitHub Actions to SHA (#198)`
- Link Check (schedule)
- Dependabot bump (tailwind / tsx / playwright / textlint)

不審 author や未知ジョブは確認されず。

### 検出件数

**0 件**

## G. 認証情報ローテーション計画

該当なし (全軸 PASS のため不要)

## H. インフラ申し送り

- Cloudflare Pages: 影響なし (リポ依存)
- Cloudflare Email Routing: 影響なし (`eduevidence.jp@gmail.com` 集約に変更なし)
- Cloudflare Workers: 該当なし
- 公開ドメイン (edu-evidence.org): 影響なし

## 結論

**SAFE**

A / D / F すべて PASS。2026-05-27〜28 公開の TrapDoor / Megalodon 攻撃に対して edu-evidence は影響を受けていない。
