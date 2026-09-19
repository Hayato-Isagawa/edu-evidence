import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

/**
 * JSON-LD の形を固定する(ADR 0039)。Organization に姉妹サイトとの関係を書かない、を
 * 名前の禁止でなく「@type の集合・型ごとのキー集合・URL 値のホスト」で見る。
 * 4 ページ(戦略詳細 / コラム / トップ / FAQ)はブラウザで、全ページは dist の走査で見る。
 */

const siteHost = "edu-evidence.org";
const siteName = "EduEvidence JP";
// Organization の sameAs は自組織の SNS だけ(ADR 0039)。家族ドメインの不在だけ見ると
// `x.com/edu_law_jp` のように SNS 側で姉妹を指す形が通るので、値ごと固定する
const organizationSameAs = ["https://x.com/edu_evidence_jp"];
// 代表 slug は isBasedOn(sourceUrl)を持つ戦略で選ぶ。sourceUrl は optional なので、
// この 1 本から外すコンテンツ変更は下の isBasedOn 検査を赤にする
const strategyPath = "/strategies/metacognition/";
const columnPath = "/columns/class-size-cost-effectiveness/";

// @type が Organization か、Organization で終わるサブタイプか。配列 ["Organization"] も見る。
// 見ていない @type は下の knownTypes が先に赤にするので、ここは防御の二重化
function isOrganizationType(type: unknown) {
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => typeof t === "string" && t.endsWith("Organization"));
}

// @type が Organization(サブタイプ・配列含む)のオブジェクトを、JSON-LD の入れ子
// (Article.publisher など)まで含めて集める
function collectOrganizations(
  value: unknown,
  found: Record<string, unknown>[] = []
) {
  if (Array.isArray(value)) {
    for (const v of value) collectOrganizations(v, found);
  } else if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (isOrganizationType(obj["@type"])) found.push(obj);
    for (const v of Object.values(obj)) collectOrganizations(v, found);
  }
  return found;
}

// JSON-LD に現れる全ノードの @type を集める(入れ子含む)
function collectTypes(value: unknown, found: unknown[] = []) {
  if (Array.isArray(value)) {
    for (const v of value) collectTypes(v, found);
  } else if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("@type" in obj) found.push(obj["@type"]);
    for (const v of Object.values(obj)) collectTypes(v, found);
  }
  return found;
}

// サイトが JSON-LD に書く @type の全部(dist の全 HTML を走査して決めた)。schema.org の
// Organization の下位クラスは 187 あり名前が Organization で終わるのは 8 つだけ(Corporation /
// NGO / OnlineBusiness 等は終わらない)なので、Organization を拾う側の網では姉妹ノードを別の型で
// 書く形が抜ける。閉じた集合で見ることで、見ていない型は何であれ赤にする
const knownTypes = [
  "Answer",
  "Article",
  "BreadcrumbList",
  "CreativeWork",
  "FAQPage",
  "ListItem",
  "Organization",
  "Person",
  "Question",
  "WebSite",
];

// 型ごとに許すキーの集合(dist の全 HTML を走査して決めた)。値がオブジェクトのノードは全部
// @type を持ち、この表のどれかに当たる。集合の外のキー(isPartOf / affiliation /
// sourceOrganization 等の関係語)は何であれ赤にし、@type の無いノード・@id だけの参照も
// 赤にする(edu-law / edu-watch と同型)
const nodeShapes: Record<string, string[]> = {
  Answer: ["@type", "text"],
  Article: [
    "@context",
    "@type",
    "author",
    "dateModified",
    "datePublished",
    "description",
    "headline",
    "image",
    "inLanguage",
    "isBasedOn",
    "keywords",
    "mainEntityOfPage",
    "publisher",
    "url",
  ],
  BreadcrumbList: ["@context", "@type", "itemListElement"],
  CreativeWork: ["@type", "name", "url"],
  FAQPage: ["@context", "@type", "mainEntity"],
  ListItem: ["@type", "item", "name", "position"],
  Organization: [
    "@context",
    "@type",
    "alternateName",
    "logo",
    "name",
    "sameAs",
    "url",
  ],
  Person: ["@type", "name", "sameAs", "url"],
  Question: ["@type", "acceptedAnswer", "name"],
  WebSite: ["@context", "@type", "description", "inLanguage", "name", "url"],
};

