# 0046. Node.js を 26 LTS に上げる(ADR 0002 の版の決定を上書き)

- 状態: 一部撤回(engines の決定を 0047 で上書き)
- 日付: 2026-11-13
- 関連 PR: #(本 ADR と同一 PR で確定)

## 背景

ADR 0002 は、ファミリーの全プロジェクトの Node を 24 LTS にそろえると決めた。Node.js の公式リリース予定表(`nodejs/Release` の `schedule.json`)では、24 は 2026-10-20 に Maintenance LTS へ移り、サポートは 2028-04-30 に終わる。26(Lithium)は 2026-10-28 に Active LTS になり、サポートは 2029-04-30 まで続く。

## 決定

ファミリー各リポの `.tool-versions` を `nodejs 26.13.1` にする。mise と `.tool-versions` で版を管理するという 0002 の決定は、そのまま残す。

- `package.json` の `engines.node` は `>=24.0.0` のまま変えない。下限を書いているだけで、26 も満たす
- 本番のビルドの版は `.tool-versions` では決まらず、Workers Builds のビルド変数 `NODE_VERSION` で決まる。`.tool-versions` と同じ版にそろえる(手順は `CLAUDE.md` の「環境」)。0002 にある Cloudflare Pages の版の指定は、0032 の移行で使わなくなった

## 帰結

- サポート期間が 1 年延びる
- 移行の前に、同じ main を 24.22.3 と 26.13.1 でビルドして出力を比べた。差はタイムスタンプとビルドごとのランダムな値だけだった
- Workers Builds の npm は既定の 10.9.2 のままで、26.13.1 に同梱の 11.20.0 にはならない。手元と CI の npm とずれるが、このずれは 24 のときからある

## 撤回 / 再検討の条件

- 使っている依存パッケージが Node 26 に対応しなくなった場合
- 次の LTS が Active LTS になった場合(`schedule.json` では 27 が 2027-10-20)
