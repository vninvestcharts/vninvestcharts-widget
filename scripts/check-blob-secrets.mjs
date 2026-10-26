#!/usr/bin/env node
"use strict";
/* A4 (open-core): scan ALL reachable git blobs for leaked secrets.
 * Patterns: npm_  ghp_  github_pat_  sk-  BEGIN ... PRIVATE KEY  vni1.
 * Usage: node scripts/check-blob-secrets.mjs [--repo <path>] [--scope auto|private|public] [--self-test]
 * Exit 0 = clean (or private-scope skip). Exit 1 = secret found (public scope).
 * Exit 2 = infrastructure failure (git failed).
 * Error codes (L-G09): A4-BLOB-SECRETS-01 — secret-bearing blob reachable.
 * Scope (O3): like check-public-tree — private trees print would-be hits and
 * exit 0 with SKIPPED-ON-PRIVATE instead of turning the matrix red.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoIdx = process.argv.indexOf("--repo");
const REPO = path.resolve(ROOT, repoIdx >= 0 ? process.argv[repoIdx + 1] : ".");
const scopeIdx = process.argv.indexOf("--scope");
const SCOPE_ARG = scopeIdx >= 0 ? process.argv[scopeIdx + 1] : "auto";

const CODE = "A4-BLOB-SECRETS-01";

function resolveScope() {
	if (SCOPE_ARG === "private" || SCOPE_ARG === "public") return SCOPE_ARG;
	return fs.existsSync(path.join(ROOT, "packages", "vn-kline-widget-pro")) ? "private" : "public";
}

const PATTERNS = [
  /npm_[A-Za-z0-9]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /BEGIN [A-Z ]*PRIVATE KEY/,
  /vni1\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{30,}/,
];

function scanRepo(repo) {
let blobs = [];
try {
  const out = execFileSync("git", ["rev-list", "--objects", "--all"], { cwd: repo, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const seen = new Set();
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^([0-9a-f]{40})\s/);
    if (m && !seen.has(m[1])) { seen.add(m[1]); blobs.push(m[1]); }
  }
} catch (e) {
  console.error("check-blob-secrets: git rev-list failed:", e.message);
  process.exit(2);
}

console.log(`check-blob-secrets: scanning ${blobs.length} reachable blob(s)`);

const hits = [];
const BATCH = 200;
for (let i = 0; i < blobs.length; i += BATCH) {
  const chunk = blobs.slice(i, i + BATCH);
  let data = "";
  try {
    data = execFileSync("git", ["cat-file", "--batch"], { cwd: repo, input: chunk.join("\n") + "\n", encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  } catch (e) {
    console.error("check-blob-secrets: cat-file failed:", e.message);
    process.exit(2);
  }
  // Parse batch output: "<sha> <type> <size>\n<content>\n"
  const lines = data.split(/\n/);
  let idx = 0;
  for (const sha of chunk) {
    // find header
    while (idx < lines.length && !lines[idx].startsWith(sha + " ")) idx++;
    if (idx >= lines.length) { idx++; continue; }
    const header = lines[idx];
    const parts = header.split(" ");
    const type = parts[1];
    const size = parseInt(parts[2], 10);
    idx++;
    if (type !== "blob" || !Number.isFinite(size) || size === 0 || size > 2 * 1024 * 1024) {
      // skip large/non-blob; advance idx by ceil(size/line) approximated by scanning for next header
      // We'll just skip content by advancing until next "<40hex> " header
      while (idx < lines.length && !/^[0-9a-f]{40} /.test(lines[idx])) idx++;
      continue;
    }
    const content = lines.slice(idx, idx + Math.ceil(size / 1)).join("\n").slice(0, size);
    for (const re of PATTERNS) {
      if (re.test(content)) {
        hits.push({ sha, pattern: re.source });
        break;
      }
    }
    // advance
    while (idx < lines.length && !/^[0-9a-f]{40} /.test(lines[idx])) idx++;
  }
}

if (hits.length) {
  return { scanned: blobs.length, hits };
}
return { scanned: blobs.length, hits: [] };
} // end scanRepo

function report(scope, result) {
  console.log(`check-blob-secrets: scanned ${result.scanned} reachable blob(s) [scope=${scope}]`);
  if (!result.hits.length) {
    console.log("PASS: no secret-bearing blob reachable");
    return 0;
  }
  if (scope === "private") {
    console.log(`SKIPPED-ON-PRIVATE: ${result.hits.length} would-be violation(s) [${CODE}]:`);
    for (const h of result.hits.slice(0, 50)) console.log(`  ${h.sha}  [${h.pattern}]`);
    return 0;
  }
  console.error(`\nFATAL [${CODE}]: ${result.hits.length} secret-bearing blob(s) reachable in git history:`);
  for (const h of result.hits.slice(0, 50)) console.error(`  ${h.sha}  [${h.pattern}]`);
  if (result.hits.length > 50) console.error(`  ... and ${result.hits.length - 50} more`);
  console.error("\nScrub git history (G0-2) before publishing. Do NOT force-push; use a fresh repo.");
  return 1;
}

/** L-E06/L-G09: self-test builds a throwaway git repo and spawns THIS script
 * as a child, asserting exit AND reason code. */
