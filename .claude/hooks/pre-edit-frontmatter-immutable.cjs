#!/usr/bin/env node
/**
 * PreToolUse hook (Edit | MultiEdit) — frontmatter immutable guard.
 *
 * Blocks silent edits to high-stakes frontmatter fields in
 * src/content/strategies/*.md and src/content/columns/*.md.
 *
 * Protected fields (any value change → permissionDecision="ask"):
 *   - sourceUrl              (CONTENT_GUIDELINES Rule 1.2b: primary research only)
 *   - monthsGained           (effect-size months)
 *   - evidenceStrength
 *   - cost
 *   - cohensD                (Hattie's d, under evidence.hattie)
 *   - strength               (under evidence.{eef,japan})
 *   - studies                (methodology.studies)
 *   - sampleSize             (methodology.sampleSize)
 *   - effectSize             (methodology.effectSize)
 *   - year                   (methodology.primaryMetaAnalysis.year)
 *   - authors                (methodology.primaryMetaAnalysis.authors)
 *   - url                    (methodology.primaryMetaAnalysis.url)
 *
 * Backed by DELEGATE-52 (arxiv 2604.15597) — sparse silent corruption
 * (Claude 4.6 Opus 26.9% rate) most often targets numeric/URL frontmatter.
 */

'use strict';

const PROTECTED_KEYS = [
  'sourceUrl',
  'monthsGained',
  'evidenceStrength',
  'cost',
  'cohensD',
  'strength',
  'studies',
  'sampleSize',
  'effectSize',
  'year',
  'authors',
  'url',
];

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/;
const TARGET_PATH_RE = /(?:^|\/)src\/content\/(strategies|columns)\/[^/]+\.(md|mdx)$/i;

function extractFrontmatter(s) {
  if (!s) return null;
  const m = s.match(FRONTMATTER_RE);
  return m ? m[1] : null;
}

