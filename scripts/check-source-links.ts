/**
 * ソース MD の外部リンク到達性チェック
 *
 * src/content/**\/*.md の本文と frontmatter に含まれる外部 URL を抽出し、
 * HTTP ステータスを検査する。dist ビルド不要、md ソース直接対象。
 *
 * Rule 1.3 準拠の挙動:
 *   - 200                   → OK(非表示)
 *   - 403 / 429 / 5xx       → warning(ボット対策や一時障害、ブラウザで要確認)
 *   - 404                   → error(切れているので修正)
 *   - network error / timeout → error
 *
 * exit code:
 *   - 0 … 404 / 5xx / network error が 0 件
 *   - 1 … 壊れた URL あり
 *
 * 使い方: npx tsx scripts/check-source-links.ts
 *   環境変数 LINK_CHECK_CONCURRENCY (既定 20) で並列数を制御
 *   環境変数 LINK_CHECK_TIMEOUT_MS (既定 15000) でタイムアウトを制御
 */

import fs from "fs";
import path from "path";
import matter from "gray-matter";

const CONTENT_DIRS = [
  path.resolve("src/content/columns"),
  path.resolve("src/content/strategies"),
];

const CONCURRENCY = Number(process.env.LINK_CHECK_CONCURRENCY ?? 20);
const TIMEOUT_MS = Number(process.env.LINK_CHECK_TIMEOUT_MS ?? 15000);

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// 学術・公的機関系でボット対策 (Cloudflare / Atypon / Silverchair 等) が常時 403 を返すドメイン。
// warn に分類はするが、サマリ表示にして行単位のノイズを減らす。
// ブラウザからは通常 200 でアクセスできる前提。
const KNOWN_BOT_PROTECTED_HOSTS: readonly string[] = [
  "doi.org",
  "educationendowmentfoundation.org.uk",
  "www.sciencedirect.com",
  "journals.sagepub.com",
  "jamanetwork.com",
  "pubmed.ncbi.nlm.nih.gov",
  "www.ncbi.nlm.nih.gov",
  "www.nichd.nih.gov",
  "www.tandfonline.com",
  "www.nier.go.jp",
  "www.oecd.org",
  "www.mhlw.go.jp",
  "link.springer.com",
  "onlinelibrary.wiley.com",
  "files.eric.ed.gov",
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isKnownBotProtected(url: string): boolean {
  return KNOWN_BOT_PROTECTED_HOSTS.includes(hostOf(url));
}

// frontmatter やベタ URL を対象とする(markdown のリンクは balanced-paren で別抽出)
const BARE_URL_REGEX = /(?<![(\["'])(https?:\/\/[^\s"'<>\]]+)/g;

// `[text](url)` のカッコ内 URL を balanced-paren で取得する
// DOI など url 内に `(19)` を含むケースに対応
function extractMarkdownLinks(line: string): string[] {
  const urls: string[] = [];
  let i = 0;
  while (i < line.length) {
    const openBracket = line.indexOf("[", i);
    if (openBracket === -1) break;
    const closeBracket = line.indexOf("]", openBracket);
    if (closeBracket === -1) break;
    if (line[closeBracket + 1] !== "(") {
      i = closeBracket + 1;
      continue;
    }
    // "](" の直後から balanced で `)` まで読む
    let depth = 1;
    let j = closeBracket + 2;
    const urlStart = j;
    while (j < line.length) {
      const c = line[j];
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) break;
      } else if (c === " " || c === '"' || c === "\t") {
        // タイトル指定(スペース後)で URL 終端
        break;
      }
      j++;
    }
    const candidate = line.slice(urlStart, j);
    if (/^https?:\/\//.test(candidate)) {
      urls.push(candidate);
    }
    i = j + 1;
  }
  return urls;
}

// ベタ URL 抽出時、末尾の句読点や括弧を削る
function trimUrlTail(url: string): string {
  return url.replace(/[.,;:!?]+$/, "").replace(/\)+$/, (tail) => {
    // 開き括弧の数と閉じ括弧の数を比較、超過分だけ削る
    const open = (url.match(/\(/g) ?? []).length;
    const close = (url.match(/\)/g) ?? []).length;
    const excess = close - open;
    return excess > 0 ? tail.slice(0, tail.length - excess) : tail;
  });
}

interface Occurrence {
  file: string;
  line: number;
  url: string;
}

interface Result {
  occurrence: Occurrence;
  status: number; // 0 = network error / timeout
  error?: string;
}

// FetchOutcome は後方宣言される。型エクスポートせず内部で使う。

function listMarkdownFiles(): string[] {
  const files: string[] = [];
  for (const dir of CONTENT_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith(".md")) files.push(path.join(dir, name));
    }
  }
  return files;
}

function extractUrls(raw: string, file: string): Occurrence[] {
  const occurrences: Occurrence[] = [];
  const lines = raw.split("\n");
  const seenKey = new Set<string>(); // url + line の重複を抑制

  lines.forEach((lineText, idx) => {
    const lineNumber = idx + 1;

    const push = (url: string) => {
      const key = `${lineNumber}::${url}`;
      if (seenKey.has(key)) return;
      seenKey.add(key);
      occurrences.push({ file, line: lineNumber, url });
    };

    for (const url of extractMarkdownLinks(lineText)) {
      push(url);
    }
    for (const m of lineText.matchAll(BARE_URL_REGEX)) {
      push(trimUrlTail(m[1]));
    }
  });

  return occurrences;
}

interface FetchOutcome {
  status: number;
  error?: string;
}

const BROWSER_LIKE_HEADERS: Record<string, string> = {
  "User-Agent": USER_AGENT,
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,ja;q=0.8",
  "Accept-Encoding": "gzip, deflate, br",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
};

