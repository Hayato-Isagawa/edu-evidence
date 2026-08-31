/**
 * 整合性チェックスクリプト
 *
 * 以下 3 段階のチェックを実行する。不一致があれば exit code 1。
 *
 *   1. 同一ファイル内整合(戦略ページ)
 *      本文が「その値はこのページ自身の効果量だ」と宣言している箇所 —— 以下これを
 *      「錨」と呼ぶ —— だけを frontmatter の monthsGained と照合する。錨は 2 系統:
 *        ・「学習は約 X ヶ月分前進します」型。「分」が進捗量の単位であることを示す
 *        ・「効果量(±X ヶ月)」「効果量は約 X ヶ月」型。「効果量」が帰属を宣言する
 *
 *      本文中の生の「+X ヶ月」では照合しない。戦略ページは他戦略や下位群の効果量に
 *      正当に言及しており(2026-08 時点で 17 本に 39 箇所)、どれが自ページの値かを
 *      判定する手段がこの段には無いため。素朴に「+X ヶ月」を拾うと、その 39 箇所が
 *      すべて不一致として出る。
 *
 *      出典注釈の行も錨にしない。そこは引用元が報告した値を書くのが正しく、サイトの
 *      総合値と食い違ってよいため(例: メタ認知の指導は Toolkit の 2025 年更新で
 *      +8 ヶ月に上がったが、根拠レビューが算出した値は +7 ヶ月)。ただし判定は
 *      リンク・刊行年・注釈ダッシュという表層の印に頼っており、印を持たない
 *      「EEF Toolkit では効果量+3 ヶ月」型は錨として扱われる。
 *
 *      錨が当たらないページはこの段では守られない。件数と名前を毎回出している。
 *
 *   2. コラム内の戦略参照整合(ファイル間、Issue #43)
 *      ・コラム本文で「戦略名(+N ヶ月)」を書いた場合、その戦略ページの
 *        monthsGained と N を照合(名前ベース)
 *      ・コラム本文で `[任意](/strategies/<slug>)` のインラインリンクを
 *        書いた際、同じ行に現れる「+N ヶ月」を順序対応で突合し、
 *        `<slug>.md` の monthsGained と一致するか検証(リンクベース)
 *
 *   3. 用語集・ツールチップの参照整合
 *      glossary.astro / glossary.ts 内の戦略名(+N ヶ月)を照合
 *
 * 使い方: npx tsx scripts/check-consistency.ts
 */

import fs from "fs";
import path from "path";
import matter from "gray-matter";

const STRATEGIES_DIR = path.resolve("src/content/strategies");
const COLUMNS_DIR = path.resolve("src/content/columns");

interface Issue {
  file: string;
  line: number;
  expected: number;
  found: string;
  context: string;
}

const issues: Issue[] = [];

// 月の単位。「ヵ」「カ」「か」は本文に無いが frontmatter では使われているので、
// 引き写したときに黙って対象外にならないよう受けておく。
const MONTH_UNIT = "[ヶヵかカ]";

// 錨の定義。`sign` は符号を持つ捕獲群の番号で、持たない書き方では null。
// `d` フラグを付けているのは、数字の位置で重複を潰すため(下の collectAnchors)。
const ANCHORS: { re: RegExp; digits: number; sign: number | null }[] = [
  // A: 「約 X ヶ月分」「+X ヶ月分」。「分」が進捗量の単位であることを示す。
  // 符号を書かない形なので絶対値で比べる(減少側は「約 2 ヶ月分の学力低下」と書く)。
  { re: new RegExp(`約\\s*(\\d+)\\s*${MONTH_UNIT}月分`, "dg"), digits: 1, sign: null },
  { re: new RegExp(`\\+\\s*(\\d+)\\s*${MONTH_UNIT}月分`, "dg"), digits: 1, sign: null },
  // B1: 括弧で囲む形。括弧を使うときは「効果量」の直後でなければならない。
  // 間に語を挟めるようにすると「効果量はメタ認知の指導(+8 ヶ月)より小さい」で
  // 他戦略の括弧を掴む。
  {
    re: new RegExp(
      `効果量\\s*[（(]\\s*([+＋\\-−ー±]?)\\s*(\\d+)\\s*${MONTH_UNIT}月(?:分)?\\s*[）)]`,
      "dg",
    ),
    digits: 2,
    sign: 1,
  },
  // B2: 括弧を使わない形。「効果量は約 4 ヶ月」「効果量±0 ヶ月」のように助詞と副詞だけを
  // 挟める。読点・括弧・数字は挟めない —— 読点と括弧を跨ぐと他戦略の値を、数字を跨ぐと
  // 「効果量 d=-0.20 で約 2 ヶ月分」のような別指標からの換算値を掴む。
  {
    re: new RegExp(
      `効果量[^。、\\n0-9０-９（()）]{0,6}?([+＋\\-−ー±]?)\\s*(\\d+)\\s*${MONTH_UNIT}月(?:分)?`,
      "dg",
    ),
    digits: 2,
    sign: 1,
  },
];

