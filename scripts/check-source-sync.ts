/**
 * 出典別整合性チェックスクリプト
 *
 * src/content/strategies/ の各 .md frontmatter から source / evidence.* /
 * lastVerified を読み、出典別(EEF / Hattie / Japan)にしきい値超過分を列挙する。
 *
 * 使い方:
 *   npx tsx scripts/check-source-sync.ts                  # 全 § + サマリ
 *   npx tsx scripts/check-source-sync.ts --section eef    # §1 のみ
 *   npx tsx scripts/check-source-sync.ts --json           # JSON 出力
 *
 * exit code: 検出数合計(0 = 全部 fresh)
 */

import fs from "fs";
import path from "path";
import matter from "gray-matter";

const STRATEGIES_DIR = path.resolve("src/content/strategies");

type Section = "eef" | "hattie" | "japan";

const THRESHOLDS: Record<Section, number> = {
  eef: 30,
  hattie: 365,
  japan: 365,
};

const SECTION_LABEL: Record<Section, string> = {
  eef: "§1 EEF",
  hattie: "§2 Hattie",
  japan: "§3 Japan",
};

interface StaleEntry {
  file: string;
  lastVerified: string;
  daysSinceVerified: number;
}

interface FrozenEntry {
  file: string;
  archivedAt: string;
}

interface SectionResult {
  section: Section;
  threshold: number;
  totalTargets: number;
  stale: StaleEntry[];
  /** `evidence.eef.archivedAt` を持つ凍結出典。対象数に数えないが、黙って消さず列挙する */
  frozen: FrozenEntry[];
}

interface CliArgs {
  section: Section | null;
  json: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { section: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") {
      args.json = true;
    } else if (a === "--section") {
      const v = argv[i + 1];
      if (v === "eef" || v === "hattie" || v === "japan") {
        args.section = v;
        i++;
      } else {
        console.error(
          `--section の値が不正: ${v ?? "(なし)"} — eef|hattie|japan を指定してください`
        );
        process.exit(2);
      }
    }
  }
  return args;
}

function parseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

// 凍結を読むのは `evidence.eef.archivedAt` だけ。2026-09-19 時点で `src/content.config.ts` が
// 宣言していたのも eef の下だけで、他の § に書いた `archivedAt` は Astro が黙って捨てていた
// (`astro sync` は通る)。script だけが 3 § で読むと schema に無い凍結が報告に出る(#620)。
// 他の § に凍結を足すときは schema・`docs/source-sync-protocol.md` §0・ここを一緒に広げる
function archivedAtOf(
  section: Section,
  data: Record<string, unknown>
): string | null {
  if (section !== "eef") return null;
  const evidence = data.evidence as Record<string, unknown> | undefined;
  const entry = evidence?.[section] as Record<string, unknown> | undefined;
  const value = entry?.archivedAt;
  return typeof value === "string" && parseDate(value) ? value : null;
}

function isTargetOf(section: Section, data: Record<string, unknown>): boolean {
  if (data.source === section) return true;
  const evidence = data.evidence as Record<string, unknown> | undefined;
  if (evidence && typeof evidence === "object" && section in evidence) {
    return true;
  }
  return false;
}

