import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection } from "astro:content";
import { generateOgImage } from "../../lib/og-image";

export const getStaticPaths: GetStaticPaths = async () => {
  const strategies = await getCollection("strategies");
  return strategies.map((s) => ({
    params: { slug: s.id },
    props: {
      title: s.data.title,
      monthsGained: s.data.monthsGained,
      evidenceStrength: s.data.evidenceStrength,
      subjects: s.data.subjects,
    },
  }));
};

export const GET: APIRoute = async ({ props }) => {
  const png = await generateOgImage(props as {
    title: string;
    monthsGained: number;
    evidenceStrength: number;
    subjects: string[];
  });

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
