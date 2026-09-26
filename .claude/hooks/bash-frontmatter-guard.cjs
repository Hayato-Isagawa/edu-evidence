#!/usr/bin/env node
/**
 * PreToolUse / PostToolUse / PostToolUseFailure hook (Bash) — frontmatter guard for Bash.
 *
 * pre-edit-frontmatter-immutable.cjs は Edit / Write / MultiEdit しか見ない。
 * 2026-09-24〜25 の EEF 同期では保護キーを `sed -i` / `python3` で書き換えており、
 * 確認が一度も出なかった(#666)。本ガードは同じ保護キーを Bash の側から見る。
 *
 * 網は 2 枚:
 *   - PreToolUse: コマンド文字列が書き換えの形なら ask(補助。取りこぼしも誤検知もある)
 *   - PreToolUse で全 worktree の保護キーを控え、PostToolUse / PostToolUseFailure で
 *     比べて、変化を Claude(additionalContext)とユーザー(systemMessage)へ出す(本命)
 *
 * `~` 起点のセッションではこのリポの settings.json が読まれない。その経路では、ユーザー環境の
 * グローバルなディスパッチャがこのファイルを呼ぶ。require を組み込みに限っているのは、
 * ディスパッチャの sha256 ピンが実行する 1 ファイルしか照合しないため。
 *
 * 既知の限界:
 *   - Post が発火しない経路(権限拒否。ユーザーによる中断では PostToolUse は発火しない)では
 *     照合しない
 *   - Post が書き換えの完了前に走る経路(run_in_background・タイムアウトによる自動
 *     バックグラウンド化)では照合が空振りする。事前 ask だけが効く
 *   - 並列の tool call・別セッションの編集・git の切り替えによる変化も、その Bash の
 *     変化として出る(安全側の誤報)
 *   - 事後なので取り消しはしない
 *   - 何が起きても exit 0。ディスパッチャ経由では exit 2 が全 Bash の停止になるため、
 *     失敗は systemMessage の警告で知らせる
 */

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// pre-edit-frontmatter-immutable.cjs の複製。一致はテストで固定している。
const PROTECTED_KEYS = [
  "sourceUrl",
  "monthsGained",
  "evidenceStrength",
  "cost",
  "cohensD",
  "strength",
  "studies",
  "sampleSize",
  "effectSize",
  "year",
  "authors",
  "url",
  "archivedAt",
];

const CONTENT_DIRS = ["src/content/strategies", "src/content/columns"];
const CONTENT_FILE_RE = /\.(md|mdx)$/i;

// 抽出の 3 関数(extractFrontmatter / valueAfterColon / captureProtectedFields)も
// pre-edit-frontmatter-immutable.cjs の複製(前置きの正規表現を `[ \t]*(?:-[ \t]*)?` に
// している理由は向こうのコメントにある)。一致はテストが実データ全件と合成入力で固定している。
const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/;

function extractFrontmatter(s) {
  if (!s) return null;
  const m = s.match(FRONTMATTER_RE);
  return m ? m[1] : null;
}

// 保護キーの値。旧 `key:[ \t]*(.+?)[ \t]*$` と同じ値を線形で取る: 前後の [ \t] を落とし、
// 空白だけの値は最後の 1 文字、空なら値なし。正規表現で `(.+?)` と `[ \t]*$` を隣り合わせると、
// 値の途中の長い空白で 2 乗になる(32KB で 2.3〜2.6 秒)。
function valueAfterColon(rest) {
  if (!rest) return null;
  const isBlank = (c) => c === " " || c === "\t";
  let i = 0;
  while (i < rest.length && isBlank(rest[i])) i++;
  if (i === rest.length) return rest[rest.length - 1];
  let j = rest.length;
  while (j > i && isBlank(rest[j - 1])) j--;
  return rest.slice(i, j);
}