function captureProtectedFields(fm) {
  if (!fm) return new Map();
  const map = new Map();
  for (const key of PROTECTED_KEYS) {
    // 前置きを `[ \t]*(?:-[ \t]*)?` にしてある。以前の `\s*-?\s*` は
    // **隣り合う 2 つの `*` が空白を分け合える**ため探索が O(N²) に落ちる。
    // 実測(保護キー 12 本を走査、本機 Node 24):
    //          4KB      16KB      32KB
    //   旧    317ms   5,094ms  20,376ms
    //   新    0.2ms     0.8ms    1.6ms
    // `-` を伴う場合だけ 2 つ目の空白列を許すと分割の曖昧さが消えて線形になる。
    // `\s` を `[ \t]` に置き換えるだけでは直らない(32KB で 19,392ms。分割の曖昧さが残る)。
    // 抽出結果は実データで完全一致(strategies + columns 105 本 × 保護キー 12 本
    // × frontmatter 窓 / 全文窓 = 2,520 比較で差分 0)。合成入力では 2 種類だけ差が出て、
    // **どちらも新形の方が正しい**:
    //   1. **値が空のキー**。`\s` は改行を跨げるので、旧形は `sourceUrl:` の値として
    //      **次の行をまるごと**拾っていた(`sourceUrl:\nmonthsGained: 5` → `monthsGained: 5`)。
    //      空のまま次の行を編集すると before/after が変わり、**無関係な ask が出る**。
    //   2. `\s` に含まれて `[ \t]` に含まれない非改行文字(全角空白・NBSP・垂直タブ・
    //      フォームフィード)でインデントした行。旧形はそれを `sourceUrl` として拾うが、
    //      YAML から見るとキー名自体が別物(`　sourceUrl`)なので拾う方が誤り。
    //
    // 詰めておく理由: settings.json の `timeout: 5`(秒)を超えるとプロセスが
    // kill され、stdout が出ない = ガードが黙って素通りする。旧形は 16KB の
    // 空白で既にこれを超えていた。
    const re = new RegExp(`^[ \\t]*(?:-[ \\t]*)?${key}:[ \\t]*(.+?)[ \\t]*$`, 'gm');
    const values = [...fm.matchAll(re)].map(m => m[1].replace(/^["']|["']$/g, ''));
    if (values.length) map.set(key, values);
  }
  return map;
}

function diffMaps(beforeM, afterM) {
  const allKeys = new Set([...beforeM.keys(), ...afterM.keys()]);
  const diffs = [];
  for (const key of allKeys) {
    const before = beforeM.get(key) ?? [];
    const after = afterM.get(key) ?? [];
    const beforeStr = JSON.stringify(before);
    const afterStr = JSON.stringify(after);
    if (beforeStr !== afterStr) {
      diffs.push({ key, before, after });
    }
  }
  return diffs;
}

function evaluatePair(oldStr, newStr) {
  // Edit chunks usually don't include the `---` delimiters; fall back to the
  // whole chunk so single-line frontmatter edits ("monthsGained: 5") still get
  // inspected. Without this the guard only fired when the edit happened to
  // contain the fences, which real Edit calls almost never do — it was
  // effectively dead. TARGET_PATH_RE keeps body-text false positives unlikely.
  // (edu-watch has had this fallback since its own hook was written.)
  const beforeFm = extractFrontmatter(oldStr) ?? (oldStr ?? '');
  const afterFm = extractFrontmatter(newStr) ?? (newStr ?? '');
  if (!beforeFm && !afterFm) return [];
  return diffMaps(captureProtectedFields(beforeFm), captureProtectedFields(afterFm));
}

// Write は差分ではなくファイル全体が届く。比較対象はディスク上の現物。
// 読めない理由で挙動を分ける:
//   ファイルが無い   → 新規作成。比較対象が無いので通す
//   それ以外の失敗   → 検証できない。通さずに確認を出す(fail-safe)
// これが無いと、Edit では捕捉される monthsGained / sourceUrl の改変が
// Write による全文書き換えでは一切検知されない(edu-law から移植)。
function evaluateWrite(filePath, content) {
  let current;
  try {
    current = require('node:fs').readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    return [{ key: '__unreadable__', before: [String(err && err.code) || 'read error'], after: [] }];
  }
  return evaluatePair(current, content ?? '');
}

function evaluatePayload(toolName, toolInput) {
  if (toolName === 'Edit') {
    return evaluatePair(toolInput?.old_string ?? '', toolInput?.new_string ?? '');
  }
  if (toolName === 'Write') {
    return evaluateWrite(String(toolInput?.file_path || ''), toolInput?.content ?? '');
  }
  if (toolName === 'MultiEdit') {
    const edits = Array.isArray(toolInput?.edits) ? toolInput.edits : [];
    const merged = [];
    for (const e of edits) {
      merged.push(...evaluatePair(e?.old_string ?? '', e?.new_string ?? ''));
    }
    return merged;
  }
  return [];
}

function fmtVal(arr) {
  if (!arr.length) return '∅';
  return arr.map(v => (v.length > 60 ? v.slice(0, 57) + '...' : v)).join(' | ');
}

function buildReason(diffs, filePath) {
  const lines = [`[frontmatter-immutable] Protected fields changed in ${filePath}:`];
  for (const d of diffs) {
    lines.push(`  ${d.key}:`);
    lines.push(`    before: ${fmtVal(d.before)}`);
    lines.push(`    after:  ${fmtVal(d.after)}`);
  }
  lines.push('');
  lines.push('Frontmatter values back claims that readers act on (effect sizes,');
  lines.push('strengths, primary research URLs). Confirm a primary research source');
  lines.push('(CONTENT_GUIDELINES Rule 1.2b: sourceUrl is primary research only) before applying.');
  return lines.join('\n');
}

function run(inputOrRaw, _options = {}) {
  let input;
  try {
    input = typeof inputOrRaw === 'string'
      ? (inputOrRaw.trim() ? JSON.parse(inputOrRaw) : {})
      : (inputOrRaw || {});
  } catch {
    return { exitCode: 0 };
  }

  const toolName = String(input?.tool_name || '');
  if (!['Edit', 'Write', 'MultiEdit'].includes(toolName)) return { exitCode: 0 };

  const toolInput = input?.tool_input || {};
  const filePath = String(toolInput?.file_path || '');
  if (!TARGET_PATH_RE.test(filePath)) return { exitCode: 0 };

  const diffs = evaluatePayload(toolName, toolInput);
  if (!diffs.length) return { exitCode: 0 };

  const reason = buildReason(diffs, filePath);
  const stdout = JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: reason,
    },
  });

  return { exitCode: 0, stdout, stderr: reason };
}

module.exports = {
  run,
  extractFrontmatter,
  captureProtectedFields,
  diffMaps,
  PROTECTED_KEYS,
  TARGET_PATH_RE,
};

if (require.main === module) {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', c => { data += c; });
  process.stdin.on('end', () => {
    const out = run(data);
    if (out.stdout) process.stdout.write(out.stdout);
    if (out.stderr) process.stderr.write(out.stderr.endsWith('\n') ? out.stderr : out.stderr + '\n');
    // **`process.exit()` にしないこと。** stdout がパイプのとき write は非同期なので、
    // 直後に exit すると書き残しが捨てられ、判定 JSON がちょうど 65536B
    // (パイプバッファ)で切れる。切れた JSON は誰もエラーにせず、global
    // ディスパッチャは「判定ではない付随出力」として捨てて exit 0 =
    // **ask が無音で消える**。exitCode を置くだけにして、Node に flush させる。
    process.exitCode = Number.isInteger(out.exitCode) ? out.exitCode : 0;
  });
}
