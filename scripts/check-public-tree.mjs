#!/usr/bin/env node
"use strict";
/* A4 (open-core): public repo must not contain denylisted paths.
 * Usage: node scripts/check-public-tree.mjs [--root <path>] [--scope auto|private|public] [--self-test]
 * Exit 0 = clean (or private-scope skip). Exit 1 = denylisted path present (public scope).
 * Error codes (L-G09: negative cases assert the CODE, not just the exit):
 *   A4-PUBLIC-TREE-01 — denylisted path present in public scope.
 * Scope (O3): `auto` = private when packages/vn-kline-widget-pro/ exists
 * (override with --scope). Private scope prints would-be hits and exits 0
 * with a SKIPPED-ON-PRIVATE marker — the gate still runs on private trees,
 * it just never turns the matrix red there.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootIdx = process.argv.indexOf("--root");
const TARGET = path.resolve(ROOT, rootIdx >= 0 ? process.argv[rootIdx + 1] : ".");
const scopeIdx = process.argv.indexOf("--scope");
const SCOPE_ARG = scopeIdx >= 0 ? process.argv[scopeIdx + 1] : "auto";

const CODE = "A4-PUBLIC-TREE-01";

/** Resolve effective scope: explicit flag wins; auto sniffs the private marker. */
function resolveScope() {
	if (SCOPE_ARG === "private" || SCOPE_ARG === "public") return SCOPE_ARG;
	return fs.existsSync(path.join(ROOT, "packages", "vn-kline-widget-pro")) ? "private" : "public";
}

// Denylist (playbook A1). Matching is by path relative to TARGET.
const DENY = [
  "docs",
  "embed-demo",
  "audit",
  "plans",
  ".tours",
  "deploy/CHARTS-TEST.md",
  "deploy/docker-compose.charts-test.yml",
  "docker-compose.prod.yml",
  "images",
  "videos",
  "todo.md",
  "SESSION_ANCHOR.md",
  "ANCHORED_SUMMARY.md",
  "AUDIT_REPORT_2026-09-24.md",
  "BLACKBOX.md",
  ".blackboxrules",
  ".blackboxcli",
  "implementation_plan.md",
];

function existsRel(rel) {
  return fs.existsSync(path.join(TARGET, rel));
}

const hits = [];
for (const d of DENY) {
  if (existsRel(d)) hits.push(d);
}

function report(scope) {
  console.log(`check-public-tree: scanned ${DENY.length} denylisted path(s) under ${path.relative(ROOT, TARGET) || "."} [scope=${scope}]`);
  if (!hits.length) {
    console.log("PASS: no denylisted path present");
    return 0;
  }
  if (scope === "private") {
    console.log(`SKIPPED-ON-PRIVATE: ${hits.length} would-be violation(s) [${CODE}]:`);
    for (const h of hits) console.log(`  ${h}`);
    return 0;
  }
  console.error(`\nFATAL [${CODE}]: ${hits.length} denylisted path(s) present in public tree:`);
  for (const h of hits) console.error(`  ${h}`);
  return 1;
}

/** L-E06/L-G09: self-test spawns THIS script as a child on temp fixtures and
 * asserts the exit AND the reason code — never just "exit !== 0". */
function selfTest() {
  const script = fileURLToPath(import.meta.url);
  const cases = [];
  const runChild = (args, cwd) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });

  // Case 1 (negative): violation dir in public scope → exit 1 + code.
  const bad = fs.mkdtempSync(path.join(os.tmpdir(), "pubtree-bad-"));
  fs.mkdirSync(path.join(bad, "docs"), { recursive: true });
  fs.writeFileSync(path.join(bad, "todo.md"), "x");
  const r1 = runChild(["--root", bad, "--scope", "public"], ROOT);
  cases.push({
    name: "violation-public",
    pass: r1.status === 1 && (r1.stderr + r1.stdout).includes(CODE),
    detail: `exit=${r1.status}`,
  });

  // Case 2 (positive): clean dir → exit 0 + PASS.
  const good = fs.mkdtempSync(path.join(os.tmpdir(), "pubtree-good-"));
  fs.writeFileSync(path.join(good, "README.md"), "x");
  const r2 = runChild(["--root", good, "--scope", "public"], ROOT);
  cases.push({
    name: "clean-public",
    pass: r2.status === 0 && (r2.stdout + r2.stderr).includes("PASS: no denylisted path"),
    detail: `exit=${r2.status}`,
  });

  // Case 3 (scope): same violation dir in private scope → exit 0 + marker.
  const r3 = runChild(["--root", bad, "--scope", "private"], ROOT);
  cases.push({
    name: "violation-private-skipped",
    pass: r3.status === 0 && (r3.stdout + r3.stderr).includes("SKIPPED-ON-PRIVATE"),
    detail: `exit=${r3.status}`,
  });

  fs.rmSync(bad, { recursive: true, force: true });
  fs.rmSync(good, { recursive: true, force: true });

  let failed = 0;
  for (const c of cases) {
    console.log(`${c.pass ? "PASS" : "FAIL"}  self-test/${c.name} (${c.detail})`);
    if (!c.pass) failed++;
  }
  console.log(`\ncheck-public-tree SELF-TEST ${failed === 0 ? "PASS" : "FAIL"}: ${cases.length - failed}/${cases.length} cases`);
  process.exit(failed === 0 ? 0 : 1);
}

if (process.argv.includes("--self-test")) {
  selfTest();
}

process.exit(report(resolveScope()));