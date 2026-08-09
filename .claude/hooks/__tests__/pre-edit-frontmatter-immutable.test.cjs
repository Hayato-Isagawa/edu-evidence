'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  run,
  extractFrontmatter,
  captureProtectedFields,
  diffMaps,
  TARGET_PATH_RE,
} = require('../pre-edit-frontmatter-immutable.cjs');

test('TARGET_PATH_RE: matches strategies/columns paths', () => {
  assert.match('src/content/strategies/x.md', TARGET_PATH_RE);
  assert.match('src/content/columns/y.md', TARGET_PATH_RE);
  assert.match('/Users/H/edu-evidence/src/content/strategies/z.md', TARGET_PATH_RE);
});

test('TARGET_PATH_RE: rejects unrelated paths', () => {
  assert.doesNotMatch('src/components/X.astro', TARGET_PATH_RE);
  assert.doesNotMatch('docs/decisions/0001.md', TARGET_PATH_RE);
  assert.doesNotMatch('README.md', TARGET_PATH_RE);
});

test('extractFrontmatter: extracts YAML block', () => {
  const md = '---\ntitle: x\nmonthsGained: 5\n---\n\n# body';
  assert.equal(extractFrontmatter(md), 'title: x\nmonthsGained: 5');
});

test('extractFrontmatter: returns null when missing', () => {
  assert.equal(extractFrontmatter('# just body'), null);
});

test('captureProtectedFields: top-level scalars', () => {
  const fm = 'title: x\nmonthsGained: 5\nevidenceStrength: 4\ncost: 2\nsourceUrl: https://example.com/a';
  const m = captureProtectedFields(fm);
  assert.deepEqual(m.get('monthsGained'), ['5']);
  assert.deepEqual(m.get('evidenceStrength'), ['4']);
  assert.deepEqual(m.get('cost'), ['2']);
  assert.deepEqual(m.get('sourceUrl'), ['https://example.com/a']);
});

test('captureProtectedFields: nested fields under evidence/methodology', () => {
  const fm = [
    'evidence:',
    '  eef:',
    '    monthsGained: 3',
    '    strength: 4',
    '  japan:',
    '    monthsGained: 5',
    '    strength: 3',
    '  hattie:',
    '    cohensD: 0.42',
    'methodology:',
    '  studies: 12',
    '  effectSize: "d=0.37"',
    '  primaryMetaAnalysis:',
    '    authors: "Nickow et al."',
    '    year: 2020',
    '    url: https://doi.org/10.1234/abc',
  ].join('\n');
  const m = captureProtectedFields(fm);
  assert.deepEqual(m.get('monthsGained'), ['3', '5']);
  assert.deepEqual(m.get('strength'), ['4', '3']);
  assert.deepEqual(m.get('cohensD'), ['0.42']);
  assert.deepEqual(m.get('studies'), ['12']);
  assert.deepEqual(m.get('effectSize'), ['d=0.37']);
  assert.deepEqual(m.get('authors'), ['Nickow et al.']);
  assert.deepEqual(m.get('year'), ['2020']);
  assert.deepEqual(m.get('url'), ['https://doi.org/10.1234/abc']);
});

test('diffMaps: detects changed monthsGained', () => {
  const before = new Map([['monthsGained', ['5']]]);
  const after = new Map([['monthsGained', ['7']]]);
  const d = diffMaps(before, after);
  assert.equal(d.length, 1);
  assert.equal(d[0].key, 'monthsGained');
  assert.deepEqual(d[0].before, ['5']);
  assert.deepEqual(d[0].after, ['7']);
});

test('diffMaps: detects added field', () => {
  const before = new Map();
  const after = new Map([['cost', ['3']]]);
  const d = diffMaps(before, after);
  assert.equal(d.length, 1);
  assert.equal(d[0].key, 'cost');
});