function captureProtectedFields(fm) {
  if (!fm) return new Map();
  const map = new Map();
  for (const key of PROTECTED_KEYS) {
    const re = new RegExp(`^[ \\t]*(?:-[ \\t]*)?${key}:(.*)$`, "gm");
    const values = [];
    for (const m of fm.matchAll(re)) {
      const v = valueAfterColon(m[1]);
      if (v !== null) values.push(v.replace(/^["']|["']$/g, ""));
    }
    if (values.length) map.set(key, values);
  }
  return map;
}

// --- 事前 ask: コマンド文字列の補助の網 -----------------------------------
//
// 文字列の走査なので取りこぼしも誤検知も避けられない。取りこぼしは事後照合が拾う。
// 誤検知を抑えるため、コンテンツのパスを含み、かつ書き換えの形をしているときだけ ask する。

const CONTENT_PATH_RE = /content\/(?:strategies|columns)\b/;

// 引用符・空白・区切りを挟まずにコンテンツのパスへ続く 1 語
const CONTENT_WORD = String.raw`["']?[^\s"'|;&<>]*content\/(?:strategies|columns)`;

// インタプリタはパスを読むだけのことも多い。書き込み API の呼び出しがあり、その書き込み先が
// コンテンツ外の文字列リテラルと読めないときだけ書き換えの形とみなす。
const INTERPRETER_RE = /\b(?:python3?|node|ruby|deno|bun)\b/;
// 書き込み先が第 1 引数(open は第 2 引数が書き込みモードのときだけ。モードは 2 番目の捕獲)。
// 量指定子を隣り合わせない — 重なると長い空白で 2 乗・3 乗になり、5 秒のタイムアウトで ask が消える。
// open は先読みで捕獲し `open(` だけを消費する(モードの文字列の中にある次の open( を飲み込まない)。
const WRITE_TARGET_RES = [
  /\bopen\((?=([^,()]*),\s*(?:mode\s*=\s*)?["']([^"']*)["'])/g,
  /\b(?:writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream)\(\s*([^,()]*)/g,
  /\bFile\.write\(\s*([^,()]*)/g,
];
// 書き込み先を字面から取れない API(移動・置換の宛先が第 2 引数)
const OPAQUE_WRITE_RE =
  /\b(?:os\.replace|os\.rename|shutil\.(?:move|copy\w*))\(/;

/**
 * write_text / write_bytes の受け手(書き込み先)。呼び出し位置から後ろ向きに切り出す。
 * 受け手が `)` で終わるなら対応する `(` まで戻り(入れ子も数える)、その前の名前を含める。
 * 対応が取れない・名前が無いときは受け手とみなさない。
 */
function writeTextReceivers(segment) {
  const calls = [...segment.matchAll(/\.write_(?:text|bytes)\(/g)];
  if (!calls.length) return [];
  // 閉じ括弧ごとの対応する開き括弧を 1 回の走査で求める(呼び出しごとに後ろへ辿ると、
  // 入れ子の受け手で 2 乗になる)
  const openOf = new Map();
  const stack = [];
  for (let k = 0; k < segment.length; k++) {
    if (segment[k] === "(") stack.push(k);
    else if (segment[k] === ")" && stack.length) openOf.set(k, stack.pop());
  }
  const receivers = [];
  for (const m of calls) {
    let j = m.index;
    if (segment[j - 1] === ")") {
      if (!openOf.has(j - 1)) continue;
      j = openOf.get(j - 1);
    }
    let start = j;
    while (start > 0 && /[\w.]/.test(segment[start - 1])) start--;
    if (start < j) receivers.push(segment.slice(start, m.index));
  }
  return receivers;
}

function interpreterMayWriteContent(segment) {
  if (OPAQUE_WRITE_RE.test(segment)) return true;
  const targets = writeTextReceivers(segment);
  for (const re of WRITE_TARGET_RES) {
    for (const m of segment.matchAll(re)) {
      if (m[2] !== undefined && !/[wax+]/.test(m[2])) continue;
      targets.push(m[1].trim());
    }
  }
  return targets.some(
    (target) => !(/["']/.test(target) && !CONTENT_PATH_RE.test(target))
  );
}

/**
 * 制御演算子(`;` `&&` `||` `|` `&` 改行)で区切る。引用符の中と heredoc の本文は
 * 区切らない — 区切ると `python3 -c "a; b"` や heredoc の Python が別の区切りに散り、
 * インタプリタと書き込み先の対応が切れる。`2>&1` / `&>` の `&` はリダイレクト。
 */
function splitSegments(command) {
  const segments = [];
  const heredocs = [];
  let cur = "";
  let quote = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      cur += c;
      if (c === "\\" && quote === '"') cur += command[++i] ?? "";
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      cur += c;
      continue;
    }
    if (c === "\\") {
      cur += c + (command[++i] ?? "");
      continue;
    }
    const doc = command.slice(i).match(/^<<-?[ \t]*(['"]?)([A-Za-z_]\w*)\1/);
    if (doc && command[i - 1] !== "<") {
      heredocs.push(doc[2]);
      cur += doc[0];
      i += doc[0].length - 1;
      continue;
    }
    if (c === "\n" && heredocs.length) {
      // 本文を区切りの一部として取り込み、終端行まで進める
      let rest = command.slice(i + 1);
      cur += "\n";
      while (heredocs.length && rest) {
        const nl = rest.indexOf("\n");
        const line = nl === -1 ? rest : rest.slice(0, nl);
        cur += line + "\n";
        rest = nl === -1 ? "" : rest.slice(nl + 1);
        if (line.replace(/^\t+/, "") === heredocs[0]) heredocs.shift();
      }
      i = command.length - rest.length - 1;
      segments.push(cur);
      cur = "";
      continue;
    }
    const redirectAmp =
      c === "&" && (command[i - 1] === ">" || command[i + 1] === ">");
    if ((c === ";" || c === "|" || c === "&" || c === "\n") && !redirectAmp) {
      if ((c === "&" || c === "|") && command[i + 1] === c) i++;
      segments.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  segments.push(cur);
  return segments.map((s) => s.trim()).filter(Boolean);
}

/**
 * `sed` / `perl` の in-place 編集。正規表現にすると
 * `/\bsed\s+(?:[^|;&\n]*\s)?(?:-[A-Za-z]*i|--in-place)/` で、`\s+` と `[^|;&\n]*` が重なり
 * 長い空白で 2 乗になる。同じ集合を 1 回の走査で判定する: コマンド名の後の空白の連続の
 * 末尾 p から見て、直前が空白のフラグ f があり、[p, f-1) に | ; & 改行を含まない。
 */
function hasInPlaceFlag(segment, name, allowLong) {
  const starts = [
    ...segment.matchAll(new RegExp(String.raw`\b${name}(?=\s)`, "g")),
  ];
  if (!starts.length) return false;
  const n = segment.length;
  const isSpace = (c) => /\s/.test(c);
  const isLetter = (c) => /[A-Za-z]/.test(c);
  // 後ろから: 英字の連続に i があるか / 次のフラグ / 次の区切り
  const hasI = new Uint8Array(n + 1);
  const nextFlag = new Int32Array(n + 1).fill(-1);
  const nextBarrier = new Int32Array(n + 1).fill(n);
  for (let k = n - 1; k >= 0; k--) {
    const c = segment[k];
    hasI[k] = isLetter(c) && (c === "i" || hasI[k + 1]) ? 1 : 0;
    const flag =
      c === "-" &&
      k > 0 &&
      isSpace(segment[k - 1]) &&
      (hasI[k + 1] === 1 || (allowLong && segment.startsWith("--in-place", k)));
    nextFlag[k] = flag ? k : nextFlag[k + 1];
    nextBarrier[k] = "|;&\n".includes(c) ? k : nextBarrier[k + 1];
  }
  for (const m of starts) {
    let p = m.index + name.length;
    while (p < n && isSpace(segment[p])) p++;
    const f = nextFlag[p];
    if (f !== -1 && nextBarrier[p] >= f - 1) return true;
  }
  return false;
}

const WRITE_FORMS = [
  new RegExp(String.raw`\btee\s+(?:-\S+\s+)*${CONTENT_WORD}`),
  new RegExp(String.raw`>>?\s*${CONTENT_WORD}`),
  /\bgit\s+(?:-C\s+\S+\s+)?(?:checkout|restore|apply)\b/,
];

const MOVE_COMMANDS = new Set(["mv", "cp", "rsync", "install", "ln"]);

/** mv / cp などの宛先(最後の非オプション引数)がコンテンツか */
function movesIntoContent(segment) {
  const words = segment.split(/\s+/).filter(Boolean);
  if (!MOVE_COMMANDS.has(words[0])) return false;
  const args = words.slice(1).filter((w) => !w.startsWith("-"));
  return CONTENT_PATH_RE.test(args[args.length - 1] || "");
}

/**
 * 区切りごとに見る。コマンド全体で「パスがある」「書き換えの形がある」を別々に探すと、
 * `git checkout main && grep … src/content/…` のような読むだけの組み合わせで ask になり、
 * 無人の routine が承認待ちで止まる。
 */
function looksLikeContentWrite(command) {
  if (!CONTENT_PATH_RE.test(command)) return false;
  return splitSegments(command).some(
    (seg) =>
      CONTENT_PATH_RE.test(seg) &&
      (hasInPlaceFlag(seg, "sed", true) ||
        hasInPlaceFlag(seg, "perl", false) ||
        WRITE_FORMS.some((re) => re.test(seg)) ||
        (INTERPRETER_RE.test(seg) && interpreterMayWriteContent(seg)) ||
        movesIntoContent(seg))
  );
}

function preAskReason(command) {
  return [
    "[bash-frontmatter-guard] This command may rewrite src/content/(strategies|columns).",
    "Protected frontmatter keys (effect sizes, strengths, primary research URLs) are",
    "confirmed on Edit / Write; a Bash rewrite skips that check. Prefer the Edit tool,",
    "or confirm a primary research source before approving.",
    "",
    `command: ${command.length > 300 ? command.slice(0, 297) + "..." : command}`,
  ].join("\n");
}

// --- 事後照合: Pre で保護キーを控え、Post / PostToolUseFailure で比べる --------
//
// 書き方(sed / python / スクリプト経由)に依存しない本命の網。事後なので取り消しは
// しない。書き換えを Claude とユーザーの両方に知らせる。

const DEFAULT_STATE_DIR = path.join(os.tmpdir(), "edu-evidence-fm-guard");
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const STALE_MS = 24 * 60 * 60 * 1000;
const MESSAGE_LIMIT = 9000;

/**
 * 照合する worktree の一覧。メインだけでなく `.claude/worktrees/*` などの
 * worktree の中の書き換えも拾う。git が失敗したらメインだけを見て警告する。
 */
function listWorktrees(root) {
  const res = spawnSync(
    "git",
    ["-C", root, "worktree", "list", "--porcelain"],
    {
      encoding: "utf8",
      timeout: 2000,
      env: {
        PATH: process.env.PATH || "",
        HOME: os.homedir(),
        GIT_OPTIONAL_LOCKS: "0",
      },
    }
  );
  if (res.status !== 0) {
    return {
      roots: [root],
      warning: `git worktree list failed (${res.error?.code || `status ${res.status}`}); checked ${root} only.`,
    };
  }
  const roots = [...res.stdout.matchAll(/^worktree (.+)$/gm)].map((m) => m[1]);
  return { roots: roots.length ? roots : [root] };
}

/** 全 worktree のコンテンツの保護キー。キーは絶対パス、値は { key: [values] } */
function takeSnapshot(root) {
  const { roots, warning } = listWorktrees(root);
  const files = {};
  for (const wt of roots) {
    for (const dir of CONTENT_DIRS) {
      let names;
      try {
        names = fs.readdirSync(path.join(wt, dir));
      } catch {
        continue; // 消えた worktree・コンテンツの無いブランチ
      }
      for (const name of names) {
        if (!CONTENT_FILE_RE.test(name)) continue;
        const abs = path.join(wt, dir, name);
        let text;
        try {
          text = fs.readFileSync(abs, "utf8");
        } catch {
          continue;
        }
        files[abs] = Object.fromEntries(
          captureProtectedFields(extractFrontmatter(text))
        );
      }
    }
  }
  return { snapshot: { worktrees: roots, files }, warning };
}

/** 変化の一覧。消えたファイルは値の変化ではないので数えない。既存 worktree の新規ファイルは数える */
function diffSnapshots(before, after) {
  const changes = [];
  for (const [abs, fields] of Object.entries(after.files)) {
    let prev = before.files[abs];
    if (!prev) {
      // 帰属は最長一致で決める。メインは `.claude/worktrees/*` の接頭辞でもあるので、
      // 前方一致だけだと、Bash で作った worktree の全ファイルがメインの新規ファイルに化ける
      const owner = after.worktrees
        .filter((wt) => abs.startsWith(wt + path.sep))
        .sort((a, b) => b.length - a.length)[0];
      if (!owner || !before.worktrees.includes(owner)) continue;
      prev = {};
    }
    for (const key of new Set([...Object.keys(prev), ...Object.keys(fields)])) {
      const b = prev[key] ?? [];
      const a = fields[key] ?? [];
      if (JSON.stringify(b) !== JSON.stringify(a))
        changes.push({ file: abs, key, before: b, after: a });
    }
  }
  return changes;
}

/** 自分だけが読み書きできるディレクトリであることを確かめる。満たさなければ throw */
function ensureStateDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const st = fs.lstatSync(dir);
  if (!st.isDirectory()) throw new Error(`${dir} is not a directory`);
  if (typeof process.getuid === "function" && st.uid !== process.getuid())
    throw new Error(`${dir} is owned by another user`);
  if (st.mode & 0o077) throw new Error(`${dir} is accessible by others`);
}

function removeStale(dir, now) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    try {
      if (now - fs.lstatSync(p).mtimeMs > STALE_MS) fs.unlinkSync(p);
    } catch {
      // 並行するセッションが先に消した
    }
  }
}

function snapshotPath(dir, input) {
  const session = String(input?.session_id ?? "");
  const toolUse = String(input?.tool_use_id ?? "");
  if (!ID_RE.test(session) || !ID_RE.test(toolUse)) return null;
  return path.join(dir, `${session}-${toolUse}.json`);
}

function saveSnapshot(dir, input, root, now) {
  const p = snapshotPath(dir, input);
  if (!p)
    return "session_id / tool_use_id missing or malformed; not snapshotted.";
  ensureStateDir(dir);
  removeStale(dir, now);
  const { snapshot, warning } = takeSnapshot(root);
  const body = JSON.stringify(snapshot);
  try {
    fs.writeFileSync(p, body, { flag: "wx", mode: 0o600 });
  } catch (e) {
    if (e?.code !== "EEXIST") throw e;
    fs.unlinkSync(p);
    fs.writeFileSync(p, body, { flag: "wx", mode: 0o600 });
  }
  return warning;
}

/** 控えを読んで消す。無ければ null */
function loadSnapshot(dir, input) {
  const p = snapshotPath(dir, input);
  if (!p) return null;
  let st;
  try {
    st = fs.lstatSync(p);
  } catch {
    return null;
  }
  if (!st.isFile()) return null;
  const body = fs.readFileSync(p, "utf8");
  fs.unlinkSync(p);
  return JSON.parse(body);
}

const fmtValues = (arr) =>
  arr.length
    ? arr.map((v) => (v.length > 60 ? v.slice(0, 57) + "..." : v)).join(" | ")
    : "∅";

function describeChanges(changes, root) {
  const shown = (file) => {
    const rel = path.relative(root, file);
    return rel.startsWith("..") ? file : rel;
  };
  // 件数とファイル一覧を先に出す。詳細が長くて切り詰められても、どこが変わったかは残る
  const files = [...new Set(changes.map((c) => shown(c.file)))];
  const lines = [
    `[bash-frontmatter-guard] ${changes.length} protected frontmatter value(s) changed in ${files.length} file(s) during this Bash command:`,
    `  ${files.join(", ")}`,
    "",
  ];
  for (const c of changes) {
    lines.push(`  ${shown(c.file)} ${c.key}:`);
    lines.push(`    before: ${fmtValues(c.before)}`);
    lines.push(`    after:  ${fmtValues(c.after)}`);
  }
  lines.push(
    "",
    "Edit / Write would have asked for confirmation. Check each value against a primary",
    "research source (CONTENT_GUIDELINES Rule 1.2b) and tell the user what changed.",
    "Changes from a parallel tool call, another session or a git checkout are reported here too."
  );
  return lines.join("\n");
}

const clip = (s) =>
  s.length > MESSAGE_LIMIT
    ? s.slice(0, MESSAGE_LIMIT - 20) + "\n...(truncated)"
    : s;

const warn = (s) => `[bash-frontmatter-guard] ${s}`;

/**
 * 出力は 1 つの JSON にまとめる(行を分けると全体がパース失敗になり ask ごと消える)。
 * Post では `additionalContext`(Claude へ。PostToolUseFailure が受け付ける唯一の
 * 判定フィールド)と `systemMessage`(ユーザーへ)に同じ文を載せる。
 */
function output(event, { ask, messages }) {
  const out = {};
  const text = clip(messages.join("\n\n"));
  if (event === "PreToolUse") {
    if (ask)
      out.hookSpecificOutput = {
        hookEventName: event,
        permissionDecision: "ask",
        permissionDecisionReason: ask,
      };
    if (text) out.systemMessage = text;
  } else if (text) {
    out.systemMessage = text;
    out.hookSpecificOutput = { hookEventName: event, additionalContext: text };
  }
  return Object.keys(out).length
    ? { exitCode: 0, stdout: JSON.stringify(out) }
    : { exitCode: 0 };
}

function run(inputOrRaw, options = {}) {
  let input;
  try {
    input =
      typeof inputOrRaw === "string"
        ? inputOrRaw.trim()
          ? JSON.parse(inputOrRaw)
          : {}
        : inputOrRaw || {};
  } catch {
    return { exitCode: 0 };
  }
  if (String(input?.tool_name || "") !== "Bash") return { exitCode: 0 };
  const event = String(input?.hook_event_name || "");
  if (!["PreToolUse", "PostToolUse", "PostToolUseFailure"].includes(event))
    return { exitCode: 0 };

  const command = String(input?.tool_input?.command || "");
  const stateDir = options.stateDir ?? DEFAULT_STATE_DIR;
  const now = options.now ?? Date.now();
  const messages = [];
  let root;
  try {
    root = fs.realpathSync(options.root ?? path.resolve(__dirname, "..", ".."));
  } catch (e) {
    messages.push(
      warn(`could not resolve the repository root (${e?.message || e}).`)
    );
  }

  if (event === "PreToolUse") {
    if (root) {
      try {
        const w = saveSnapshot(stateDir, input, root, now);
        if (w) messages.push(warn(w));
      } catch (e) {
        messages.push(
          warn(`could not snapshot protected keys (${e?.message || e}).`)
        );
      }
    }
    const ask = looksLikeContentWrite(command) ? preAskReason(command) : null;
    return output(event, { ask, messages });
  }

  if (root) {
    try {
      const before = loadSnapshot(stateDir, input);
      if (!before) {
        messages.push(
          warn(
            "no snapshot from PreToolUse; protected keys were not verified for this command."
          )
        );
      } else {
        const { snapshot: after, warning } = takeSnapshot(root);
        if (warning) messages.push(warn(warning));
        const changes = diffSnapshots(before, after);
        if (changes.length) messages.push(describeChanges(changes, root));
      }
    } catch (e) {
      messages.push(
        warn(`could not verify protected keys (${e?.message || e}).`)
      );
    }
  }
  return output(event, { messages });
}

module.exports = {
  run,
  PROTECTED_KEYS,
  CONTENT_DIRS,
  extractFrontmatter,
  captureProtectedFields,
  looksLikeContentWrite,
  takeSnapshot,
};

if (require.main === module) {
  let data = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => {
    data += c;
  });
  process.stdin.on("end", () => {
    let out;
    try {
      out = run(data);
    } catch (e) {
      // 何が起きても Bash を止めない(exit 2 は全 Bash の停止になる)。黙りもしない。
      out = {
        exitCode: 0,
        stdout: JSON.stringify({
          systemMessage: warn(
            `crashed; nothing was verified (${e?.message || e}).`
          ),
        }),
      };
    }
    if (out.stdout) process.stdout.write(out.stdout);
    // `process.exit()` にしない。stdout がパイプのとき書き残しが捨てられ、判定 JSON が
    // 64KiB で切れる(pre-edit-frontmatter-immutable.cjs の同じ箇所を参照)。
    process.exitCode = 0;
  });
}
