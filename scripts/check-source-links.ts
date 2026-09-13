/**
 * ソース MD の外部リンク到達性チェック
 *
 * src/content/**\/*.md の本文と frontmatter に含まれる外部 URL を抽出し、
 * HTTP ステータスを検査する。dist ビルド不要、md ソース直接対象。
 *
 * Rule 1.3 準拠の挙動:
 *   - 200                   → OK(非表示)
 *   - 403 / 429 / 5xx       → warning(ボット対策や一時障害、ブラウザで要確認)
 *   - 404 / 410             → error(切れているので修正)
 *   - network error / timeout → unreachable(報告のみ・失敗にしない)
 *
 * **network error を失敗にしない理由**: 一過性の到達不能を「確定した消滅」と同じ扱いにすると、
 * 検査は非決定的になり、赤が意味を持たなくなる。2026-09-08 のある時点では、同じツリーで
 * 3 回走らせて exit 1 / 0 / 1 と割れ、落ちたのは毎回 `eric.ed.gov` の別パスだった
 * (404 / 410 は 0 件)。**これは 1 台・1 時刻のスナップショットで、回線が落ち着いていれば
 * 3 回とも exit 0 になる**(PR 前レビューが別時刻に実測)。再現しないことは、この判定が
 * 要らない証拠にはならない。到達不能そのものの追跡は週次の `link-check.yml`(lychee)が担当する。
 *
 * **既知ボット対策ドメインの 403 は Wayback で補助判定する。** EEF のように生存ページにも
 * 撤退ページにも一律 403 を返すホストでは、ページが消えても「既知ボット対策ドメイン: N 件」に
 * 数えられるだけで誰も気づけない(2026-09-08、404 の EEF ページを出典に掲げ続けていた)。
 * そこで known の warn について Wayback CDX API から「200 / 404 / 410 に絞った最新の記録」を引き(それ以外の status は判定に使わない)、
 * 404 / 410 が記録されていれば撤退とみなして失敗にする(`archivedGone`)。
 *   - CDX が答えない(503 / 接続断 / タイムアウト / JSON でない)→ 失敗にしない(fail-open)。
 *     照会できなかった件数だけを出す。手元専用の検査なので、IA の障害で `check:all` が
 *     止まると人がこの検査を切る方向に倒れる。答えなかった分の埋め方は
 *     docs/CONTENT_GUIDELINES.md §7
 *   - 記録なし(`[]`)は「判別できない」であって障害ではない。known サマリに残す
 *   - 答えた結果は `.cache/wayback-cdx.json`(gitignore)に保存し、30 日は再照会しない。
 *     CDX は 1 件 7〜28 秒かかる(2026-09-13 実測)ので、初回は非 doi の既知 70 URL で約 7.5 分、
 *     以後は新規 URL 分だけになる
 *   - doi.org は照会しない。DOI 自体の消失は doi.org が 404 を返すので既に error になり、
 *     CDX に doi.org の URL で記録されるのは 302 だけで判別に使えない
 *   - 3xx は filter で除くので、「過去に 404 → その後 301 で移設」の URL は古い 404 で
 *     失敗になりうる(偽陽性側に倒している)。逃がしは §7
 *
 * exit code:
 *   - 0 … 404 / 410 が 0 件、かつ Wayback に撤退の記録がある known リンクが 0 件
 *          (到達不能・照会できずがあっても 0)
 *   - 1 … 404 / 410 あり、または Wayback に撤退の記録あり
 *
 * 使い方: npx tsx scripts/check-source-links.ts
 *   環境変数 LINK_CHECK_CONCURRENCY (既定 20) で並列数を制御
 *   環境変数 LINK_CHECK_TIMEOUT_MS (既定 15000) でタイムアウトを制御
 *   環境変数 LINK_CHECK_CDX=0 で Wayback 照会を無効化(既定は有効)
 *   環境変数 LINK_CHECK_CDX_ENDPOINT で CDX のエンドポイントを差し替え(テスト用)
 *   環境変数 LINK_CHECK_CDX_TIMEOUT_MS (既定 60000) で CDX のタイムアウトを制御
 *   環境変数 LINK_CHECK_CDX_CACHE (既定 .cache/wayback-cdx.json) でキャッシュの置き場を制御
 *   環境変数 LINK_CHECK_KNOWN_HOSTS_EXTRA で known ホストを追加(カンマ区切り。テスト用)
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

// Wayback CDX の補助判定(ヘッダコメント参照)
const CDX_ENABLED = process.env.LINK_CHECK_CDX !== "0";
const CDX_ENDPOINT =
  process.env.LINK_CHECK_CDX_ENDPOINT ??
  "https://web.archive.org/cdx/search/cdx";
// 200 応答でも 6.7〜27.6 秒かかる(11 回中 6 回が 15 秒超・2026-09-13)。
// 本体の TIMEOUT_MS を流用すると成功応答の半分を abort して「照会できず」に数える。
const CDX_TIMEOUT_MS = Number(process.env.LINK_CHECK_CDX_TIMEOUT_MS ?? 60000);
// IA へのレート配慮。本体の 20 を流用しない。
const CDX_CONCURRENCY = 3;
// 連続してこの件数が答えなかったら残りを打ち切る(ブレーカー)
const CDX_BREAKER_AFTER = 5;
const CDX_CACHE_PATH = path.resolve(
  process.env.LINK_CHECK_CDX_CACHE ?? ".cache/wayback-cdx.json"
);
const CDX_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// DOI 自体の消失は doi.org が 404 を返すので本体で捕まる。CDX に doi.org の URL で
// 記録されるのはリゾルバの 302 だけで、filter で落ちて「記録なし」にしかならない。
const CDX_SKIP_HOSTS: readonly string[] = ["doi.org"];

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
  "gpseducation.oecd.org",
  "www.mhlw.go.jp",
  "link.springer.com",
  "onlinelibrary.wiley.com",
  "files.eric.ed.gov",
  "www.pnas.org",
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

// テストがローカルの stub(127.0.0.1)を known ホストとして通すための口。
// 実ホスト名を /etc/hosts 無しでローカルに向ける手段が Node 標準には無い。
const EXTRA_KNOWN_HOSTS = (process.env.LINK_CHECK_KNOWN_HOSTS_EXTRA ?? "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

function isKnownBotProtected(url: string): boolean {
  const host = hostOf(url);
  return (
    KNOWN_BOT_PROTECTED_HOSTS.includes(host) || EXTRA_KNOWN_HOSTS.includes(host)
  );
}

// frontmatter やベタ URL を対象とする(markdown のリンクは balanced-paren で別抽出)
// 直前が `/` の `https?://` は別の URL の内側(Wayback の `…/web/<ts>/https://…` 形)なので拾わない。
// 外側の URL は Markdown リンクとして別途抽出される。
const BARE_URL_REGEX = /(?<![(["'/])(https?:\/\/[^\s"'<>\]]+)/g;

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
    // `err.message` は到達不能なら常に "fetch failed" で、原因が読めない。
    // **`cause.code` を残す** — `ENOTFOUND`(名前解決の失敗 = ドメインの打ち間違い・失効)は
    // 恒久的な消滅で、タイムアウトのような一過性とは性質が違う。失敗にはしないが、
    // 報告で区別が付かなければ目視でも拾えない。
    const message = err instanceof Error ? err.message : String(err);
    const code =
      err instanceof Error &&
      err.cause &&
      typeof (err.cause as { code?: unknown }).code === "string"
        ? (err.cause as { code: string }).code
        : undefined;
    return { status: 0, error: code ? `${message} (${code})` : message };
  } finally {
    clearTimeout(timer);
  }
}

// 5xx / network error は一時障害の可能性が高いので 1 回リトライする
async function checkUrl(url: string): Promise<FetchOutcome> {
  const first = await fetchOnce(url);
  const shouldRetry =
    first.status === 0 || (first.status >= 500 && first.status < 600);
  if (!shouldRetry) return first;
  await new Promise((r) => setTimeout(r, 1500));
  return fetchOnce(url);
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const idx = cursor++;
        results[idx] = await worker(items[idx]);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

function categorize(status: number): "ok" | "warn" | "error" | "unreachable" {
  if (status === 0) return "unreachable"; // network error / timeout(一過性・失敗にしない)
  if (status >= 200 && status < 400) return "ok"; // 2xx, 3xx(リダイレクト追跡後)
  if (status === 404 || status === 410) return "error"; // 確定した消滅
  // 401/403/429/5xx/その他 → 一時的・認証・ボット対策の可能性、要目視
  return "warn";
}

// ---------------------------------------------------------------------------
// Wayback CDX の補助判定
// ---------------------------------------------------------------------------

type CdxAnswer =
  | { kind: "gone"; status: number; timestamp: string }
  | { kind: "alive"; status: number; timestamp: string }
  | { kind: "none" };
type CdxOutcome = CdxAnswer | { kind: "unavailable"; error: string };

interface CdxCacheEntry {
  checkedAt: string;
  answer: CdxAnswer;
}

function loadCdxCache(): Record<string, CdxCacheEntry> {
  try {
    const parsed: unknown = JSON.parse(
      fs.readFileSync(CDX_CACHE_PATH, "utf-8")
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    const now = Date.now();
    const fresh: Record<string, CdxCacheEntry> = {};
    for (const [url, entry] of Object.entries(
      parsed as Record<string, unknown>
    )) {
      const e = entry as Partial<CdxCacheEntry>;
      if (!e || typeof e.checkedAt !== "string" || !e.answer) continue;
      const age = now - Date.parse(e.checkedAt);
      if (!Number.isFinite(age) || age > CDX_CACHE_TTL_MS) continue;
      fresh[url] = { checkedAt: e.checkedAt, answer: e.answer };
    }
    return fresh;
  } catch {
    // 無い / 壊れている → 作り直す
    return {};
  }
}

function saveCdxCache(cache: Record<string, CdxCacheEntry>): void {
  try {
    fs.mkdirSync(path.dirname(CDX_CACHE_PATH), { recursive: true });
    fs.writeFileSync(CDX_CACHE_PATH, JSON.stringify(cache, null, 2) + "\n");
  } catch (err: unknown) {
    // キャッシュは速さのためのものなので、書けなくても判定は変えない
    const message = err instanceof Error ? err.message : String(err);
    console.error(`(Wayback キャッシュを書けなかった: ${message})`);
  }
}

// 200 / 404 / 410 に絞った最新の記録 1 件を引く(それ以外の status は判定に使わない)。
// filter は limit より先に効く(実測)。
// Wayback 自身のクローラも 403 を記録することがあるので、403 を数えると
// 「撤退の記録」が埋もれる。3xx も除くので、移設済みの URL が古い 404 で
// 偽陽性になりうる(ヘッダコメント)。
function cdxQueryUrl(url: string): string {
  const params = new URLSearchParams({
    url,
    output: "json",
    fl: "timestamp,statuscode",
    filter: "statuscode:(200|404|410)",
    limit: "-1",
  });
  return `${CDX_ENDPOINT}?${params.toString()}`;
}

async function queryCdxOnce(url: string): Promise<CdxOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CDX_TIMEOUT_MS);
  try {
    const res = await fetch(cdxQueryUrl(url), {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
    if (res.status !== 200) {
      return { kind: "unavailable", error: `HTTP ${res.status}` };
    }
    // IA の障害ページや captive portal が 200 で HTML を返す経路がある。
    // JSON.parse の例外は下の catch で unavailable にする(main().catch へ抜けると exit 2 =
    // fail-closed に化ける)。
    const rows: unknown = JSON.parse(await res.text());
    if (!Array.isArray(rows)) {
      return { kind: "unavailable", error: "not an array" };
    }
    // 記録なしは HTTP 200 / 本文 `[]`(実測)。障害ではない。
    if (rows.length === 0) return { kind: "none" };
    const last = rows[rows.length - 1];
    if (!Array.isArray(last) || last.length < 2) {
      return { kind: "unavailable", error: "unexpected row" };
    }
    const [timestamp, statusRaw] = last as [unknown, unknown];
    const status = Number(statusRaw);
    if (typeof timestamp !== "string" || !Number.isFinite(status)) {
      return { kind: "unavailable", error: "unexpected row" };
    }
    if (status === 404 || status === 410) {
      return { kind: "gone", status, timestamp };
    }
    if (status >= 200 && status < 300) {
      return { kind: "alive", status, timestamp };
    }
    // filter の外の値が来たら判別に使わない
    return { kind: "none" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: "unavailable", error: message };
  } finally {
    clearTimeout(timer);
  }
}

// 503(Temporarily Offline)は約 5.5 秒で返る(実測)ので、1 回のリトライは安い
async function queryCdx(url: string): Promise<CdxOutcome> {
  const first = await queryCdxOnce(url);
  if (first.kind !== "unavailable") return first;
  await new Promise((r) => setTimeout(r, 1500));
  return queryCdxOnce(url);
}

// known の warn(doi.org を除く)を URL 単位で照会し、答えた分だけキャッシュに書く
async function consultWayback(
  urls: string[]
): Promise<Map<string, CdxOutcome>> {
  const outcomes = new Map<string, CdxOutcome>();
  if (!CDX_ENABLED || urls.length === 0) return outcomes;

  const cache = loadCdxCache();
  const pending: string[] = [];
  for (const url of urls) {
    const hit = cache[url];
    if (hit) outcomes.set(url, hit.answer);
    else pending.push(url);
  }

  if (pending.length > 0) {
    // IA が落ちている回は早く諦める。1 件あたり最大 2 × CDX_TIMEOUT_MS 待つので、
    // 全断のまま 70 URL を回すと 1 時間近く止まる。連続で答えなかったら残りは
    // 照会せず unavailable に数える(次回に再照会する)。
    let consecutiveFailures = 0;
    await runWithConcurrency(pending, CDX_CONCURRENCY, async (url) => {
      if (consecutiveFailures >= CDX_BREAKER_AFTER) {
        outcomes.set(url, { kind: "unavailable", error: "skipped: breaker" });
        return;
      }
      const outcome = await queryCdx(url);
      outcomes.set(url, outcome);
      if (outcome.kind === "unavailable") consecutiveFailures++;
      else consecutiveFailures = 0;
    });
    const checkedAt = new Date().toISOString();
    let changed = false;
    for (const url of pending) {
      const outcome = outcomes.get(url);
      // unavailable は保存しない(次回に再照会する)
      if (!outcome || outcome.kind === "unavailable") continue;
      cache[url] = { checkedAt, answer: outcome };
      changed = true;
    }
    if (changed) saveCdxCache(cache);
  }
  return outcomes;
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
  console.log(
    `URL 出現: ${allOccurrences.length}(ユニーク ${uniqueUrls.length})`
  );
  console.log(`並列: ${CONCURRENCY} / timeout: ${TIMEOUT_MS}ms`);
  console.log("");

  const urlStatus = new Map<string, FetchOutcome>();
  await runWithConcurrency(uniqueUrls, CONCURRENCY, async (url) => {
    const r = await checkUrl(url);
    urlStatus.set(url, r);
  });

  const errors: Result[] = [];
  const unreachable: Result[] = []; // network error / timeout(報告のみ)
  const warningsActionable: Result[] = []; // 既知ボット対策ドメイン 以外 の warn(個別列挙)
  const warningsKnown: Result[] = []; // 既知ボット対策ドメインの warn(サマリ)
  for (const occ of allOccurrences) {
    const s = urlStatus.get(occ.url)!;
    const result: Result = { occurrence: occ, ...s };
    const cat = categorize(s.status);
    if (cat === "error") {
      errors.push(result);
    } else if (cat === "unreachable") {
      unreachable.push(result);
    } else if (cat === "warn") {
      if (isKnownBotProtected(occ.url)) warningsKnown.push(result);
      else warningsActionable.push(result);
    }
  }

  // known の warn を Wayback で補助判定する(ヘッダコメント)。
  // 撤退の記録がある URL は warningsKnown から抜いて archivedGone へ(二重計上しない)。
  const cdxTargets = [
    ...new Set(
      warningsKnown
        .map((w) => w.occurrence.url)
        .filter((url) => !CDX_SKIP_HOSTS.includes(hostOf(url)))
    ),
  ];
  const cdx = await consultWayback(cdxTargets);
  const archivedGone: Result[] = [];
  const stillKnown: Result[] = [];
  for (const w of warningsKnown) {
    const outcome = cdx.get(w.occurrence.url);
    if (outcome?.kind === "gone") archivedGone.push(w);
    else stillKnown.push(w);
  }
  warningsKnown.length = 0;
  warningsKnown.push(...stillKnown);
  const cdxUnavailableUrls = cdxTargets.filter(
    (url) => cdx.get(url)?.kind === "unavailable"
  );

  if (errors.length > 0) {
    console.log(`## ❌ 壊れているリンク(404 / 410)`);
    console.log("");
    for (const e of errors) {
      console.log(
        `- ${rel(e.occurrence.file)}:${e.occurrence.line} — ${e.occurrence.url} → HTTP ${e.status}`
      );
    }
    console.log("");
  }

  if (archivedGone.length > 0) {
    console.log(
      `## ❌ Wayback に撤退の記録がある既知ボット対策ドメインのリンク(ブラウザで実見して差し替える)`
    );
    console.log("");
    for (const g of archivedGone) {
      const outcome = cdx.get(g.occurrence.url);
      const record =
        outcome && outcome.kind === "gone"
          ? `Wayback ${outcome.timestamp} に HTTP ${outcome.status}`
          : "Wayback に撤退の記録";
      console.log(
        `- ${rel(g.occurrence.file)}:${g.occurrence.line} — ${g.occurrence.url} → HTTP ${g.status}(${record})`
      );
    }
    console.log("");
  }

  if (unreachable.length > 0) {
    // 名前解決の失敗を先に出す。失敗にはしないが、**恒久的な消滅である可能性が高い**ので
    // 一過性のタイムアウトと同じ並びに埋めない。
    const dns = unreachable.filter((u) =>
      (u.error ?? "").includes("ENOTFOUND")
    );
    const transient = unreachable.filter(
      (u) => !(u.error ?? "").includes("ENOTFOUND")
    );

    if (dns.length > 0) {
      console.log(
        `## 🔎 名前解決に失敗したリンク(ドメインの誤り / 失効の可能性。失敗にはしない)`
      );
      console.log("");
      for (const u of dns) {
        console.log(
          `- ${rel(u.occurrence.file)}:${u.occurrence.line} — ${u.occurrence.url} → ${u.error ?? "unknown"}`
        );
      }
      console.log("");
    }

    if (transient.length > 0) {
      console.log(
        `## 📡 到達できなかったリンク(ネットワークエラー / タイムアウト、失敗にしない)`
      );
      console.log("");
      for (const u of transient) {
        console.log(
          `- ${rel(u.occurrence.file)}:${u.occurrence.line} — ${u.occurrence.url} → network error: ${u.error ?? "unknown"}`
        );
      }
      console.log("");
    }
  }

  if (warningsActionable.length > 0) {
    console.log(
      `## ⚠️ 新規に 401 / 403 / 429 / 5xx を返したリンク(未登録ドメイン、要目視)`
    );
    console.log("");
    for (const w of warningsActionable) {
      console.log(
        `- ${rel(w.occurrence.file)}:${w.occurrence.line} — ${w.occurrence.url} → HTTP ${w.status}`
      );
    }
    console.log("");
  }

  if (warningsKnown.length > 0) {
    // ホスト別サマリ。Wayback の内訳(生存 / 記録なし / 照会できず)を添える
    type HostTally = {
      total: number;
      alive: number;
      none: number;
      unavail: number;
    };
    const byHost = new Map<string, HostTally>();
    for (const w of warningsKnown) {
      const h = hostOf(w.occurrence.url);
      const t = byHost.get(h) ?? { total: 0, alive: 0, none: 0, unavail: 0 };
      t.total++;
      const outcome = cdx.get(w.occurrence.url);
      if (outcome?.kind === "alive") t.alive++;
      else if (outcome?.kind === "none") t.none++;
      else if (outcome?.kind === "unavailable") t.unavail++;
      byHost.set(h, t);
    }
    const hosts = [...byHost.entries()].sort((a, b) => b[1].total - a[1].total);
    console.log(
      `## ℹ️ 既知のボット対策ドメイン(ブラウザでは通常 200、サマリ表示)`
    );
    console.log("");
    for (const [h, t] of hosts) {
      const detail =
        t.alive + t.none + t.unavail > 0
          ? `(Wayback 生存 ${t.alive} / 記録なし ${t.none} / 照会できず ${t.unavail})`
          : "";
      console.log(`- ${h}: ${t.total} 件${detail}`);
    }
    console.log("");
  }

  if (cdxUnavailableUrls.length > 0) {
    // fail-open: この回は判別していないことを明示する。exit code は変えない(ヘッダコメント)
    console.log(
      `## 🔎 Wayback に照会できなかった URL(この回は撤退の判別をしていない。失敗にはしない)`
    );
    console.log("");
    console.log(
      `- ${cdxUnavailableUrls.length} 件。再実行すればキャッシュ済みの分は減る。それでも答えない URL はブラウザで実見する(docs/CONTENT_GUIDELINES.md §7)`
    );
    console.log("");
  }

  const warnTotal =
    warningsActionable.length + warningsKnown.length + archivedGone.length;
  const okCount =
    allOccurrences.length - errors.length - unreachable.length - warnTotal;
  console.log(`## 集計`);
  console.log(`- ✓ 2xx / 3xx: ${okCount}`);
  console.log(`- ⚠️ 要目視 (未登録ドメイン): ${warningsActionable.length}`);
  console.log(`- ℹ️ 既知ボット対策ドメイン: ${warningsKnown.length}`);
  console.log(
    `- 🔎 Wayback に照会できなかった (失敗にしない): ${cdxUnavailableUrls.length}`
  );
  console.log(`- 📡 到達できなかった (失敗にしない): ${unreachable.length}`);
  console.log(`- ❌ 404 / 410: ${errors.length}`);
  console.log(`- ❌ Wayback に撤退の記録あり: ${archivedGone.length}`);

  const broken = errors.length + archivedGone.length;
  if (broken > 0) {
    console.error(`\n壊れたリンクが ${broken} 件あります。修正してください。`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