test('Edit on strategy: monthsGained change fires ask', () => {
  const oldS = '---\ntitle: x\nmonthsGained: 5\n---\n\nbody';
  const newS = '---\ntitle: x\nmonthsGained: 9\n---\n\nbody';
  const input = JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: 'src/content/strategies/x.md', old_string: oldS, new_string: newS },
  });
  const out = run(input);
  assert.equal(out.exitCode, 0);
  assert.ok(out.stdout);
  const parsed = JSON.parse(out.stdout);
  assert.equal(parsed.hookSpecificOutput.permissionDecision, 'ask');
  assert.match(parsed.hookSpecificOutput.permissionDecisionReason, /monthsGained/);
});

test('Edit on strategy: sourceUrl swap fires ask', () => {
  const oldS = '---\nsourceUrl: https://nier.go.jp/a\ntitle: x\n---\n';
  const newS = '---\nsourceUrl: https://wikipedia.org/b\ntitle: x\n---\n';
  const input = JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: 'src/content/strategies/x.md', old_string: oldS, new_string: newS },
  });
  const out = run(input);
  assert.equal(out.exitCode, 0);
  assert.ok(out.stdout);
  const parsed = JSON.parse(out.stdout);
  assert.match(parsed.hookSpecificOutput.permissionDecisionReason, /sourceUrl/);
});

test('Edit on strategy: prose-only change does not fire', () => {
  const oldS = '---\nmonthsGained: 5\n---\n\n本文の typo。';
  const newS = '---\nmonthsGained: 5\n---\n\n本文の typo を直した。';
  const input = JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: 'src/content/strategies/x.md', old_string: oldS, new_string: newS },
  });
  const out = run(input);
  assert.equal(out.exitCode, 0);
  assert.ok(!out.stdout);
});

test('Edit on strategy: title change does not fire (not protected)', () => {
  const oldS = '---\ntitle: 古い\nmonthsGained: 5\n---\n';
  const newS = '---\ntitle: 新しい\nmonthsGained: 5\n---\n';
  const input = JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: 'src/content/strategies/x.md', old_string: oldS, new_string: newS },
  });
  const out = run(input);
  assert.equal(out.exitCode, 0);
  assert.ok(!out.stdout);
});

test('Edit on non-content path: skips entirely', () => {
  const oldS = '---\nmonthsGained: 5\n---\n';
  const newS = '---\nmonthsGained: 9\n---\n';
  const input = JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: 'docs/decisions/0001.md', old_string: oldS, new_string: newS },
  });
  const out = run(input);
  assert.equal(out.exitCode, 0);
  assert.ok(!out.stdout);
});

test('Edit on column: lastVerified is not protected (allowed)', () => {
  const oldS = '---\ntitle: x\ndate: "2026-04-01"\nlastVerified: "2026-04-01"\n---\n';
  const newS = '---\ntitle: x\ndate: "2026-04-01"\nlastVerified: "2026-05-04"\n---\n';
  const input = JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: 'src/content/columns/y.md', old_string: oldS, new_string: newS },
  });
  const out = run(input);
  assert.equal(out.exitCode, 0);
  assert.ok(!out.stdout);
});

test('MultiEdit: any edit changing protected field fires', () => {
  const input = JSON.stringify({
    tool_name: 'MultiEdit',
    tool_input: {
      file_path: 'src/content/strategies/x.md',
      edits: [
        { old_string: '本文 typo', new_string: '本文 typo 直し' },
        {
          old_string: '---\nmonthsGained: 5\n---\n',
          new_string: '---\nmonthsGained: 7\n---\n',
        },
      ],
    },
  });
  const out = run(input);
  assert.equal(out.exitCode, 0);
  assert.ok(out.stdout);
  const parsed = JSON.parse(out.stdout);
  assert.match(parsed.hookSpecificOutput.permissionDecisionReason, /monthsGained/);
});

test('Quoted string values: quotes stripped from comparison', () => {
  const fm1 = captureProtectedFields('authors: "Nickow et al."');
  const fm2 = captureProtectedFields("authors: 'Nickow et al.'");
  assert.deepEqual(fm1.get('authors'), fm2.get('authors'));
});

test('Malformed JSON does not crash', () => {
  const out = run('not json');
  assert.equal(out.exitCode, 0);
});

test('Other tool names ignored', () => {
  const out = run(JSON.stringify({ tool_name: 'Bash', tool_input: {} }));
  assert.equal(out.exitCode, 0);
});

