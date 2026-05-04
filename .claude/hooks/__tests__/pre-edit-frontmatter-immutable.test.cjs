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
