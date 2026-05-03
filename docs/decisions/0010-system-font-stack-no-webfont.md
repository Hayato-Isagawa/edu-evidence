# 0010. 本文フォントはシステムフォントスタックに統一し Web フォントを廃止する

- 状態: 採用
- 日付: 2026-05-03
- 関連 PR: 本 ADR と同一 PR で確定
- 関連 ADR: 0001(plant-motif brand)
- 姉妹サイト: edu-watch ADR 0025(同仕様のミラー)

## 背景

これまで `src/styles/global.css` 冒頭で `@fontsource-variable/noto-sans-jp` と `@fontsource-variable/jetbrains-mono` を `@import` し、`--font-sans` / `--font-mono` の最優先に Web フォント名(`"Noto Sans JP Variable"` / `"JetBrains Mono Variable"`)を置いてきた。PR #134 で完全 self-host 化(woff2 を `/_astro/` 配下に bundle)し、CSP `font-src` を `'self'` に絞った。

しかし本番閲覧では、初回ペイント時に **fallback の serif(ブラウザデフォルトの Times 系)が一瞬表示され、woff2 ロード完了後に Noto Sans JP に置換される FOUT(Flash of Unstyled Text)** が知覚される問題が残っていた。読み手は「最初は明朝で表示され、その後フォントが当たる、カクっとした切り替え」を体験する。

原因の構造:

- `font-display: swap`(fontsource v5 の既定)→ ブラウザは woff2 のロードを待たず即座に fallback で描画
- `--font-sans` の最優先が `"Noto Sans JP Variable"` → ロード完了後に置換が必ず発生
- Noto Sans JP は 124 サブセットに分割されており、ページ上で実際に使われる文字に対応するサブセットがペイント時刻には間に合わない
- `<link rel="preload" as="font">` を入れても Noto Sans JP の subset 番号は fontsource バージョンで変動し保守困難

加えて、対象読者(日本の小学校教員)の実機環境はすべて高品質な日本語ゴシックフォントを標準搭載している:

- macOS / iOS: Hiragino Kaku Gothic ProN(または Hiragino Sans)
- Windows: Yu Gothic UI / Meiryo
- Android: Noto Sans CJK JP(端末同梱)

これらは Noto Sans JP と字形・字種カバレッジともに実用上ほぼ同等であり、教育コンテンツの可読性に差は生じない。

## 検討した選択肢

### A) 既存の Web フォント運用を維持し、preload を追加する

- 利点: 既定のデザイン文法を変えずに済む
- 欠点:
  - Noto Sans JP の subset 番号は fontsource のバージョン更新で変動する → preload リンクが壊れて FOUT が再発するリスク
  - preload 自体は woff2 をペイント前に取得させるが、ロードが完了するまで結局 fallback が出る(改善はするが完全には消えない)
  - bundle に Web フォント woff2 が残る(数 MB)

### B) `font-display: optional` に変更する

- 利点: ロード完了が一定時間以内なら適用、超過時は fallback で固定 → カクつきが消える
- 欠点: 初回訪問者は永続的に fallback で見えることがあり、「サイトごとに見え方が変わる」体験になる(2 回目以降キャッシュからは適用される)。完全な解決ではない

### C) システムフォントスタックに統一し Web フォントを廃止(採用)

- 利点:
  - FOUT が **物理的に発生しない**(ロード待ちゼロ)
  - bundle に含まれる woff2(数 MB)が消え、本番 LCP がさらに改善する見込み
  - 教員端末の標準フォントは可読性において Noto Sans JP と実用差なし
  - 字形・字種カバレッジは macOS/iOS/Windows/Android のすべてで日本語表示に十分
  - CSP `font-src` をさらに絞れる(`'self'` のままで woff2 自体が無くなる)
  - 保守コストが下がる(fontsource のバージョン追従不要)
- 欠点:
  - OS ごとに微細なグリフ差が出る(Hiragino vs Yu Gothic vs Noto CJK JP)
  - ブランドフォント統一感は失われるが、本サイトはコンテンツポータルでブランドフォント依存度は低い(wordmark は `src/components/Logo.astro` の inline SVG で独立)

## 決定

`src/styles/global.css` の Web フォント `@import` を削除し、`--font-sans` / `--font-mono` をシステムフォントスタックに置換する。`@fontsource-variable/noto-sans-jp` と `@fontsource-variable/jetbrains-mono` は `package.json` から削除する。

### 新フォントスタック

```css
:root {
  --font-serif: "Hiragino Mincho ProN", "Yu Mincho", serif;
  --font-sans: system-ui, -apple-system, "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic UI", "Yu Gothic", "Meiryo", sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, Consolas, "Roboto Mono", monospace;
}
```

優先順の根拠:

- `system-ui` / `-apple-system` を最初に置くことで、各 OS の標準 UI フォントを最優先とし、明示宣言した Hiragino / Yu Gothic / Meiryo を後段の保険として残す
- macOS Safari / iOS Safari では `system-ui` が SF Pro Text を経由して日本語部分を Hiragino にレンダリングする
- Windows Chrome / Edge では `system-ui` が Segoe UI を経由して日本語部分を Yu Gothic UI にレンダリングする
- Android Chrome では `system-ui` が Roboto を経由して日本語部分を Noto Sans CJK JP にレンダリングする
- 等幅は装飾用ラベル(タグピル / バッジ / 章番号 / 日時)のみで使用しているため、システム monospace で十分

### 適用範囲

- 本サイトの全ページ(SSG された全 248 ページ + 動的 OG 画像以外のすべて)
- `src/lib/og-image.ts`(動的 OG 画像生成)は **対象外**。これは Cloudflare Pages の build 時にサーバーサイドで Satori が走る処理であり、ブラウザの FOUT とは無関係。og-image.ts の Bold weight Google Fonts 依存除去は別 ADR / 別 PR で扱う(Next Action 参照)

## アクセシビリティ

- WCAG SC 1.4.4 Resize text: rem ベースのサイズ指定は維持、200% ズーム可
- WCAG SC 1.4.8 Visual Presentation: フォント置換による行高・字幅の崩れは Hiragino / Yu Gothic / Noto CJK JP のいずれでも軽微で、既存 line-height / letter-spacing で吸収できる範囲
- 視覚障害支援(スクリーンリーダー・OS の文字サイズ設定)はシステムフォントの方がむしろ整合性が高い

## 観測

- 本番 Lighthouse mobile での LCP / FCP の改善幅
- 本番 URL を Mac Safari / Chrome / iPhone Safari / Windows Chrome 等で目視確認し、FOUT が消えていること
- 既存 a11y baseline(`e2e/a11y-known-issues.json`)に新規違反が出ないこと

## 関連参照

- PR #133 / #134(Google Fonts → fontsource self-host への前段階)
- edu-watch ADR 0025(同仕様のミラー、姉妹サイト同時適用 — memory rule 7)
- Next Action: og-image.ts の Bold weight Google Fonts fetch を別 PR で system-installed font または bundle 内 woff2 へ移行
