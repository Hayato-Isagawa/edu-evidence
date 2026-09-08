---
title: 到達できない出典を持つ戦略
summary: 予約 TLD の URL を置き、network error の分類を固定する。
monthsGained: 3
evidenceStrength: 2
lastVerified: "2099-01-01"
---

出典: <https://this-host-does-not-resolve.invalid/paper>

`.invalid` は RFC 2606 が予約した TLD で、名前解決に必ず失敗する。
ネットワークの状態に関わらず同じ結果になるので、一過性の到達不能を
再現する材料として使える。
