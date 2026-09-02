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

      // **探索するのは常にテキスト全体。** 以前は用語を見つけるたびに探索対象を
      // その後ろの尾部に狭めていたため、長い用語(先に処理される)より前に出ている
      // 短い用語が探索範囲から外れてリンクされなかった(「効果量の話。標準偏差も。」で
      // 「効果量」が落ちる。#510)。
      // 位置だけを先に集め(claims)、既にリンクにした範囲と重なる出現は飛ばす
      // (「クラスターRCT」の中の「RCT」)。長い用語を先に処理する並び順は、
      // この重なり判定と対で意味を持つ。
      const claims = [];

      for (const entry of sorted) {
        if (seen.has(entry.term)) continue;

        let idx = value.indexOf(entry.term);
        while (idx !== -1) {
          const end = idx + entry.term.length;
          const at = idx;
          if (!claims.some((c) => at < c.end && c.start < end)) break;
          idx = value.indexOf(entry.term, idx + 1);
        }
        if (idx === -1) continue;

        seen.add(entry.term);
        claims.push({ start: idx, end: idx + entry.term.length, entry });
      }

      if (claims.length === 0) return;

      claims.sort((a, b) => a.start - b.start);

      // Build new children
      const newChildren = [];
      let cursor = 0;
      for (const claim of claims) {
        if (claim.start > cursor) {
          newChildren.push({ type: "text", value: value.slice(cursor, claim.start) });
        }
        const anchor = claim.entry.term.replace(/[()（）]/g, "").replace(/\s+/g, "-");
        newChildren.push({
          type: "html",
          value: `<a class="glossary-tip" href="/guide/glossary#${encodeURIComponent(anchor)}" data-tip="${escapeAttr(claim.entry.short)}">${escapeHtml(claim.entry.term)}</a>`,
        });
        cursor = claim.end;
      }
      if (cursor < value.length) {
        newChildren.push({ type: "text", value: value.slice(cursor) });
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
