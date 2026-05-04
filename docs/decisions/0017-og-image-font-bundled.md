# 0017. OG 画像生成用フォントをリポジトリに同梱する

- 状態: 採用
- 日付: 2026-05-04
- 関連 PR: 本 ADR と同一 PR で確定
- 関連 ADR: 0010(system font stack — クライアント配信フォント)
- 姉妹サイト ADR: edu-watch ADR 0031(同仕様のミラー、加えて edu-watch では og-image を新規実装)

## 背景

`src/lib/og-image.ts` は build 時に Satori で動的 OG 画像(各戦略ページ用)を生成する処理。日本語表示用の Noto Sans JP Bold フォントを **build 時に Google Fonts CSS API → woff2** で取得し、フォールバックとして cdn.jsdelivr.net の OTF を取得していた。取得した binary は `scripts/fonts/noto-sans-jp-bold.bin` にローカルキャッシュされていたが、`.gitignore` で除外されていたため、**Cloudflare Pages の build 環境などでは毎回ネットワーク取得が必要** だった。

ADR 0010 で本サイトは system-font-stack を採用し、クライアント配信から `@fontsource-variable/noto-sans-jp` を完全に排除した(本文 / UI フォントの FOUT 解消)。一方 og-image.ts は build スクリプト側で動作し、サーバーサイド(Satori)で日本語をレンダリングするため、引き続き woff2 / OTF が必要 — ただし **bundle には含まれない**(scripts/fonts/ は build 中だけ参照される)。

問題点:

- Google Fonts / jsDelivr への build-time 依存により、ネットワーク不安定時や CORS / 証明書問題で **build が失敗** する可能性
- フォント供給元の URL 変更や CSS スキーマ変更で再書き直しが発生しうる
- `cdn.jsdelivr.net/gh/nicehash/Noto-Sans-JP@main/fonts/NotoSansJP-Bold.otf` は第三者リポジトリ依存で永続性が保証されない
- フォントキャッシュ(scripts/fonts/noto-sans-jp-bold.bin、約 5.1 MB)は git 管理外で、ローカルにのみ存在する状態だった

## 検討した選択肢

### A) フォント binary をリポジトリに同梱(採用)

- 利点:
  - **build-time 依存ゼロ**(ネットワーク不要、ビルドが完全に再現可能)
  - 第三者リポジトリ / CDN の URL 変更に影響されない
  - キャッシュロジック削除で og-image.ts が大幅に簡素化(60 行以上 → 約 30 行)
  - `scripts/fonts/` は **build スクリプトのみ参照、bundle には含まれない**(クライアント配信に影響なし、ADR 0010 の system-font-stack 方針と矛盾しない)
- 欠点:
  - リポジトリに 約 5.1 MB の binary が増える(初回 clone のサイズ増)
  - フォントの差し替え(Bold → Black など)時に binary 入れ替えが必要

### B) `@fontsource/noto-sans-jp/900.css` を npm install

- 利点: npm package のバージョン追跡可
- 欠点:
  - ADR 0010 で `@fontsource-variable/noto-sans-jp` を完全に削除したため、再導入は ADR 0010 の精神と矛盾しないか説明が必要(og-image 限定であれば OK だが整理コストあり)
  - node_modules 経由で参照する path がブランチ / 環境で変動しうる
  - ファイル単体で git 管理する A 案と比べて、間接層が増える

### C) Satori の system-font 利用

- 利点: 究極的にシンプル
- 欠点: **技術的に不可** — Satori は Node.js 環境で system-font を直接読めない(woff2 / OTF / TTF の binary を明示的に渡す API)

## 決定

**選択肢 A** を採用。`scripts/fonts/noto-sans-jp-bold.bin` を `.gitignore` から除外して git 管理対象に含める。og-image.ts のフェッチ処理を削除して、disk からの読み込みのみに簡素化する。

### 変更内容

```diff
 # OG 画像生成のフォントは scripts/fonts/noto-sans-jp-bold.bin をリポジトリに同梱
 # (ADR 0017、Google Fonts / jsDelivr への build-time 依存を排除)。
-scripts/fonts/*.bin
 scripts/fonts/*.woff2
 scripts/fonts/*.otf
 scripts/fonts/*.ttf
+!scripts/fonts/noto-sans-jp-bold.bin
```

```diff
 # src/lib/og-image.ts(該当部分)
-const FONT_CSS_URL = "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700;900&display=swap";
-const FALLBACK_FONT_URL = "https://cdn.jsdelivr.net/gh/nicehash/Noto-Sans-JP@main/fonts/NotoSansJP-Bold.otf";
-async function fetchFromGoogleFonts(): Promise<ArrayBuffer> { ... }
-async function loadFontFromDisk(): Promise<ArrayBuffer | null> { ... }
-async function writeFontToDisk(data: ArrayBuffer): Promise<void> { ... }
-async function loadNotoSansJpFont(): Promise<ArrayBuffer> {
-  // Google Fonts → fallback → disk のフォールバックチェーン
-}
+async function loadNotoSansJpFont(): Promise<ArrayBuffer> {
+  // disk のみ。同梱前提で fallback なし。
+}
```

### フォント binary の素性

`scripts/fonts/noto-sans-jp-bold.bin` は Google Fonts CSS API 経由で取得した Noto Sans JP **Bold (700)** の woff2 そのもの(SIL Open Font License 1.1)。リポジトリに同梱する binary 1 ファイルのみ、それ以外の woff2 / OTF / TTF / 派生 binary は引き続き `.gitignore` で除外する。

### スコープ外

- 本 ADR は build-time の OG 画像生成専用。クライアント配信フォントは ADR 0010 の system-font-stack(Web フォントなし)を維持
- フォントウェイト変更(700 → 900 など)、サブセット最適化は将来の別 ADR で検討
- edu-watch の og-image 新規実装は同 PR ではなく姉妹サイト側 PR(ADR 0031)で

## ライセンス

- フォント: SIL Open Font License 1.1(Noto Sans JP)
- リポジトリ同梱 OK(再配布可、改変は OFL 規定に準拠)

## 観測

- build ログで `scripts/fonts/noto-sans-jp-bold.bin` が読み込まれること
- ネットワーク切断状態でも `npm run build` が成功すること
- `dist/og/*.png` の各戦略 OG 画像が従来と同等の見た目で生成されること

## 関連参照

- ADR 0010(system font stack、クライアント配信フォントの方針)
- edu-watch ADR 0031(同方針 + og-image 新規実装のミラー)
- [SIL Open Font License 1.1](https://scripts.sil.org/OFL)
- [Google Fonts — Noto Sans JP](https://fonts.google.com/noto/specimen/Noto+Sans+JP)
