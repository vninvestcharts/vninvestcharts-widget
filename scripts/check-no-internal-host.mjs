#!/usr/bin/env node
"use strict";
/* A4 (open-core): public repo must not leak internal hosts.
 * Patterns: 14.225.255.47, root@, /opt/edusuccess, docker.edusuccess.vn, saas.edusuccess.vn
 * Usage: node scripts/check-no-internal-host.mjs [--dir <path>] [--scope auto|private|public] [--self-test]
 * Exit 0 = clean (or private-scope skip). Exit 1 = leak found (public scope).
 * Error codes (L-G09): A4-NO-INTERNAL-HOST-01 — internal host leak.
 * Scope (O3): like check-public-tree — private trees print would-be hits and
 * exit 0 with SKIPPED-ON-PRIVATE instead of turning the matrix red.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dirIdx = process.argv.indexOf("--dir");
const TARGET = path.resolve(ROOT, dirIdx >= 0 ? process.argv[dirIdx + 1] : "src");
const scopeIdx = process.argv.indexOf("--scope");
const SCOPE_ARG = scopeIdx >= 0 ? process.argv[scopeIdx + 1] : "auto";

const CODE = "A4-NO-INTERNAL-HOST-01";

function resolveScope() {
	if (SCOPE_ARG === "private" || SCOPE_ARG === "public") return SCOPE_ARG;
	return fs.existsSync(path.join(ROOT, "packages", "vn-kline-widget-pro")) ? "private" : "public";
}

if (process.argv.includes("--self-test")) {
  selfTest();
}

/** L-E06/L-G09: self-test spawns THIS script as a child on temp fixtures and
 * asserts the exit AND the reason code. */
function selfTest() {
  const script = fileURLToPath(import.meta.url);
  const runChild = (args) => spawnSync(process.execPath, [script, ...args], { cwd: ROOT, encoding: "utf8" });
  const cases = [];

  const clean = fs.mkdtempSync(path.join(os.tmpdir(), "nohost-good-"));
  fs.writeFileSync(path.join(clean, "a.ts"), "export const x = 1;\n");
  const r1 = runChild(["--dir", clean, "--scope", "public"]);
  cases.push({
    name: "clean-public",
    pass: r1.status === 0 && (r1.stdout + r1.stderr).includes("PASS: no internal host leak"),
    detail: `exit=${r1.status}`,
  });

  const dirty = fs.mkdtempSync(path.join(os.tmpdir(), "nohost-bad-"));
  fs.writeFileSync(path.join(dirty, "b.ts"), "const host = 'https://docker.edusuccess.vn/api';\n");
  const r2 = runChild(["--dir", dirty, "--scope", "public"]);
  cases.push({
    name: "leak-public",
    pass: r2.status === 1 && (r2.stdout + r2.stderr).includes(CODE),
    detail: `exit=${r2.status}`,
  });

  const r3 = runChild(["--dir", dirty, "--scope", "private"]);
  cases.push({
    name: "leak-private-skipped",
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
  console.log(`\ncheck-no-internal-host SELF-TEST ${failed === 0 ? "PASS" : "FAIL"}: ${cases.length - failed}/${cases.length} cases`);
  process.exit(failed === 0 ? 0 : 1);
}

const PATTERNS = [
  /14\.225\.255\.47/,
  /root@/,
  /\/opt\/edusuccess/,
  /docker\.edusuccess\.vn/,
  /saas\.edusuccess\.vn/,
];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".git" || e.name === "dist") continue;
      walk(p, files);
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs|md|yml|yaml|json|conf|sh|env|txt)$/.test(e.name)) {
      files.push(p);
    }
  }
  return files;
}

const offenders = [];
for (const f of walk(TARGET)) {
  const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const re of PATTERNS) {
      if (re.test(lines[i])) {
        offenders.push({ file: path.relative(ROOT, f).replace(/\\/g, "/"), line: i + 1, text: lines[i].trim().slice(0, 120), pattern: re.source });
        break;
      }
    }
  }
}

console.log(`check-no-internal-host: scanned ${walk(TARGET).length} file(s) under ${path.relative(ROOT, TARGET) || "."}`);
const scope = resolveScope();
console.log(`check-no-internal-host: scope=${scope}`);
if (offenders.length) {
  if (scope === "private") {
    console.log(`SKIPPED-ON-PRIVATE: ${offenders.length} would-be violation(s) [${CODE}]:`);
    for (const o of offenders.slice(0, 50)) console.log(`  ${o.file}:${o.line}  [${o.pattern}]  ${o.text}`);
    process.exit(0);
  }
  console.error(`\nFATAL [${CODE}]: ${offenders.length} internal-host leak(s):`);
  for (const o of offenders.slice(0, 50)) console.error(`  ${o.file}:${o.line}  [${o.pattern}]  ${o.text}`);
  if (offenders.length > 50) console.error(`  ... and ${offenders.length - 50} more`);
  process.exit(1);
}
console.log("PASS: no internal host leak");
process.exit(0);