// 出典注釈の行は錨にしない。見出し名では判定しない —— 節の構成はページごとに違ううえ、
// 見出しを 1 つ改名すると静かに効かなくなるため。
// 年は `(2021)` の裸書きだけでなく `(Author et al. 2016)` の末尾にも入る。
function isCitationLine(line: string): boolean {
  return (
    /^\s*[-*]\s/.test(line) &&
    (/\]\(https?:/.test(line) ||
      /\([^)]*(?:19|20)\d{2}[a-z]?\)/.test(line) ||
      /\s—\s/.test(line))
  );
}

interface Anchor {
  text: string;
  index: number;
  value: number;
  /** 符号が明示されているか。`±` と無符号は「大きさだけを述べている」と読んで絶対値で比べる。 */
  signed: boolean;
}

// 1 行から錨を集める。数字の位置をキーにするので、「効果量は約 2 ヶ月分」のように
// A と B2 が同じ数字に当たる文でも 1 件にまとまる(後から当たった方が残る)。
function collectAnchors(line: string): Anchor[] {
  const byDigitPosition = new Map<number, Anchor>();
  for (const { re, digits, sign } of ANCHORS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const at = m.indices![digits]![0];
      const mark = sign === null ? "" : normalizeSign(m[sign]);
      const magnitude = parseInt(m[digits], 10);
      byDigitPosition.set(at, {
        text: m[0].trim(),
        index: m.index,
        value: mark === "-" ? -magnitude : magnitude,
        signed: mark === "-" || mark === "+",
      });
    }
  }
  return [...byDigitPosition.values()];
}

// 錨が 1 つも当たらなかった戦略。値を書き換えても検出されないので数えて出す。
const unanchoredStrategies: string[] = [];

// 全角の符号を parseInt が読める形に直す。本文の表では減少を U+2212 で書いている。
function normalizeSign(s: string): string {
  return s.replace(/＋/g, "+").replace(/[−ー]/g, "-");
}

function contextAround(line: string, anchor: Anchor): string {
  return line.substring(
    Math.max(0, anchor.index - 20),
    anchor.index + anchor.text.length + 5,
  );
}

function checkFile(filePath: string, isColumn = false) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);
  const fileName = path.basename(filePath);
  const monthsGained = data.monthsGained as number | undefined;
  const lines = content.split("\n");

  // frontmatter 行数のオフセットを計算。split("---")[1] は前後の改行を含むので
  // 要素数は「frontmatter の行数 + 2」になり、本文 1 行目のファイル行番号は
  // 開始/終了の --- を足した frontmatterLines + 1 と一致する。
  const frontmatterLines = raw.split("---")[1]?.split("\n").length ?? 0;
  const offset = frontmatterLines + 1;

  // コラム→戦略の照合は、コラム自身の monthsGained を必要としない。
  // 下の early return より後ろに置くと、コラムは monthsGained を持たないので
  // 第 2 段が丸ごと実行されないままになる。
  if (isColumn) {
    checkColumnReferences(filePath, lines, offset);
    checkColumnStrategyLinks(filePath, lines, offset);
  }

  if (monthsGained === undefined) return;

  const abs = Math.abs(monthsGained);
  let anchored = false;

  lines.forEach((line, i) => {
    // 出典注釈は錨にしない。どの錨より先に判定する —— 「分」を使った書き方
    // (「約 2 ヶ月分と算出」)も引用元の値なので、同じ扱いでなければならない。
    if (isCitationLine(line)) return;

    for (const anchor of collectAnchors(line)) {
      anchored = true;
      const agrees = anchor.signed
        ? anchor.value === monthsGained
        : Math.abs(anchor.value) === abs;
      if (agrees) continue;
      issues.push({
        file: fileName,
        line: i + offset,
        expected: monthsGained,
        found: anchor.text,
        context: contextAround(line, anchor).trim(),
      });
    }
  });

  if (!isColumn && !anchored) unanchoredStrategies.push(fileName);
}

