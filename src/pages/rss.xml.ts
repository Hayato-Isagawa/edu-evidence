import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import type { APIContext } from "astro";

export async function GET(context: APIContext) {
  const columns = await getCollection("columns");
  // 実効更新日(lastVerified があればそれ、無ければ公開日)の降順でソート
  // 更新記事が読者のフィードリーダーで再浮上するため
  const freshnessDate = (c: typeof columns[number]) => c.data.lastVerified ?? c.data.date;
  columns.sort((a, b) => freshnessDate(b).localeCompare(freshnessDate(a)));

  return rss({
    title: "EduEvidence JP — エビデンスで考える",
    description:
      "日本の小学校教員向けに、教育研究のエビデンスを『効果・信頼性・コスト・出典』で整理してお届けするコラム。",
    site: context.site?.toString() ?? "https://edu-evidence.org",
    items: columns.map((c) => ({
      title: c.data.title,
      description: c.data.summary,
      pubDate: new Date(freshnessDate(c)),
      link: `/columns/${c.id}/`,
      categories: c.data.tags,
    })),
    customData: "<language>ja</language>",
  });
}