function collect(today: Date): Record<Section, SectionResult> {
  const sections: Record<Section, SectionResult> = {
    eef: {
      section: "eef",
      threshold: THRESHOLDS.eef,
      totalTargets: 0,
      stale: [],
      frozen: [],
    },
    hattie: {
      section: "hattie",
      threshold: THRESHOLDS.hattie,
      totalTargets: 0,
      stale: [],
      frozen: [],
    },
    japan: {
      section: "japan",
      threshold: THRESHOLDS.japan,
      totalTargets: 0,
      stale: [],
      frozen: [],
    },
  };

  const files = fs
    .readdirSync(STRATEGIES_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();

  for (const file of files) {
    const raw = fs.readFileSync(path.join(STRATEGIES_DIR, file), "utf-8");
    const { data } = matter(raw);

    const lastVerifiedRaw = data.lastVerified;
    const verifiedAt =
      typeof lastVerifiedRaw === "string" ? parseDate(lastVerifiedRaw) : null;

    for (const section of ["eef", "hattie", "japan"] as Section[]) {
      if (!isTargetOf(section, data)) continue;
      // 出典側で値が固定された(strand 廃止で Wayback に固定した等)ものは同期しようがない。
      // 対象数から外すが、外したことはレポートに残す(#618)
      const archivedAt = archivedAtOf(section, data);
      if (archivedAt) {
        sections[section].frozen.push({ file, archivedAt });
        continue;
      }
      sections[section].totalTargets++;

      if (!verifiedAt || typeof lastVerifiedRaw !== "string") continue;
      const days = daysBetween(verifiedAt, today);
      if (days > sections[section].threshold) {
        sections[section].stale.push({
          file,
          lastVerified: lastVerifiedRaw,
          daysSinceVerified: days,
        });
      }
    }
  }

  for (const section of ["eef", "hattie", "japan"] as Section[]) {
    sections[section].stale.sort(
      (a, b) => b.daysSinceVerified - a.daysSinceVerified
    );
  }

  return sections;
}

function renderText(
  sections: Record<Section, SectionResult>,
  todayStr: string,
  filterSection: Section | null
): string {
  const lines: string[] = [];
  lines.push(`# Source Sync Status (${todayStr})`);
  lines.push("");

  const targets: Section[] = filterSection
    ? [filterSection]
    : ["eef", "hattie", "japan"];

  for (const s of targets) {
    const r = sections[s];
    const label = SECTION_LABEL[s];
    lines.push(
      `## ${label} (${r.threshold} 日超過: ${r.stale.length} 件 / 計 ${r.totalTargets} 件)`
    );
    lines.push("");
    if (r.stale.length === 0) {
      lines.push("(なし)");
    } else {
      for (const e of r.stale) {
        lines.push(
          `- \`strategies/${e.file}\` — lastVerified ${e.lastVerified} (${e.daysSinceVerified} 日経過)`
        );
      }
    }
    lines.push("");
    lines.push(`凍結(対象外): ${r.frozen.length} 件`);
    for (const e of r.frozen) {
      lines.push(`- \`strategies/${e.file}\` — archivedAt ${e.archivedAt}`);
    }
    lines.push("");
  }

  if (!filterSection) {
    const e = sections.eef;
    const h = sections.hattie;
    const j = sections.japan;
    const total = e.stale.length + h.stale.length + j.stale.length;
    lines.push("## Summary");
    lines.push("");
    lines.push(
      `- §1 EEF: ${e.stale.length} / ${e.totalTargets}  §2 Hattie: ${h.stale.length} / ${h.totalTargets}  §3 Japan: ${j.stale.length} / ${j.totalTargets}`
    );
    lines.push(
      total === 0 ? "- すべて fresh" : `- Total: ${total} 件が再検証推奨`
    );
    lines.push("");
  }

  return lines.join("\n");
}

function renderJson(
  sections: Record<Section, SectionResult>,
  todayStr: string,
  filterSection: Section | null
): string {
  const targets: Section[] = filterSection
    ? [filterSection]
    : ["eef", "hattie", "japan"];

  const out: Record<string, unknown> = {
    today: todayStr,
    thresholds: THRESHOLDS,
    sections: {} as Record<string, SectionResult>,
  };

  let total = 0;
  for (const s of targets) {
    (out.sections as Record<string, SectionResult>)[s] = sections[s];
    total += sections[s].stale.length;
  }

  out.summary = {
    total,
    byCount: filterSection
      ? `${SECTION_LABEL[filterSection]}: ${sections[filterSection].stale.length} / ${sections[filterSection].totalTargets}`
      : `§1: ${sections.eef.stale.length} / ${sections.eef.totalTargets}  §2: ${sections.hattie.stale.length} / ${sections.hattie.totalTargets}  §3: ${sections.japan.stale.length} / ${sections.japan.totalTargets}`,
  };

  return JSON.stringify(out, null, 2);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const todayStr = today.toISOString().slice(0, 10);

  const sections = collect(today);

  const output = args.json
    ? renderJson(sections, todayStr, args.section)
    : renderText(sections, todayStr, args.section);

  console.log(output);

  const total = args.section
    ? sections[args.section].stale.length
    : sections.eef.stale.length +
      sections.hattie.stale.length +
      sections.japan.stale.length;

  process.exit(total);
}

main();
