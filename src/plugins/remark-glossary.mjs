/**
 * Remark plugin: 本文中の用語集に載っている専門用語の初出を
 * ツールチップ付きリンクに変換する。
 *
 * 変換先: <a class="glossary-tip" href="/guide/glossary#TERM" data-tip="SHORT_DEF">TERM</a>
 */
import { visit } from "unist-util-visit";
import { glossary } from "../data/glossary.ts";

export function remarkGlossary() {
  // 長い用語から先にマッチさせる(「コーエンのd」が「d」に先にマッチしないよう)
  const sorted = [...glossary].sort((a, b) => b.term.length - a.term.length);

  return (tree) => {
    const seen = new Set();

    visit(tree, "text", (node, index, parent) => {
      if (!parent || index === null) return;
      // リンク内・見出し内はスキップ
      if (parent.type === "link" || parent.type === "heading") return;

      const { value } = node;
      let matched = false;
      let result = value;
      const replacements = [];

      for (const entry of sorted) {
        if (seen.has(entry.term)) continue;
        const idx = result.indexOf(entry.term);
        if (idx === -1) continue;

        seen.add(entry.term);
        matched = true;

        // split around the first match
        const before = result.slice(0, idx);
        const after = result.slice(idx + entry.term.length);
        replacements.push({ before, term: entry });
        result = after;
      }

      if (!matched) return;

      // Build new children
      const newChildren = [];
      for (const r of replacements) {
        if (r.before) {
          newChildren.push({ type: "text", value: r.before });
        }
        const anchor = r.term.term.replace(/[()（）]/g, "").replace(/\s+/g, "-");
        newChildren.push({
          type: "html",
          value: `<a class="glossary-tip" href="/guide/glossary#${encodeURIComponent(anchor)}" data-tip="${escapeAttr(r.term.short)}">${escapeHtml(r.term.term)}</a>`,
        });
      }
      if (result) {
        newChildren.push({ type: "text", value: result });
      }

      parent.children.splice(index, 1, ...newChildren);
    });
  };
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