// --- 実際の Edit が送る形（`---` フェンス無し） -------------------------
//
// 2026-08-09 の独立レビューで見つかった回帰。既存テストは全て
// "---\nkey: v\n---" というフェンス付き文字列を与えていたため、
// evaluatePair が extractFrontmatter の失敗時に [] を返していたことに
// 誰も気づけなかった。実際の Edit の old_string / new_string は
// 編集した数行だけで、フェンスを含まないのが普通なので、
// **このガードは実運用でほぼ発火していなかった**。
//
// 姉妹リポの edu-watch は最初から fallback を持っていた。

const { PROTECTED_KEYS } = require('../pre-edit-frontmatter-immutable.cjs');

const editOn = (filePath, oldStr, newStr) =>
  JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: filePath, old_string: oldStr, new_string: newStr },
  });

const STRATEGY = 'src/content/strategies/x.md';
const fired = (out) =>
  out.exitCode === 2 || Boolean(out.stdout && out.stdout.includes('permissionDecision'));

test('フェンス無しの Edit チャンクでも保護フィールドの変更を検知する', () => {
  assert.equal(fired(run(editOn(STRATEGY, 'monthsGained: 5', 'monthsGained: 9'))), true);
});

// 期待するキーはここに直書きする。PROTECTED_KEYS をそのまま回すと、
// 実装からキーを 1 つ削っても for が短くなるだけでテストは緑のまま通る
// (実測: sampleSize を消しても 41/41 緑だった)。
const EXPECTED_PROTECTED_KEYS = [
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

test('保護キーの一覧が意図どおり(増減したらここも直す)', () => {
  assert.deepEqual([...PROTECTED_KEYS].sort(), [...EXPECTED_PROTECTED_KEYS].sort());
});

test('フェンス無しでも保護キー全てを検知する', () => {
  // 1 つでも漏れると、そのキーだけ黙って書き換えられる。
  for (const key of EXPECTED_PROTECTED_KEYS) {
    const out = run(editOn(STRATEGY, `${key}: 111`, `${key}: 222`));
    assert.equal(fired(out), true, `${key} が検知されていない`);
  }
});

test('リスト項目の形（"- key: v"）でも検知する', () => {
  assert.equal(fired(run(editOn(STRATEGY, '  - year: 2019', '  - year: 2021'))), true);
});

test('本文だけの編集は誤検知しない', () => {
  const out = run(editOn(STRATEGY, 'この指導法は有効です。', 'この指導法は有効でした。'));
  assert.equal(fired(out), false);
});

test('保護フィールドを含まない frontmatter の編集は誤検知しない', () => {
  const out = run(editOn(STRATEGY, 'title: むかしの題', 'title: あたらしい題'));
  assert.equal(fired(out), false);
});

test('対象外パスならフェンス無しでも素通りする', () => {
  const out = run(editOn('src/lib/util.ts', 'monthsGained: 5', 'monthsGained: 9'));
  assert.equal(fired(out), false);
});

// --- CLI 配線 -----------------------------------------------------------
// run() の戻り値だけを見ていると、それが exit code と stdout になる経路が
// 死んでも気づけない。フックは本番では子プロセスとして起動される。

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const HOOK = path.join(__dirname, '..', 'pre-edit-frontmatter-immutable.cjs');

const runCli = (payload) =>
  spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf8' });

test('CLI: 保護フィールドの変更で permissionDecision を stdout に出す', () => {
  const res = runCli(editOn(STRATEGY, 'monthsGained: 5', 'monthsGained: 9'));
  assert.equal(res.status, 0);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.hookSpecificOutput.permissionDecision, 'ask');
  assert.match(parsed.hookSpecificOutput.permissionDecisionReason, /monthsGained/);
});

test('CLI: 変更が無ければ何も出さずに 0 で終わる', () => {
  const res = runCli(editOn(STRATEGY, 'title: a', 'title: b'));
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), '');
});

test('CLI: 壊れた入力でも落ちない', () => {
  assert.equal(runCli('{not json').status, 0);
  assert.equal(runCli('').status, 0);
});