// 戦略ファイルの monthsGained マップを作成(title キー)
function buildStrategyMap(): Map<string, number> {
  const map = new Map<string, number>();
  const files = fs.readdirSync(STRATEGIES_DIR).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    const raw = fs.readFileSync(path.join(STRATEGIES_DIR, file), "utf-8");
    const { data } = matter(raw);
    if (data.title && data.monthsGained !== undefined) {
      map.set(data.title as string, data.monthsGained as number);
    }
  }
  return map;
}

// 戦略ファイルの monthsGained マップを作成(slug キー)
// Issue #43 の column → strategy インラインリンク整合チェック用
function buildStrategySlugMap(): Map<string, number> {
  const map = new Map<string, number>();
  const files = fs.readdirSync(STRATEGIES_DIR).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    const raw = fs.readFileSync(path.join(STRATEGIES_DIR, file), "utf-8");
    const { data } = matter(raw);
    if (data.monthsGained !== undefined) {
      const slug = file.replace(/\.md$/, "");
      map.set(slug, data.monthsGained as number);
    }
  }
  return map;
}

// マップは 1 度だけ作る。呼び出しごとに作ると、コラム 1 本につき全戦略を 2 回読み直す。
let titleMapCache: Map<string, number> | undefined;
let slugMapCache: Map<string, number> | undefined;
const strategyTitleMap = () => (titleMapCache ??= buildStrategyMap());
const strategySlugMap = () => (slugMapCache ??= buildStrategySlugMap());

// コラム本文の [任意](/strategies/<slug>) と同一行の「+N ヶ月」を順序対応で突合
// (Issue #43: 数値直接書き写しのズレを検出)
function checkColumnStrategyLinks(
  filePath: string,
  lines: string[],
  offset: number,
) {
  const slugMap = strategySlugMap();

  lines.forEach((line, i) => {
    // 行内の /strategies/<slug> リンクをすべて取得(順序を保持)
    const linkRe = /\[[^\]]+\]\(\/strategies\/([a-z0-9-]+)\)/g;
    const slugs: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(line)) !== null) slugs.push(m[1]);
    if (slugs.length === 0) return;

    // 行内の「+N ヶ月」「-N ヶ月」「+N / +M ヶ月」をすべて取得
    // 「ヵ月」「ヶ月」いずれも許容、スラッシュ区切り複合表記(表セル型)も分解して個別値に
    // 記述側は減少を全角マイナス(U+2212)で書くことがあるので、符号は正規化してから読む
    const monthGroupRe =
      /([+＋\-−ー]?\s*\d+(?:\s*\/\s*[+＋\-−ー]?\s*\d+)*)\s*[ヶヵかカ]月/g;
    const months: number[] = [];
    while ((m = monthGroupRe.exec(line)) !== null) {
      const parts = m[1]
        .split(/\s*\/\s*/)
        .map((s) => parseInt(normalizeSign(s), 10));
      months.push(...parts);
    }
    if (months.length === 0) return;

    const pushIssue = (slug: string, found: number) => {
      const expected = slugMap.get(slug);
      if (expected === undefined) return;
      if (expected === found) return;
      issues.push({
        file: path.basename(filePath),
        line: i + offset,
        expected,
        found: `[${slug}] ${found >= 0 ? "+" : ""}${found}ヶ月`,
        context: `strategies/${slug}.md の monthsGained は ${
          expected >= 0 ? "+" : ""
        }${expected}`,
      });
    };

    if (slugs.length === months.length) {
      // リンク数と月数が一致: 順序対応で突合
      slugs.forEach((slug, idx) => pushIssue(slug, months[idx]));
    } else if (slugs.length === 1) {
      // リンク 1 つ: 最初の月数とのみ突合(誤検知を避けるため多対一はスキップ)
      pushIssue(slugs[0], months[0]);
    }
    // リンク数 ≠ 月数 かつリンク複数のケースは、順序対応が曖昧なのでスキップ
  });
}