function selfTest() {
  const script = fileURLToPath(import.meta.url);
  const runChild = (args, cwd) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });
  const git = (args, cwd) => spawnSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const cases = [];

  const mkRepo = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blobsec-"));
    git(["-c", "init.defaultBranch=main", "init"], dir);
    git(["config", "user.email", "gate@test"], dir);
    git(["config", "user.name", "gate"], dir);
    return dir;
  };
  const commitFile = (dir, name, content) => {
    fs.writeFileSync(path.join(dir, name), content);
    git(["add", name], dir);
    git(["commit", "-m", "t", "--quiet"], dir);
  };

  // Case 1 (positive): clean repo → exit 0 + PASS.
  const clean = mkRepo();
  commitFile(clean, "ok.txt", "nothing secret here\n");
  const r1 = runChild(["--repo", clean, "--scope", "public"], ROOT);
  cases.push({
    name: "clean-public",
    pass: r1.status === 0 && (r1.stdout + r1.stderr).includes("PASS: no secret-bearing blob"),
    detail: `exit=${r1.status}`,
  });

  // Case 2 (negative): fake npm_ token committed → exit 1 + code.
  const dirty = mkRepo();
  commitFile(dirty, "leak.txt", "token=" + "npm_" + "abcdefghijklmnopqrstuvwxyz0123456789\n");
  const r2 = runChild(["--repo", dirty, "--scope", "public"], ROOT);
  cases.push({
    name: "secret-public",
    pass: r2.status === 1 && (r2.stdout + r2.stderr).includes(CODE),
    detail: `exit=${r2.status}`,
  });

  // Case 3 (scope): same dirty repo in private scope → exit 0 + marker.
  const r3 = runChild(["--repo", dirty, "--scope", "private"], ROOT);
  cases.push({
    name: "secret-private-skipped",
    pass: r3.status === 0 && (r3.stdout + r3.stderr).includes("SKIPPED-ON-PRIVATE"),
    detail: `exit=${r3.status}`,
  });

  fs.rmSync(clean, { recursive: true, force: true });
  fs.rmSync(dirty, { recursive: true, force: true });

  let failed = 0;
  for (const c of cases) {
    console.log(`${c.pass ? "PASS" : "FAIL"}  self-test/${c.name} (${c.detail})`);
    if (!c.pass) failed++;
  }
  console.log(`\ncheck-blob-secrets SELF-TEST ${failed === 0 ? "PASS" : "FAIL"}: ${cases.length - failed}/${cases.length} cases`);
  process.exit(failed === 0 ? 0 : 1);
}

if (process.argv.includes("--self-test")) {
  selfTest();
}

process.exit(report(resolveScope(), scanRepo(REPO)));