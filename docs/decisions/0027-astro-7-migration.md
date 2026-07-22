# 0027. Astro 7 へ移行し、Markdown は `processor: unified()` で従来パイプラインを維持する

- 状態: 採用
- 日付: 2026-07-22
- 関連 PR: #384
- 関連: Dependabot security PR #383(本移行で置換)/ [`ADR 0024`](0024-visual-regression-testing.md)(VRT で移行を検証)

## 背景

Dependabot が astro 本体の XSS advisory を 3 件検知した(GHSA-f48w-9m4c-m7f5 / GHSA-7pw4-f3q4-r2p2 / GHSA-4g3v-8h47-v7g6)。修正版は **すべて 7.x のみで 6.x へのバックポートがなく**、「Astro 6 を維持する」ことと「advisory を塞ぐ」ことが両立しない。

一方で本サイトは `dependabot.yml` で astro / @astrojs/react の major 更新を ignore してきた。理由は **Astro 7 の既定 Markdown プロセッサが Sätteri(companion は今も 0.x)に切り替わり、自作 remark プラグイン(chart / strategy-ref / glossary)+ rehype プラグインを無視する**ことにあった。用語ツールチップ・戦略参照・チャートはサイトの中核機能で、これらを失う移行は取れなかった。

## 検討した選択肢

1. **Astro 6 に留まり advisory を受容** — 修正版が 6.x に存在せず、恒久的に未修正。棄却
2. **Astro 6 のまま手元でパッチ** — 上流の XSS 修正を fork 追随する保守コストが非現実的。棄却
3. **Astro 7 + 既定 Sätteri プロセッサに全面移行** — 自作プラグイン群を Sätteri 向けに再実装する必要があり、リスク・工数が過大。棄却
4. **Astro 7 + `markdown.processor = unified()`** — 安定版 `@astrojs/markdown-remark 7.2.1` の `unified()` を明示指定し、従来の unified パイプラインを温存する。**採用**

## 決定

1. `astro` を 7.1.3、`@astrojs/react` を 6 系へ上げる
2. `astro.config.mjs` で `markdown.processor` に `@astrojs/markdown-remark` の `unified()` を指定し、既存の `remarkPlugins`(chart → strategy-ref → glossary)/ `rehypePlugins`(rehype-external-links)をそのまま適用する。`@astrojs/markdown-remark` と `unist-util-visit` を deps に明示追加
3. `compressHTML: true` を明示し、v6 の空白挙動(ツールチップ字間等)を維持する
4. overrides で `neotraverse` を `^1.0.1` に一本化する(Astro 7 が 1.x を要求する一方 textlint が 0.6.18 を hoist し、prerender ビルドが `forEach` 未 export 版を掴んで失敗するため)。冗長になった `esbuild` override は削除する(vite 8 が 0.28.1 に dedupe)
5. 移行完了に伴い `dependabot.yml` の astro / @astrojs/react major ignore を削除する(typescript の ignore は `@astrojs/check` の peer 制約により残置)

## 帰結

- astro XSS 3 件が解消(`npm audit` から消失)。残る監査項目は dev / build ツール由来で本番非到達
- **`remarkPlugins` / `rehypePlugins` は `processor: unified()` 下で deprecated 扱いとなる**。ただし Astro 7 でも引き続き適用されることを dist grep で実証済(glossary 1114 箇所・strategy-ref 残留 0・外部リンク rel/target・chart SVG が Astro 6 と同一)。手動 unified パイプラインへ移すと Astro 既定の GFM / smartypants / shiki 等の再実装が必要になるため据え置き、**既知債務**とする
- 検証: `astro check` 0 errors・`test:e2e` 42/42・VRT で移行敏感 24 ページがピクセル一致・`dist/rss.xml` 妥当・dev 目視サインオフ済
- 姉妹 3 リポ(edu-watch / edu-law / portfolio)も同一 advisory を抱えるが、本 ADR のスコープは edu-evidence のみ。横展開時は各リポで個別に build 検証する(edu-law は過去に build 失敗実績あり)

## 撤回 / 再検討の条件

- Sätteri / astro-compiler-rs の companion が 1.0 に到達し安定した時点で、`processor: unified()` 迂回を解消して既定プロセッサへ寄せるか再評価する
- 上流が `remarkPlugins` / `rehypePlugins` の適用を実際に打ち切った場合は、プラグインを `unified()` パイプライン引数へ移設する