// `host` はポート込み(`law.edu-evidence.org:8443` は終端一致しない。zod の .url() はポートを
// 通す)なので、URL を受けて `hostname` で見る
function isFamilyHost(url: URL) {
  const host = url.hostname;
  return host === siteHost || host.endsWith(`.${siteHost}`);
}

// http(s) スキームか `//` で始まる文字列を URL として構文解析する(前方一致 /^https?:\/\// だと
// `//host` や大文字スキーム・先頭空白が抜ける。`https:host` / `https:/host` / `https:\\host` も
// WHATWG はホストに解釈する)。URL でなければ null
function parseUrlValue(value: string) {
  const trimmed = value.trim();
  if (!/^(?:https?:|\/\/)/i.test(trimmed)) return null;
  const candidate = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
  return URL.canParse(candidate) ? new URL(candidate) : undefined;
}

// JSON-LD の全ノードを形で検査する。URL 値(sameAs と @context 以外)は自サイトを指すこと —
// 姉妹サイトを WebSite ノードや文字列値で書く形を止める。例外は CreativeWork.url(isBasedOn の
// 一次出典。外部ドメインであることが正で、家族ドメインは禁止)。`label` は失敗メッセージの
// 先頭に付ける呼び出し元の名前(dist 走査ではファイル名)。`where` は JSON 内の位置で、
// @context の位置検査に使うので label と混ぜない
function checkNodeShapes(value: unknown, where = "$", label = "") {
  if (Array.isArray(value)) {
    value.forEach((v, i) => checkNodeShapes(v, `${where}[${i}]`, label));
    return;
  }
  if (!value || typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  const type = obj["@type"];
  const at = `${label}${where}`;
  expect(typeof type, `${at}: @type の無いノード`).toBe("string");
  const shape = nodeShapes[type as string];
  expect(
    shape,
    `${at}: 形を決めていない @type ${JSON.stringify(type)}`
  ).toBeTruthy();
  for (const [key, v] of Object.entries(obj)) {
    expect(shape, `${at}.${key}: ${type} に許していないキー`).toContain(key);
    if (key === "@context") {
      // @context をオブジェクトにすると型名やキーを別名化できる。文字列 1 形に固定し、
      // トップレベルのブロックにしか置かない
      expect(v, `${at}.@context`).toBe("https://schema.org");
      expect(where, `${at}: @context は入れ子のノードに置かない`).toMatch(
        /^\$\[\d+\]$/
      );
      continue;
    }
    if (key === "sameAs") {
      // sameAs は http(s) の URL 文字列の配列。Organization の値は呼び出し側が固定する。
      // Person(著者)のファミリードメインは許す — 同一人物のページなので定義どおり(edu-watch ADR 0071)
      expect(Array.isArray(v), `${at}.sameAs は配列`).toBe(true);
      for (const u of v as unknown[]) {
        expect(typeof u, `${at}.sameAs の要素は文字列`).toBe("string");
        // mailto: / javascript: / data: も URL.canParse は通すので、スキームを http(s) に限る
        expect(
          /^https?:\/\//i.test((u as string).trim()) &&
            URL.canParse((u as string).trim()),
          `${at}.sameAs が http(s) の URL でない: ${u}`
        ).toBe(true);
      }
      continue;
    }
    if (Array.isArray(v)) {
      // サイトが文字列の配列で書くのは sameAs だけ。url / logo を配列にすると要素のホストを
      // 見ないまま通るので、他のキーの配列はオブジェクトの並び(itemListElement など。再帰で
      // 形を見る)に限る
      for (const [i, item] of v.entries()) {
        expect(
          item !== null && typeof item === "object" && !Array.isArray(item),
          `${at}.${key}[${i}]: sameAs 以外の配列はオブジェクトの並びに限る`
        ).toBe(true);
      }
    }
    if (typeof v === "string") {
      const url = parseUrlValue(v);
      if (type === "CreativeWork" && key === "url") {
        // 一次出典は http(s) スキームの URL に限る(zod の .url() は mailto: も通す)。
        // parseUrlValue は `//host` も URL に読むので、スキームは sameAs と同じ字面で別に見る
        expect(
          /^https?:\/\//i.test(v.trim()) && url,
          `${at}.${key} の一次出典が http(s) でない: ${v}`
        ).toBeTruthy();
      }
      if (url === undefined) {
        expect(false, `${at}.${key} が URL として読めない: ${v}`).toBe(true);
      } else if (url !== null) {
        if (type === "CreativeWork" && key === "url") {
          expect(
            isFamilyHost(url),
            `${at}.${key} の一次出典が家族ドメインを指している: ${v}`
          ).toBe(false);
        } else {
          expect(url.host, `${at}.${key} が自サイトを指していない: ${v}`).toBe(
            siteHost
          );
        }
      }
    }
    checkNodeShapes(v, `${where}.${key}`, label);
  }
}

// ページ(または 1 HTML)の JSON-LD ブロック全部に共通の検査を当てる。トップレベルの列は
// 完全一致で見る(追加ブロックを止める)
function checkPage(scripts: unknown[], topLevelTypes: string[], where = "") {
  for (const type of collectTypes(scripts)) {
    expect(
      knownTypes,
      `${where}JSON-LD に見ていない @type: ${JSON.stringify(type)}`
    ).toContain(type);
  }
  checkNodeShapes(scripts, "$", where);
  expect(
    scripts.map((s) => (s as Record<string, unknown>)?.["@type"]),
    `${where}トップレベルの JSON-LD の列`
  ).toEqual(topLevelTypes);
  // Organization は Layout が全ページに載せる。姉妹サイトとの関係は書かない(ADR 0039)。
  // トップレベルの 1 本目だけ見ると Article.publisher に書いた関係が素通りするので、
  // ブロックを全部・入れ子も含めて集める
  const organizations = collectOrganizations(scripts);
  expect(organizations.length, `${where}Organization が無い`).toBeGreaterThan(
    0
  );
  for (const organization of organizations) {
    // 許すキーだけで書いた姉妹組織のノードを publisher 以外のスロットに置く形は、キー検査を
    // 通る。値で見る — 集めた Organization はすべて自サイトを指し、sameAs は自組織の SNS だけ
    expect(
      new URL(String(organization.url)).host,
      `${where}Organization の url が自サイトでない: ${organization.url}`
    ).toBe(siteHost);
    expect(organization.name, `${where}Organization の name`).toBe(siteName);
    expect(organization.sameAs, `${where}Organization の sameAs`).toEqual(
      organizationSameAs
    );
  }
  const topLevel = scripts.filter((s) =>
    isOrganizationType((s as Record<string, unknown>)?.["@type"])
  );
  expect(topLevel, `${where}トップレベルの Organization`).toHaveLength(1);
  expect(Object.keys(topLevel[0] as object).sort()).toEqual(
    nodeShapes.Organization
  );
}

async function readJsonLd(page: import("@playwright/test").Page) {
  return page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((els) =>
      els.map((el) => JSON.parse(el.textContent ?? "null"))
    );
}

function checkArticle(
  article: Record<string, unknown>,
  title: string,
  pathname: string
) {
  // headline は <title> からサイト名を落としたもの(h1 は改行や短縮で別の文字列になりうる)
  expect(title).toMatch(/ — EduEvidence JP$/);
  expect(article.headline).toBe(title.replace(/ — EduEvidence JP$/, ""));
  expect(String(article.description).length).toBeGreaterThan(0);
  expect((article.author as Record<string, unknown>)["@type"]).toBe("Person");
  expect((article.publisher as Record<string, unknown>).name).toBe(siteName);
  // Article.url は末尾スラッシュ無しで出ている(canonical は有り)。この spec は形だけ見るので
  // 現状の値に合わせる
  expect(new URL(String(article.url)).pathname).toBe(
    pathname.replace(/\/$/, "")
  );
  expect(article.mainEntityOfPage).toBe(article.url);
}

test("戦略詳細の JSON-LD の形と一次出典(isBasedOn)", async ({ page }) => {
  await page.goto(strategyPath);
  const scripts = await readJsonLd(page);
  checkPage(scripts, ["WebSite", "Organization", "Article", "BreadcrumbList"]);
  const article = scripts.find((s) => s?.["@type"] === "Article");
  expect(article, "Article の JSON-LD が無い").toBeTruthy();
  checkArticle(article, await page.title(), strategyPath);
  // 戦略は sourceUrl を isBasedOn(単一の CreativeWork)で出す。外部の一次出典を指す
  expect(article.isBasedOn?.["@type"]).toBe("CreativeWork");
  const source = new URL(String(article.isBasedOn.url));
  expect(source.protocol).toBe("https:");
  expect(isFamilyHost(source)).toBe(false);
});

test("コラムの JSON-LD の形(isBasedOn / image を持たない)", async ({
  page,
}) => {
  await page.goto(columnPath);
  const scripts = await readJsonLd(page);
  checkPage(scripts, ["WebSite", "Organization", "Article", "BreadcrumbList"]);
  const article = scripts.find((s) => s?.["@type"] === "Article");
  expect(article, "Article の JSON-LD が無い").toBeTruthy();
  checkArticle(article, await page.title(), columnPath);
  expect(article).not.toHaveProperty("isBasedOn");
  expect(article).not.toHaveProperty("image");
});

test("トップの JSON-LD は WebSite と Organization の 2 本だけ", async ({
  page,
}) => {
  await page.goto("/");
  checkPage(await readJsonLd(page), ["WebSite", "Organization"]);
});

// FAQPage の内容(表示している Q&A との一致)は faq.spec.ts。ここは形だけ見る
test("FAQ の JSON-LD の形(FAQPage / Question / Answer)", async ({ page }) => {
  await page.goto("/faq/");
  checkPage(await readJsonLd(page), ["WebSite", "Organization", "FAQPage"]);
});

// Layout の pageJsonLd はどのページからでも渡せるので、上の 4 ページでは他のテンプレートが
// 足したブロックが素通りする。dist の全 HTML を fs で走査して同じ検査を当てる(2026-09-19 時点で
// 281 ページ・約 6 秒。律速は expect の呼び出し数)。トップレベルの列はページ種別で 3 通りに限る
const distRoot = path.resolve(process.cwd(), "dist");
const allowedSequences = [
  ["WebSite", "Organization"],
  ["WebSite", "Organization", "Article", "BreadcrumbList"],
  ["WebSite", "Organization", "FAQPage"],
];

function listHtml(dir: string, found: string[] = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) listHtml(p, found);
    else if (entry.name.endsWith(".html")) found.push(p);
  }
  return found;
}

test("dist の全ページの JSON-LD が同じ形", () => {
  const files = listHtml(distRoot).sort();
  expect(files.length, "dist に HTML が無い").toBeGreaterThan(200);
  const blockRe = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  for (const file of files) {
    const where = `${path.relative(distRoot, file)}: `;
    const html = fs.readFileSync(file, "utf8");
    const scripts = [...html.matchAll(blockRe)].map((m) => JSON.parse(m[1]));
    const sequence = scripts.map(
      (s) => (s as Record<string, unknown>)?.["@type"]
    );
    const matched = allowedSequences.find(
      (seq) => JSON.stringify(seq) === JSON.stringify(sequence)
    );
    expect(
      matched,
      `${where}トップレベルの列 ${sequence.join(",")}`
    ).toBeTruthy();
    checkPage(scripts, matched as string[], where);
  }
});
