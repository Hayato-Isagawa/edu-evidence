/**
 * Remark plugin: {{strategy:slug}} を戦略の「タイトル(+Xヶ月)」リンクに置換
 *
 * 使用例:
 *   {{strategy:metacognition}}
 *   → [メタ認知の指導(+8ヶ月)](/strategies/metacognition)
 *
 * 目的: コラム内で戦略の効果量を直書きせず、戦略データから動的に取得する。
 * 戦略の monthsGained が更新されたら、参照している全コラムが自動的に追従する。
 */
import { visit } from "unist-util-visit";
import fs from "fs";
import path from "path";
import matter from "gray-matter";

const STRATEGIES_DIR = path.resolve("src/content/strategies");

function loadStrategyMap() {
  const map = new Map();
  if (!fs.existsSync(STRATEGIES_DIR)) return map;
  const files = fs.readdirSync(STRATEGIES_DIR).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    const slug = file.replace(/\.md$/, "");
    const raw = fs.readFileSync(path.join(STRATEGIES_DIR, file), "utf-8");
    const { data } = matter(raw);
    if (data.title && data.monthsGained !== undefined) {
      map.set(slug, {
        title: data.title,
        monthsGained: data.monthsGained,
      });
    }
  }
  return map;
}

const PATTERN = /\{\{strategy:([a-z0-9-]+)\}\}/g;

export function remarkStrategyRef() {
  const strategyMap = loadStrategyMap();

  return (tree) => {
    visit(tree, "text", (node, index, parent) => {
      if (!parent || index === null) return;
      if (parent.type === "link") return; // リンク内はスキップ

      const value = node.value;
      if (!PATTERN.test(value)) return;
      PATTERN.lastIndex = 0; // reset regex state

      const newChildren = [];
      let lastIndex = 0;
      let match;

      while ((match = PATTERN.exec(value)) !== null) {
        const [full, slug] = match;
        const strategy = strategyMap.get(slug);

        // マッチ前のテキスト
        if (match.index > lastIndex) {
          newChildren.push({
            type: "text",
            value: value.substring(lastIndex, match.index),
          });
        }

        if (!strategy) {
          // 見つからない場合はそのまま残す(警告)
          console.warn(`[remark-strategy-ref] Strategy not found: ${slug}`);
          newChildren.push({ type: "text", value: full });
        } else {
          const sign = strategy.monthsGained > 0 ? "+" : "";
          const label = `${strategy.title}(${sign}${strategy.monthsGained}ヶ月)`;
          // Markdown のリンクノードとして挿入
          newChildren.push({
            type: "link",
            url: `/strategies/${slug}`,
            children: [{ type: "text", value: label }],
          });
        }

        lastIndex = match.index + full.length;
      }

      // 残りのテキスト
      if (lastIndex < value.length) {
        newChildren.push({
          type: "text",
          value: value.substring(lastIndex),
        });
      }

      parent.children.splice(index, 1, ...newChildren);
    });
  };
}
