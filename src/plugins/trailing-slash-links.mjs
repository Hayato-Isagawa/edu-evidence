/**
 * Astro integration: ビルド後の HTML で、内部リンクの href をスラッシュ付きにそろえる
 *
 * 使用例:
 *   <a href="/strategies/metacognition">
 *   → <a href="/strategies/metacognition/">
 *
 * 目的: ページは `/strategies/x/` で配信され canonical もスラッシュ付きだが、テンプレート・
 * 本文 md・remark プラグインはスラッシュ無しで書いている。スラッシュ無しは Cloudflare が
 * 307 で転送するので、Google にはリダイレクトを挟んだ URL が届く(ADR 0043)。
 *
 * 書き換えるのは `dist/<path>/index.html` が実在するパスだけ。ファイル(`/rss.xml` など)と
 * 存在しないパスは触らない — リンク切れは `check:links:internal` に拾わせる。
 * JSON 文字列の中の URL(JSON-LD)は対象外で、ソース側でスラッシュ付きにしている。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// 空白の直後に限るのは `data-href` / `xlink:href` を拾わないため。`//` 始まりは外部。
const HREF = /(\shref=")(\/(?!\/)[^"]*)"/g;

export function addTrailingSlashToHrefs(html, dirPages) {
  return html.replace(HREF, (whole, head, value) => {
    const cut = value.search(/[?#]/);
    const pathPart = cut === -1 ? value : value.slice(0, cut);
    if (pathPart.endsWith("/")) return whole;
    let decoded;
    try {
      decoded = decodeURIComponent(pathPart);
    } catch {
      return whole;
    }
    if (!dirPages.has(decoded)) return whole;
    const rest = cut === -1 ? "" : value.slice(cut);
    return `${head}${pathPart}/${rest}"`;
  });
}

function listHtmlFiles(root) {
  return fs
    .readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".html"))
    .map((e) => path.join(e.parentPath, e.name));
}

// existsSync で判定しないのは、macOS では大文字小文字と NFC/NFD を区別せず、
// Linux の CI と結果が分かれうるため。dist の実ファイル名から完全一致の集合を作る。
function collectDirPages(root, files) {
  const pages = new Set();
  for (const file of files) {
    if (path.basename(file) !== "index.html") continue;
    const rel = path.relative(root, path.dirname(file));
    if (rel === "") continue;
    pages.add("/" + rel.split(path.sep).join("/"));
  }
  return pages;
}

export function trailingSlashLinks() {
  return {
    name: "trailing-slash-links",
    hooks: {
      "astro:build:done": ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const files = listHtmlFiles(root);
        const dirPages = collectDirPages(root, files);
        let changed = 0;
        for (const file of files) {
          const html = fs.readFileSync(file, "utf-8");
          const next = addTrailingSlashToHrefs(html, dirPages);
          if (next === html) continue;
          fs.writeFileSync(file, next);
          changed++;
        }
        logger.info(
          `${changed} / ${files.length} 件の HTML で内部リンクをスラッシュ付きにした`
        );
      },
    },
  };
}
