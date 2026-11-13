# 0047. engines を Node 26 に上げ、Workers Builds の npm を固定する(ADR 0046 の engines と npm の決定を上書き)

- 状態: 採用
- 日付: 2026-11-14
- 関連 PR: #(本 ADR と同一 PR で確定)

## 背景

ADR 0046 は Node を 26.13.1 に上げたが、次の 2 つは決めずに残した。

- `engines.node` は `>=24.0.0` のまま。手元の Mac が 24 から移り終わるまでの猶予だった。
- Workers Builds の npm は既定の 10.9.2 のまま。手元と CI は 26.13.1 に同梱の 11.20.0 を使っていた。

2026-11-14 に手元の Mac が 3 台とも 26 になった。CI も Workers Builds も 26 でしか動かしておらず、`engines` の下限の 24 で動くかは誰も確かめていない。

## 決定

- `package.json` の `engines.node` を `>=26.0.0` にする。
- `package.json` に `"packageManager": "npm@11.20.0"` を置く。Workers Builds の npm を変えられるのはこれだけで(Cloudflare の build image の文書。`engines.npm` は効かない)、値は `.tool-versions` の Node に同梱の版にそろえる。Node を上げるときの手順は `CLAUDE.md` の「環境」に書く。
- setup-node は `packageManager` が npm を指すと、`cache` の指定が無い step でもキャッシュを有効にする。`cache` の指定が無いのは `audit.yml` だけで、そこに `package-manager-cache: false` を置く(`npm ci` をしないのでキャッシュは要らない。`issues: write` を持つジョブに、汚染されたキャッシュを読む経路を残さない)。

## 帰結

- Node を上げるときにそろえる値が 3 つになる(`.tool-versions`・Workers Builds の `NODE_VERSION`・`packageManager`)。`packageManager` が同梱の版と一致しているかを照合する検査は無く、手順の文書に頼る。
- 24 の Node で `npm ci` すると、`EBADENGINE` の警告が出る(`engine-strict` は使っていないので失敗はしない)。
- Dependabot が使う npm も変わる見込み。dependabot-core のソースでは、`packageManager` が無く lockfile が v3 のときは npm 12 を使い、あるときは 11 系を使う。本番の Dependabot が同じ動きをするかは確かめていない。

## 撤回 / 再検討の条件

- Workers Builds が `packageManager` 以外で npm の版を指定できるようになった場合
- `packageManager` と同梱の版のずれで、ビルドや Dependabot が落ちた場合
