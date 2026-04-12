import { glossary } from "../data/glossary";

const sorted = [...glossary].sort((a, b) => b.term.length - a.term.length);

/**
 * テキスト中の用語集用語の初出をツールチップリンクに変換する。
 * Astro テンプレートの set:html で使用。
 */
export function annotateGlossaryTerms(text: string): string {
  const seen = new Set<string>();
  let result = text;

  for (const entry of sorted) {
    if (seen.has(entry.term)) continue;
    const idx = result.indexOf(entry.term);
    if (idx === -1) continue;

    seen.add(entry.term);
    const anchor = entry.term.replace(/[()（）]/g, "").replace(/\s+/g, "-");
    const escapedShort = entry.short
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
    const link = `<a class="glossary-tip" href="/guide/glossary#${encodeURIComponent(anchor)}" data-tip="${escapedShort}">${entry.term}</a>`;
    result = result.substring(0, idx) + link + result.substring(idx + entry.term.length);
  }

  return result;
}
