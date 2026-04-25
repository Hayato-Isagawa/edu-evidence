# Context Management

会話は消える。ファイルは残る。EduEvidence JP で意思決定や進捗を保全するための運用方針。

## 基本原則 — File is the memory

Claude Code とのセッションは context window の上限に達すると圧縮(コンパクション)される。圧縮時に失われやすいのは「議論の過程」「却下した選択肢の理由」「試行錯誤のログ」。これらをファイルに書き出しておけば、圧縮を跨いで保全できる。

| レイヤ | 役割 | 配置 |
|---|---|---|
| **`.claude/state/active.md`** | 現在のセッションのチェックポイント。マイルストーンごとに更新 | `.gitignore` で git 追跡しない(私的状態) |
| **`docs/decisions/<連番>-*.md`**(ADR) | 主要意思決定の不変記録 | git 追跡、Public |
| **`docs/sessions/<日付>.md`**(任意) | 1 セッションの議事録要約 | git 追跡しない場合は `.gitignore` |
| **メモリ**(`~/.claude/projects/.../memory/`) | 運営者の個人的な嗜好・私的方針 | Private、リポジトリ外 |
| **`CLAUDE.md` / `docs/BRAND.md` / `docs/CONTENT_GUIDELINES.md`** | プロジェクトの恒久的な規約 | git 追跡、Public |

## レイヤ間の振り分け指針

- **「決まったこと」** → ADR(`docs/decisions/`)
- **「いま作業中の具体内容」** → `.claude/state/active.md`(逐次更新)
- **「変わらない規約・ルール」** → `CLAUDE.md` / `BRAND.md` / `CONTENT_GUIDELINES.md`
- **「運営者の個人的な嗜好」** → メモリ(リポジトリ外)
- **「公開しない議事録」** → `.gitignore` 配下(必要なら `docs/sessions/`)

迷ったときの判断:**「他のメンテナーが半年後に読んで意味があるか」=Yes なら ADR、No なら state / メモリ**。

## active.md の運用

`.claude/state/active.md` は **生きたチェックポイント**。以下のタイミングで更新する:

- 主要な意思決定が確定した時(ADR を起こすほどでもない小規模な合意も含む)
- PR を作成した / マージした時
- 別ブランチに切り替える時
- 同じ問題で 2 回以上試行錯誤した時(失敗ログとして)
- セッション終了時

書く内容(必要な項目だけで OK):

- 現在の主タスク
- 進行中の PR 一覧と状態
- 進行中のブランチ
- 直近の意思決定(ADR にするほどでない小決定も含む)
- 試行して失敗したこと(2 回目を防ぐため)
- 未決の問い

## ADR の運用

`docs/decisions/<連番>-<短いスラッグ>.md`(例: `0001-plant-motif-brand-system.md`)。

各 ADR は以下のテンプレに従う:

```markdown
# 0001. タイトル

- 状態: 採用 / 撤回 / 上書き(0042 で上書き、等)
- 日付: YYYY-MM-DD
- 関連 PR: #N, #M

## 背景

何が問題で、なぜ決定が必要だったか。

## 検討した選択肢

- A) ...
- B) ...
- C) ...

## 決定

採用した案と理由。

## 帰結

- 良い帰結
- トレードオフ / 既知のリスク

## 撤回 / 再検討の条件

何が起きたら見直すか。
```

ADR は **不変** が原則。決定が覆ったら新規 ADR を起こし、旧 ADR の「状態」を `撤回(####で上書き)` にする。

## 圧縮(compaction)対策

### 自発的に圧縮するタイミング

- context 使用率が 60〜70% に達した時(限界まで待たない)
- 関連の薄いタスクに切り替える時(`/clear` を使う)
- 「同じ修正を 2 回試して失敗した」直後(リセットして再挑戦)
- ファイルへの書き出し / コミット / PR 作成の直後(自然な区切り)

### 圧縮直前の準備

`.claude/hooks/pre-compact.sh` が自動的に以下を会話に dump する:

- `.claude/state/active.md` の内容(現在のセッション状態)
- git の uncommitted / staged / untracked ファイル一覧

これにより、圧縮後のサマリにも必ず active.md への参照とファイル変更状態が含まれる。

### 圧縮直後の復元

`.claude/hooks/post-compact.sh` が「active.md を読み直せ」というリマインダーを出す。圧縮後は最初に `.claude/state/active.md` を読むことで、ファイル化されている決定と進行状態を復元できる。

## サブエージェント運用との連携

サブエージェントは独立したコンテキストで走るため、メインセッションの context を圧迫しない。以下を使い分ける:

- **メインで読む**: 1〜2 ファイルだけが対象、結果をすぐ判断に使うとき
- **サブエージェントに投げる**: 複数ファイル横断、5k トークン以上のファイル走査、調査フェーズ

サブエージェント結果が長い場合は、要点のみを active.md に転記し、生の出力は破棄する。

## セッション境界での運用

### セッション開始時

1. `.claude/state/active.md` を読む(最優先、何もしていない時でも)
2. 直近の git log / git status を確認
3. 進行中の PR を `gh pr list` で確認
4. 必要なら関連 ADR(`docs/decisions/`)に目を通す

### セッション終了時

- active.md に「次回の起点」を 1〜2 行書く
- 主要な意思決定があれば ADR を起こす
- 必要に応じて `docs/sessions/<date>.md` を作って議事要約

## 参考

- `.claude/agents/edu-content-reviewer.md` / `edu-pre-write-verifier.md` — 執筆フローの 2 段階レビュー
- `CONTRIBUTING.md` のエージェント活用早見表
- 元になったパターン: [Donchitos/Claude-Code-Game-Studios](https://github.com/Donchitos/Claude-Code-Game-Studios) の `.claude/docs/context-management.md` の核思想を本リポジトリ向けに調整
