/**
 * package.json の packageManager が、.tool-versions の Node に同梱の npm と一致しているかを見る。
 *
 * Workers Builds の npm は packageManager でしか変わらない(CLAUDE.md「環境」)。Node を上げて
 * packageManager を上げ忘れても、CI は .tool-versions の Node の npm で動くので緑のまま、
 * Workers Builds だけが別の npm で動く。
 *
 * 同梱の npm は、いま動いている Node の `npm -v` で取る。比べる前に、いま動いている Node が
 * .tool-versions の版であることを確かめる(CI では setup-node が .tool-versions の Node を入れる)。
 *
 *   npx tsx scripts/check-package-manager.ts
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  packageManager?: unknown;
};
const pm = pkg.packageManager;
const pmMatch =
  typeof pm === "string" ? /^npm@(\d+\.\d+\.\d+)$/.exec(pm) : null;
if (!pmMatch) {
  fail(
    `package.json の packageManager が npm@<x.y.z> の形ではない: ${JSON.stringify(pm)}`
  );
}
const pmVersion = pmMatch[1];

let toolVersions: string;
try {
  toolVersions = readFileSync(".tool-versions", "utf8");
} catch {
  fail(".tool-versions を読めない");
}
const nodeMatch = /^nodejs[ \t]+(\S+)[ \t]*$/m.exec(toolVersions);
if (!nodeMatch) {
  fail(".tool-versions に nodejs の行が無い");
}
const nodeVersion = process.versions.node;
if (nodeMatch[1] !== nodeVersion) {
  fail(
    `いま動いている Node (${nodeVersion}) が .tool-versions の nodejs ${nodeMatch[1]} と違う。` +
      "同梱の npm と比べる前提が崩れているので、.tool-versions の Node で走らせ直す"
  );
}

const r = spawnSync("npm", ["-v"], { encoding: "utf8" });
if (r.error || r.status !== 0) {
  fail(`npm -v を実行できない: ${r.error?.message ?? r.stderr}`);
}
const bundled = r.stdout.trim();
if (bundled !== pmVersion) {
  fail(
    `package.json の packageManager (npm@${pmVersion}) が、Node ${nodeVersion} の npm (${bundled}) と違う。` +
      "packageManager を、nodejs.org の dist/index.json でこの Node の npm 欄にある版に合わせる" +
      "(手元で npm を別に入れ替えていると、手元だけここで落ちる)"
  );
}

console.log(
  `✓ packageManager (npm@${pmVersion}) は Node ${nodeVersion} の npm と一致`
);
