# 0026. Cloudflare Web Analytics を手動スニペット方式で導入し CSP を最小限緩和する

- 状態: 採用
- 日付: 2026-07-12(決定・実施)。本 ADR は 2026-07-15 の追認記録(実施時に起票漏れ)
- 関連 PR: #366
- 関連 ADR: okinawa-in-data `docs/decisions/0002`(同方式の初出 ADR)/ 姉妹ミラー: edu-watch 0062・edu-law 0024・isagawa-hayato-portfolio 0006

## 背景

2026-07 の到達度改善診断で「計測」が最弱軸(実訪問データが取得できていない)と判明した。Web Analytics(WA)自体は過去に設定済みだったが、**WA サイトのセットアップモード(自動)とビーコン注入の組合せ不整合により、RUM 収集の POST が 503 で拒否され約 3 ヶ月イベント 0 件**という無音故障を起こしていた(DevTools 実測+コミュニティ既知問題として確認。CSP 原因説は検証の結果反証)。

## 検討した選択肢

1. **Pages 統合の自動注入(従来構成)** — サイト設定モードとの不整合が無音故障の温床。廃止
2. **手動モードの WA サイト+静的スニペット** — 注入経路が単一で、リポジトリで追跡可能。採用
3. **ビーコンへの SRI(integrity)付与** — beacon.min.js は Cloudflare が継続更新する evergreen スクリプトで、ハッシュ固定は CF 側更新のたびに読込失敗=無音の計測停止(上記障害と同型)を招く。読込元は CSP の script-src で単一ホストに固定済みのため不付与

## 決定

1. WA サイト(edu-evidence.org)を「JS スニペットのインストールで有効にする」(手動)モードへ切替え、Cloudflare Pages 統合の Web Analytics 自動注入は無効化する
2. ビーコンを `src/layouts/Layout.astro` に静的に記載する(`is:inline type="module"`、トークンはリポジトリ管理)
3. `public/_headers` の CSP は **connect-src へ `https://cloudflareinsights.com` を追加するのみ**(`https://static.cloudflareinsights.com` は script-src / connect-src とも既許可で変更なし)

## 帰結

- デプロイ後に `POST https://cloudflareinsights.com/cdn-cgi/rum` の 204 を実測し、ダッシュボードへのイベント記録も確認(計測のエンドツーエンド復旧、2026-07-12)
- 全ページに外部スクリプト 1 本(数 KB・cookie なし・ドメイン単位の集計)

## 撤回 / 再検討の条件

- 手動モードのビーコン仕様変更で 503 や読込失敗が再発した場合
- リファラ内訳などより詳細な計測が必要になり、別基盤へ移行する場合