async function fetchOnce(url: string): Promise<FetchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // HEAD で軽量に確認
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
      signal: controller.signal,
    });

    // HEAD が 405/501(未対応)/ 404(CDN偽装)/ 401 / 403(ボット対策)/ 429 の場合
    // ブラウザ風ヘッダ + Range GET でフォールバック再試行
    if (
      res.status === 405 ||
      res.status === 501 ||
      res.status === 404 ||
      res.status === 401 ||
      res.status === 403 ||
      res.status === 429
    ) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: { ...BROWSER_LIKE_HEADERS, Range: "bytes=0-0" },
        signal: controller.signal,
      });
    }
    return { status: res.status };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 0, error: message };
  } finally {
    clearTimeout(timer);
  }
}

// 5xx / network error は一時障害の可能性が高いので 1 回リトライする
async function checkUrl(url: string): Promise<FetchOutcome> {
  const first = await fetchOnce(url);
  const shouldRetry = first.status === 0 || (first.status >= 500 && first.status < 600);
  if (!shouldRetry) return first;
  await new Promise((r) => setTimeout(r, 1500));
  return fetchOnce(url);
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await worker(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

function categorize(status: number): "ok" | "warn" | "error" {
  if (status === 0) return "error"; // network error / timeout
  if (status >= 200 && status < 400) return "ok"; // 2xx, 3xx(リダイレクト追跡後)
  if (status === 404 || status === 410) return "error"; // 確定した消滅
  // 401/403/429/5xx/その他 → 一時的・認証・ボット対策の可能性、要目視
  return "warn";
}

function rel(file: string): string {
  return path.relative(process.cwd(), file);
}

async function main() {
  const files = listMarkdownFiles();
  const allOccurrences: Occurrence[] = [];

  for (const file of files) {
    const raw = fs.readFileSync(file, "utf-8");
    // matter で frontmatter と本文を両方 raw 文字列で走査するため、そのまま使う
    matter(raw); // バリデーションのみ
    allOccurrences.push(...extractUrls(raw, file));
  }

  // URL 単位でユニーク化 → ステータスチェック
  const uniqueUrls = [...new Set(allOccurrences.map((o) => o.url))];
  console.log(`=== リンクチェック開始 ===`);
  console.log(`対象ファイル: ${files.length}`);
  console.log(`URL 出現: ${allOccurrences.length}(ユニーク ${uniqueUrls.length})`);
  console.log(`並列: ${CONCURRENCY} / timeout: ${TIMEOUT_MS}ms`);
  console.log("");

  const urlStatus = new Map<string, FetchOutcome>();
  await runWithConcurrency(uniqueUrls, CONCURRENCY, async (url) => {
    const r = await checkUrl(url);
    urlStatus.set(url, r);
  });

  const errors: Result[] = [];
  const warningsActionable: Result[] = []; // 既知ボット対策ドメイン 以外 の warn(個別列挙)
  const warningsKnown: Result[] = []; // 既知ボット対策ドメインの warn(サマリ)
  for (const occ of allOccurrences) {
    const s = urlStatus.get(occ.url)!;
    const result: Result = { occurrence: occ, ...s };
    const cat = categorize(s.status);
    if (cat === "error") {
      errors.push(result);
    } else if (cat === "warn") {
      if (isKnownBotProtected(occ.url)) warningsKnown.push(result);
      else warningsActionable.push(result);
    }
  }

  if (errors.length > 0) {
    console.log(`## ❌ 壊れているリンク(404 / 410 / ネットワークエラー)`);
    console.log("");
    for (const e of errors) {
      const detail = e.status === 0 ? `network error: ${e.error ?? "unknown"}` : `HTTP ${e.status}`;
      console.log(`- ${rel(e.occurrence.file)}:${e.occurrence.line} — ${e.occurrence.url} → ${detail}`);
    }
    console.log("");
  }

  if (warningsActionable.length > 0) {
    console.log(`## ⚠️ 新規に 401 / 403 / 429 / 5xx を返したリンク(未登録ドメイン、要目視)`);
    console.log("");
    for (const w of warningsActionable) {
      console.log(
        `- ${rel(w.occurrence.file)}:${w.occurrence.line} — ${w.occurrence.url} → HTTP ${w.status}`,
      );
    }
    console.log("");
  }

  if (warningsKnown.length > 0) {
    // ホスト別サマリ
    const byHost = new Map<string, number>();
    for (const w of warningsKnown) {
      const h = hostOf(w.occurrence.url);
      byHost.set(h, (byHost.get(h) ?? 0) + 1);
    }
    const hosts = [...byHost.entries()].sort((a, b) => b[1] - a[1]);
    console.log(`## ℹ️ 既知のボット対策ドメイン(ブラウザでは通常 200、サマリ表示)`);
    console.log("");
    for (const [h, n] of hosts) {
      console.log(`- ${h}: ${n} 件`);
    }
    console.log("");
  }

  const warnTotal = warningsActionable.length + warningsKnown.length;
  const okCount = allOccurrences.length - errors.length - warnTotal;
  console.log(`## 集計`);
  console.log(`- ✓ 2xx / 3xx: ${okCount}`);
  console.log(`- ⚠️ 要目視 (未登録ドメイン): ${warningsActionable.length}`);
  console.log(`- ℹ️ 既知ボット対策ドメイン: ${warningsKnown.length}`);
  console.log(`- ❌ 404 / 410 / network error: ${errors.length}`);

  if (errors.length > 0) {
    console.error(`\n壊れたリンクが ${errors.length} 件あります。修正してください。`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
