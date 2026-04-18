import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import type { APIContext } from "astro";

export async function GET(context: APIContext) {
  const columns = await getCollection("columns");
  columns.sort((a, b) => b.data.date.localeCompare(a.data.date));

  return rss({
    title: "EduEvidence JP — エビデンスで考える",
    description:
      "日本の小学校教員向けに、教育研究のエビデンスを『効果・信頼性・コスト・出典』で整理してお届けするコラム。",
    site: context.site?.toString() ?? "https://edu-evidence.org",
    items: columns.map((c) => ({
      title: c.data.title,
      description: c.data.summary,
      pubDate: new Date(c.data.date),
      link: `/columns/${c.id}/`,
      categories: c.data.tags,
    })),
    customData: "<language>ja</language>",
  });
}
