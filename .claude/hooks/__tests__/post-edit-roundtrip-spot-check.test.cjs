'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { run, extractTokens, diffTokens, TARGET_PATH_RE } =
  require('../post-edit-roundtrip-spot-check.cjs');

test('TARGET_PATH_RE: src/content paths fire', () => {
  assert.match('src/content/strategies/x.md', TARGET_PATH_RE);
  assert.match('src/content/columns/y.md', TARGET_PATH_RE);
});

test('TARGET_PATH_RE: code paths skip', () => {
  assert.doesNotMatch('src/lib/util.ts', TARGET_PATH_RE);
});

test('extractTokens: ignores single-digit numbers', () => {
  const t = extractTokens('a 1 b 12 c 100');
  assert.deepEqual([...t.number].sort(), ['100', '12']);
});

test('extractTokens: strips DP-ids before number extraction', () => {
  const t = extractTokens('DP24-1 effect d=0.42 N=200');
  assert.deepEqual([...t.dp_id], ['DP24-1']);
  assert.ok(![...t.number].includes('1'));
  assert.deepEqual([...t.number].sort(), ['0.42', '200']);
});

test('PostToolUse: numeric body change emits additionalContext', () => {
  const oldS = '効果量は d=0.42 でした。N=200 のサンプル。';
  const newS = '効果量は d=0.81 でした。N=800 のサンプル。';
  const input = JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: 'src/content/strategies/x.md', old_string: oldS, new_string: newS },
  });
  const out = run(input);
  assert.equal(out.exitCode, 0);
  assert.ok(out.stdout);
  const parsed = JSON.parse(out.stdout);
  assert.equal(parsed.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(parsed.hookSpecificOutput.additionalContext, /effect_size/);
  assert.match(parsed.hookSpecificOutput.additionalContext, /number/);
});

test('PostToolUse: stderr remains empty (user not spammed)', () => {
  const oldS = 'd=0.42';
  const newS = 'd=0.81';
  const input = JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: 'src/content/strategies/x.md', old_string: oldS, new_string: newS },
  });
  const out = run(input);
  assert.ok(!out.stderr);
});

test('PostToolUse: prose-only change emits nothing', () => {
  const oldS = '本文の typo';
  const newS = '本文の typo 直し';
  const input = JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: 'src/content/strategies/x.md', old_string: oldS, new_string: newS },
  });
  const out = run(input);
  assert.equal(out.exitCode, 0);
  assert.ok(!out.stdout);
});

test('PostToolUse: code path skips even with numeric change', () => {
  const oldS = 'const N = 200';
  const newS = 'const N = 800';
  const input = JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: 'src/lib/util.ts', old_string: oldS, new_string: newS },
  });
  const out = run(input);
  assert.equal(out.exitCode, 0);
  assert.ok(!out.stdout);
});

test('PostToolUse: URL change in body fires', () => {
  const oldS = 'see https://nier.go.jp/source';
  const newS = 'see https://wikipedia.org/article';
  const input = JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: 'src/content/columns/y.md', old_string: oldS, new_string: newS },
  });
  const out = run(input);
  assert.equal(out.exitCode, 0);
  const parsed = JSON.parse(out.stdout);
  assert.match(parsed.hookSpecificOutput.additionalContext, /url/);
});

test('PostToolUse: DP-id renumber fires', () => {
  const oldS = 'DP25-029 study';
  const newS = 'DP25-099 study';
  const input = JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: 'src/content/strategies/x.md', old_string: oldS, new_string: newS },
  });
  const out = run(input);
  const parsed = JSON.parse(out.stdout);
  assert.match(parsed.hookSpecificOutput.additionalContext, /dp_id/);
});

test('MultiEdit: aggregates token diffs across edits', () => {
  const input = JSON.stringify({
    tool_name: 'MultiEdit',
    tool_input: {
      file_path: 'src/content/strategies/x.md',
      edits: [
        { old_string: 'foo', new_string: 'bar' },
        { old_string: 'N=200', new_string: 'N=800' },
      ],
    },
  });
  const out = run(input);
  assert.ok(out.stdout);
  const parsed = JSON.parse(out.stdout);
  assert.match(parsed.hookSpecificOutput.additionalContext, /number/);
});

test('Other tool names ignored', () => {
  const out = run(JSON.stringify({ tool_name: 'Write', tool_input: {} }));
  assert.equal(out.exitCode, 0);
  assert.ok(!out.stdout);
});

test('Malformed JSON does not crash', () => {
  const out = run('not json');
  assert.equal(out.exitCode, 0);
});

test('diffTokens: no-op returns empty', () => {
  assert.deepEqual(diffTokens('hello', 'hello'), []);
});
