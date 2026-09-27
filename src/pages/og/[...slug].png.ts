import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection } from "astro:content";
import { generateOgImage, ogParamsOf, type OgParams } from "../../lib/og-image";

export const getStaticPaths: GetStaticPaths = async () => {
  const strategies = await getCollection("strategies");
  return strategies.map((s) => ({
    params: { slug: s.id },
    props: ogParamsOf(s.data),
  }));
};

export const GET: APIRoute = async ({ props }) => {
  const png = await generateOgImage(props as OgParams);

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