function checkColumnReferences(
  filePath: string,
  lines: string[],
  offset: number
) {
  const strategyMap = strategyTitleMap();

  lines.forEach((line, i) => {
    // 「戦略名(+X ヶ月)」パターンを検出。
    // 名前は和文の句読点・括弧で区切る。和文には語の区切りに空白が無いので、
    // 空白だけを境界にすると名前が行頭方向へ伸び、同じ行にある別の戦略の
    // 月数を掴んで誤検知になる。
    const refPattern =
      /([^\s"`（()）、。・「」【】…]+?)[（(]\s*([+＋\-−ー]?\s*\d+)\s*[ヶヵ]月(?:分)?\s*[）)]/g;
    let match;
    while ((match = refPattern.exec(line)) !== null) {
      const refName = match[1].replace(/\*\*/g, "").trim();
      const refValue = parseInt(normalizeSign(match[2].replace(/\s+/g, "")), 10);

      // 戦略マップで照合
      for (const [title, monthsGained] of strategyMap) {
        // 末尾一致に限る。部分一致にすると「フィードバックとメタ認知の指導」が
        // 前半の戦略に当たり、短い捕獲(「指導」)が無関係な戦略名に当たる。
        if (refName === title || refName.endsWith(title)) {
          if (refValue !== monthsGained) {
            issues.push({
              file: path.basename(filePath),
              line: i + offset,
              expected: monthsGained,
              found: `${refName}(${refValue > 0 ? "+" : ""}${refValue}ヶ月)`,
              context: `戦略「${title}」の値は ${monthsGained > 0 ? "+" : ""}${monthsGained}`,
            });
          }
          break;
        }
      }
    }
  });
}

// 実行
console.log("=== 整合性チェック開始 ===\n");

// 戦略ファイル
const strategyFiles = fs
  .readdirSync(STRATEGIES_DIR)
  .filter((f) => f.endsWith(".md"));
for (const file of strategyFiles) {
  checkFile(path.join(STRATEGIES_DIR, file));
}

// コラムファイル
if (fs.existsSync(COLUMNS_DIR)) {
  const columnFiles = fs
    .readdirSync(COLUMNS_DIR)
    .filter((f) => f.endsWith(".md"));
  for (const file of columnFiles) {
    checkFile(path.join(COLUMNS_DIR, file), true);
  }
}

// 用語集・ツールチップデータ: 戦略名に続く「(+Xヶ月)」を戦略マップで照合
function checkGlossaryFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf-8");
  const strategyMap = strategyTitleMap();
  const lines = raw.split("\n");

  lines.forEach((line, i) => {
    // 「戦略名(+X ヶ月)」パターン。ただし汎用的なテンプレート文字列は除外
    const refPattern =
      /([^\s"`（(]+?)[（(]\s*([+＋\-−ー]?\s*\d+)\s*[ヶヵ]月(?:分)?\s*[）)]/g;
    let match;
    while ((match = refPattern.exec(line)) !== null) {
      const refName = match[1].replace(/\*\*/g, "").trim();
      const refValue = parseInt(normalizeSign(match[2].replace(/\s+/g, "")), 10);

      for (const [title, monthsGained] of strategyMap) {
        if (refName === title || refName.endsWith(title) || title.endsWith(refName)) {
          if (refValue !== monthsGained) {
            issues.push({
              file: path.basename(filePath),
              line: i + 1,
              expected: monthsGained,
              found: `${refName}(${refValue > 0 ? "+" : ""}${refValue}ヶ月)`,
              context: `戦略「${title}」の値は ${monthsGained > 0 ? "+" : ""}${monthsGained}`,
            });
          }
          break;
        }
      }
    }
  });
}

checkGlossaryFile(path.resolve("src/pages/guide/glossary.astro"));
checkGlossaryFile(path.resolve("src/data/glossary.ts"));

// 保護範囲の可視化。このチェックは「錨が当たったうえで値がずれた」ときにしか鳴らないので、
// 注記を書き換えるだけでそのページは黙って対象外になる。件数を出さないと後退に気づけない。
console.log(
  `錨が当たらなかった戦略: ${unanchoredStrategies.length} / ${strategyFiles.length}` +
    (unanchoredStrategies.length > 0
      ? `\n  ${unanchoredStrategies.join("\n  ")}\n`
      : "\n")
);

// 結果出力
if (issues.length === 0) {
  console.log("✓ 不一致は見つかりませんでした。\n");
  process.exit(0);
} else {
  console.log(`✗ ${issues.length} 件の不一致が見つかりました:\n`);
  for (const issue of issues) {
    console.log(`  ${issue.file}:${issue.line}`);
    console.log(`    期待値: ${issue.expected > 0 ? "+" : ""}${issue.expected}ヶ月`);
    console.log(`    検出: ${issue.found}`);
    console.log(`    文脈: ${issue.context}`);
    console.log("");
  }
  process.exit(1);
}
