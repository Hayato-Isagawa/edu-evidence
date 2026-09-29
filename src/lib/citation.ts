/** 参照日の置き場所。ページには描画せず、コピー時にクライアント側で実日付へ置き換える */
export const DATE_PLACEHOLDER = "YYYY-MM-DD";

export interface CitationInput {
  title: string;
  url: string;
  /** 公開日(ISO)。コラムだけが持つ */
  published?: string | null;
  /** 出典の最終確認日(ISO)。無いページでは省く */
  lastVerified?: string | null;
  referencedOn?: string;
}

export function formatCitation({
  title,
  url,
  published,
  lastVerified,
  referencedOn = DATE_PLACEHOLDER,
}: CitationInput): string {
  // 日付は SIST 02 の「(参照 YYYY-MM-DD)」に倣い「区分 日付」の形で並べる
  const dates = [
    published ? `公開 ${published}` : null,
    lastVerified ? `出典の最終確認 ${lastVerified}` : null,
    `参照 ${referencedOn}`,
  ]
    .filter((s): s is string => s !== null)
    .join("、");
  return `「${title}」EduEvidence JP(CC BY-SA 4.0)。${url} (${dates})`;
}

/** 日本時間の今日を YYYY-MM-DD で返す(ブラウザとテストで同じ関数を使う) */
export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
    now
  );
}
