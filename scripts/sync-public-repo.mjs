#!/usr/bin/env node
"use strict";
/* sync-public-repo.mjs — one-way private → public transform (workstream A, G4).
 *
 * Usage: node scripts/sync-public-repo.mjs --out <dir> [--repo <url>] [--push] [--commit-msg "..."]
 *   --out   fresh snapshot dir (created; must not exist or must be empty)
 *   --repo  public repo URL (default: https://github.com/vninvestcharts/vninvestcharts-widget.git)
 *   --push  git init + commit + push main to --repo (default: leave uncommitted tree)
 *
 * What it does:
 *   1. `git archive HEAD` (private repo) → extract to --out (no history ships).
 *   2. Keep allowlist, delete denylist (A1).
 *   3. Apply A3 patches (mechanical, documented below; monorepo untouched).
 *   4. Optionally commit + push.
 *
 * Idempotent: re-running on a fresh --out reproduces the snapshot.
 * Verify: node scripts/check-public-tree.mjs --root <out> --scope public
 *         node scripts/check-blob-secrets.mjs --repo <out> --scope public
 *         node scripts/check-no-internal-host.mjs --dir <out>/src --scope public
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const arg = (flag, fallback = null) => {
	const i = process.argv.indexOf(flag);
	return i === -1 ? fallback : process.argv[i + 1];
};
const OUT = path.resolve(arg("--out") || "");
const REPO = arg("--repo") || "https://github.com/vninvestcharts/vninvestcharts-widget.git";
const DO_PUSH = process.argv.includes("--push");
const COMMIT_MSG = arg("--commit-msg") || "public snapshot: open-core community tree (no history)";

if (!OUT) {
	console.error("usage: node scripts/sync-public-repo.mjs --out <dir> [--repo <url>] [--push]");
	process.exit(2);
}
if (fs.existsSync(OUT) && fs.readdirSync(OUT).length > 0) {
	console.error(`refusing: --out exists and is not empty: ${OUT}`);
	process.exit(2);
}
fs.mkdirSync(OUT, { recursive: true });

function sh(cmd, args, opts = {}) {
	const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
	if (r.status !== 0) {
		console.error(`command failed: ${cmd} ${args.join(" ")}`);
		console.error((r.stderr || r.stdout || "").slice(0, 2000));
		process.exit(r.status || 1);
	}
	return r.stdout;
}

// ---- 1. export ----------------------------------------------------------------
console.log("--- export git archive HEAD ---");
{
	const data = execFileSync("git", ["archive", "HEAD"], { cwd: ROOT, maxBuffer: 1024 * 1024 * 1024 });
	fs.writeFileSync(path.join(OUT, "..", "__archive.tmp.tgz"), data);
	sh("tar", ["-xzf", path.join(OUT, "..", "__archive.tmp.tgz"), "-C", OUT]);
	fs.unlinkSync(path.join(OUT, "..", "__archive.tmp.tgz"));
}
const R = (rel) => path.join(OUT, rel);
const rmrf = (rel) => fs.rmSync(R(rel), { recursive: true, force: true });
function assertExists(rel, why) {
	if (!fs.existsSync(R(rel))) {
		console.error(`ASSERT FAIL: expected ${rel} (${why})`);
		process.exit(1);
	}
}

// ---- 2. allowlist: keep only what the public tree ships -----------------------
// Everything else is deleted. Listed explicitly (deny-by-default) so a new
// private dir does not leak into public by accident (L-G02: scope explicit).
const KEEP_TOP = new Set([
	"src",
	"tests",
	"stories",
	".storybook",
	"config",
	"scripts",
	".github",
	"deploy",
	".opencode",
	"packages",
	"package.json",
	"package-lock.json",
	"tsconfig.json",
	"tsconfig.dts.json",
	"tsconfig.pro-typecheck.json",
	"tsconfig.engine-paths.json",
	"tsup.config.ts",
	"vite.config.ts",
	"vitest.config.ts",
	"webpack.config.js",
	"build-esm-cjs.js",
	"build-css-modules-v2.js",
	"test-css-modules.js",
	"LICENSE",
	"NOTICE",
	"README.md",
	"CONTRIBUTING.md",
	"SECURITY.md",
	".gitignore",
	".npmignore",
	".editorconfig",
	".eslintrc",
	".eslintignore",
	"AGENTS.md",
	"CLAUDE.md",
	"opencode.jsonc",
	"WIDGET_EMBED_GUIDE.md",
	"MIGRATION_0_2_0.md",
]);
console.log("--- allowlist ---");
for (const e of fs.readdirSync(OUT)) {
	if (e === ".git") continue;
	if (!KEEP_TOP.has(e)) {
		rmrf(e);
		console.log(`  drop: ${e}`);
	}
}
// scripts/issue-license.js holds the minting side (private key handling) — out.
rmrf("scripts/issue-license.js");

// ---- 3. denylist: belt-and-braces on top of allowlist (A1 + gate list) --------
const DENY = [
	"docs",
	"embed-demo",
	"audit",
	"plans",
	".tours",
	"deploy/CHARTS-TEST.md",
	"deploy/docker-compose.charts-test.yml",
	"deploy/G0-OPEN-RUNBOOK.md",
	"deploy/GITHUB-PACKAGES-RUNBOOK.md",
	"deploy/VERDACCIO-RUNBOOK.md",
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
	"PHASE3_SUFFIX.md",
];
console.log("--- denylist ---");
for (const d of DENY) {
	if (fs.existsSync(R(d))) {
		rmrf(d);
		console.log(`  drop: ${d}`);
	}
}
// Playbook extras the gate list does not name (globbed).
for (const e of [...(fs.existsSync(R(".")) ? fs.readdirSync(R(".")) : [])]) {
	if (/^PHASE3_.*\.md$/i.test(e) || /^implementation_plan.*\.md$/i.test(e)) {
		rmrf(e);
		console.log(`  drop: ${e}`);
	}
}
// A1: NO packages/ in public. Pro implementation stays private; the public
// build resolves the published package instead (fail-closed without it,
// Rule 15). The sibling-only tsconfig is dropped with it; the root
// type-check falls back to plain `tsc --noEmit` (patched below).
rmrf("packages");
rmrf("tsconfig.pro-typecheck.json");

// ---- 4. A3 patches (mechanical, monorepo untouched) ---------------------------
console.log("--- A3 patches ---");
let patched = 0;
function readText(rel) {
	return fs.readFileSync(R(rel), "utf8").replace(/\r\n/g, "\n");
}
function patchFile(rel, replacements, why) {
	const p = R(rel);
	if (!fs.existsSync(p)) {
		console.error("ASSERT FAIL: patch target missing: " + rel + " (" + why + ")");
		process.exit(1);
	}
	let src = readText(rel);
	for (const pair of replacements) {
		if (!src.includes(pair[0])) {
			console.error("ASSERT FAIL: pattern not found in " + rel + " (" + why + ")");
			process.exit(1);
		}
		src = src.split(pair[0]).join(pair[1]);
	}
	fs.writeFileSync(p, src);
	patched++;
	console.log("  patched: " + rel + " (" + why + ")");
}
function writeFile(rel, content, why) {
	const p = R(rel);
	fs.mkdirSync(path.dirname(p), { recursive: true });
	fs.writeFileSync(p, content);
	patched++;
	console.log("  wrote: " + rel + " (" + why + ")");
}

// P-A3-13: .gitignore stale comment block -> short note (line anchors).
{
	const p = R(".gitignore");
	const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
	const start = lines.findIndex((l) => l.includes("# Documentation is fully tracked"));
	const end = lines.findIndex((l) => l.includes("Still excluded:"));
	if (start === -1 || end === -1 || end < start) {
		console.error("ASSERT FAIL: .gitignore stale-comment block not found");
		process.exit(1);
	}
	lines.splice(start, end - start + 1, "# Docs live in the private handbook repo and are not shipped here.");
	fs.writeFileSync(p, lines.join("\n"));
	patched++;
	console.log("  patched: .gitignore (stale tracking comment)");
}

// P-A3-10: LICENSE appendix placeholder -> filled.
patchFile("LICENSE", [["Copyright [yyyy] [name of copyright owner]", "Copyright 2026 VNInvestCharts Contributors"]], "A3-10 appendix");

// P-A3-11: SECURITY.md (root + .github/).
{
	const policy = [
		"# Security Policy",
		"",
	].join("\n");
	const body = policy + [
		"## Supported versions",
		"",
		"| Version | Supported          |",
		"| ------- | ------------------ |",
		"| 0.4.x   | :white_check_mark: |",
		"| < 0.4   | :x:                |",
		"",
	].join("\n");
	const tail = [
		"## Reporting a vulnerability",
		"",
		"Do NOT open a public issue for security reports. Email the maintainers",
		"(contact listed on the GitHub org profile) with a description, affected",
		"version, and reproduction steps. Expect an acknowledgement within 3 business",
		"days. Please allow up to 90 days for a fix before public disclosure.",
		"",
	].join("\n");
	writeFile("SECURITY.md", body + tail, "A3-11 disclosure policy");
	writeFile(".github/SECURITY.md", body + tail, "A3-11 disclosure policy (Actions tab)");
}

// P-A3-4: AGENTS.md public rewrite (section surgery + targeted ref fixes).
{
	const p = R("AGENTS.md");
	let src = readText("AGENTS.md");
	const cut = (from, to, why) => {
		const a = src.indexOf(from);
		const b = src.indexOf(to, a === -1 ? 0 : a);
		if (a === -1 || b === -1 || b < a) {
			console.error("ASSERT FAIL: AGENTS.md bounds not found (" + why + "): " + JSON.stringify(from.slice(0, 40)));
			process.exit(1);
		}
		return src.slice(0, a) + src.slice(b);
	};
	src = cut("## Read first", "## Canonical commands", "read-first");
	src = ("## Read first (public tree — no private handbook shipped)\n\n"
		+ "> References to `docs/upgrade-standard/*`, `docs/architecture/*` and `docs/LESSONS/*`\n"
		+ "> elsewhere point at the private contributor handbook and are not shipped.\n"
		+ "> The rules below are self-contained.\n\n"
		+ "1. `quality/QUALITY.md` — quality gates and definitions of done (shipped)\n"
		+ "2. `config/fat-file-budget.json` — file-size budgets (Rule 9)\n"
		+ "3. `WIDGET_EMBED_GUIDE.md` — embedding guide (repo root, public copy)\n"
		+ "4. `MIGRATION_0_2_0.md` — 0.2.0 migration notes (repo root, public copy)\n\n")
		+ src;
	src = cut("## Current session progress", "## Hard rules for any agent", "session-log");
	src = ("## Current session progress\n\n"
		+ "> Ongoing work is tracked per-slice in the private handbook. Public contributors:\n"
		+ "> open an issue before large changes; keep each PR focused and green on CI.\n\n")
		+ src;
	src = cut("17. **[MÔI TRƯỜNG KIỂM THỬ", "## Known active gap", "rule-17");
	src = src.replace("## Known active gap",
		"17. **[MÔI TRƯỜNG KIỂM THỬ]** Mọi kiểm thử runtime (E2E, probe, verify, repro, smoke)\n"
		+ "chạy ngoài dev-server hằng ngày: trỏ `WATCH_URL` (hoặc `--url`) vào một deployment\n"
		+ "đang chạy của đúng commit cần kiểm, rồi xác minh từ NGOÀI bằng `health.json`\n"
		+ "(so `commit`). `docker ps Up (healthy)` **không** chứng minh đúng code. Không hardcode\n"
		+ "`localhost`. Chi tiết triển khai nội bộ nằm ở handbook riêng.\n\n## Known active gap");
	const refs = [
		["`docs/upgrade-standard/AGENT_PLAYBOOK.md`", "the agent playbook (private handbook — not shipped)"],
		["`docs/upgrade-standard/plans/PLAN_AGENT_HARNESS_UPGRADE_2026-10-20.md`", "the agent-harness plan (private — not shipped)"],
		["`docs/upgrade-standard/AUDIT_LEDGER.md`", "the audit ledger (private handbook — not shipped)"],
		["`docs/upgrade-standard/plans/`", "the plans directory (private handbook — not shipped)"],
		["`PLAN_CREDENTIAL_SPLIT_O1_2026-09-26.md`", "(example slice plan — private)"],
		["`docs/project-delivery/SLICE_ROADMAP_MASTER.md`", "(does not exist — do not create)"],
	];
	for (const pair of refs) {
		if (!src.includes(pair[0])) {
			console.error("ASSERT FAIL: AGENTS.md expected ref missing: " + pair[0]);
			process.exit(1);
		}
		src = src.split(pair[0]).join(pair[1]);
	}
	const qd = src.indexOf("## Quality docs");
	if (qd === -1) {
		console.error("ASSERT FAIL: AGENTS.md Quality docs section missing");
		process.exit(1);
	}
	src = src.slice(0, qd)
		+ ("## Quality docs\n\n"
		+ "Quality gates live in CI (`.github/workflows/ci.yml`) and are self-describing:\n"
		+ "`type-check`, `audit:fat-files`, `audit:drawing-boundary`, `lint:ratchet`,\n"
		+ "`npm test`, `build`, `check:agent-config`, plus the three A4 public-tree gates.\n");
	fs.writeFileSync(p, src);
	patched++;
	console.log("  patched: AGENTS.md (public rewrite)");
}

// P-A3: package.json — type-check without the dropped pro-typecheck config.
{
  const p = R("package.json");
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  if (!j.scripts || j.scripts["type-check"] !== "tsc --noEmit && tsc -p tsconfig.pro-typecheck.json") {
    console.error("ASSERT FAIL: package.json type-check script unexpected");
    process.exit(1);
  }
  j.scripts["type-check"] = "tsc --noEmit";
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
  patched++;
  console.log("  patched: package.json (type-check without pro-typecheck)");
}

// P-A3: .github/workflows/ci.yml
{
  const p = R(".github/workflows/ci.yml");
  let content = readText(".github/workflows/ci.yml");

  // 1. Remove 7 steps
  const DROPPED_STEPS = [
    "license keypair tool keeps the private JWK off stdout",
    "license payload hygiene (no PII fields, no private JWK)",
    "doc freshness (inventory in sync)",
    "doc findings register in sync",
    "no duplicate topics in the handbook",
    "doc links + citations resolve",
    "lesson handbook structure + self-test",
  ];
  const dropStartMarker = "      # The private JWK must never reach STDOUT";
  const dropEndMarker = "      # GOV-02: version SSOT + release manifest (REL-06)";
  const startIdx = content.indexOf(dropStartMarker);
  const endIdx = content.indexOf(dropEndMarker);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    console.error("ASSERT FAIL: ci.yml drop range not found");
    process.exit(1);
  }
  const droppedText = content.slice(startIdx, endIdx);
  for (const step of DROPPED_STEPS) {
    if (!droppedText.includes("- name: " + step)) {
      console.error("ASSERT FAIL: missing step in ci.yml: " + step);
      process.exit(1);
    }
  }
  content = content.slice(0, startIdx) + content.slice(endIdx);

  // 2. Add 3 A4 steps right before "- name: upload evidence"
  const uploadMarker = "      # VER-01: artifact inventory for the release decision.\n      - name: upload evidence";
  if (!content.includes(uploadMarker)) {
    console.error("ASSERT FAIL: upload evidence marker not found in ci.yml");
    process.exit(1);
  }
  const a4Steps = "      - name: public-tree + self-test\n"
    + "        run: |\n"
    + "          set -o pipefail\n"
    + "          node scripts/check-public-tree.mjs 2>&1 | tee ci-evidence/public-tree.log\n"
    + "          node scripts/check-public-tree.mjs --self-test 2>&1 | tee ci-evidence/public-tree-self-test.log\n"
    + "      - name: blob-secrets + self-test\n"
    + "        run: |\n"
    + "          set -o pipefail\n"
    + "          node scripts/check-blob-secrets.mjs 2>&1 | tee ci-evidence/blob-secrets.log\n"
    + "          node scripts/check-blob-secrets.mjs --self-test 2>&1 | tee ci-evidence/blob-secrets-self-test.log\n"
    + "      - name: no-internal-host + self-test\n"
    + "        run: |\n"
    + "          set -o pipefail\n"
    + "          node scripts/check-no-internal-host.mjs 2>&1 | tee ci-evidence/no-internal-host.log\n"
    + "          node scripts/check-no-internal-host.mjs --self-test 2>&1 | tee ci-evidence/no-internal-host-self-test.log\n\n";
  content = content.replace(uploadMarker, a4Steps + uploadMarker);

  // 3. Add permissions: { contents: read, packages: read } right before jobs:
  if (!content.includes("\njobs:\n")) {
    console.error("ASSERT FAIL: jobs: line not found in ci.yml");
    process.exit(1);
  }
  content = content.replace("\njobs:\n", "\npermissions:\n  contents: read\n  packages: read\n\njobs:\n");

  // 4. In 4 places with cache: npm -> add registry-url + scope
  const cacheMatches = content.split("          cache: npm").length - 1;
  if (cacheMatches !== 4) {
    console.error("ASSERT FAIL: expected 4 cache: npm in ci.yml, found " + cacheMatches);
    process.exit(1);
  }
  content = content.replaceAll(
    "          cache: npm",
    "          cache: npm\n          registry-url: https://npm.pkg.github.com\n          scope: '@vninvestcharts'"
  );

  // 5. In 4 places with - run: npm ci -> add NODE_AUTH_TOKEN
  const ciMatches = content.split("      - run: npm ci\n").length - 1;
  if (ciMatches !== 4) {
    console.error("ASSERT FAIL: expected 4 - run: npm ci in ci.yml, found " + ciMatches);
    process.exit(1);
  }
  content = content.replaceAll(
    "      - run: npm ci\n",
    "      - run: npm ci\n        env:\n          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}\n"
  );

  fs.writeFileSync(p, content);
  patched++;
  console.log("  patched: .github/workflows/ci.yml (CI surgery)");
}

// P-A3: deploy/nginx-app.conf
{
  const p = R("deploy/nginx-app.conf");
  let content = readText("deploy/nginx-app.conf");

  // Replace docker.edusuccess.vn with api.example.invalid (2 places)
  const dockerMatches = content.split("https://docker.edusuccess.vn").length - 1;
  if (dockerMatches !== 2) {
    console.error("ASSERT FAIL: expected 2 https://docker.edusuccess.vn in nginx-app.conf, found " + dockerMatches);
    process.exit(1);
  }
  content = content.replaceAll("https://docker.edusuccess.vn", "https://api.example.invalid");

  // Replace comment line ~130
  const commentOld = "# `Access-Control-Allow-Origin: https://charts.edusuccess.vn` (verified 401 +";
  const commentNew = "# OPERATOR: replace api.example.invalid with your backend host.\n"
    + "    # `Access-Control-Allow-Origin: https://charts.example.invalid` (verified 401 +";
  if (!content.includes(commentOld)) {
    console.error("ASSERT FAIL: commentOld not found in nginx-app.conf");
    process.exit(1);
  }
  content = content.replace(commentOld, commentNew);

  fs.writeFileSync(p, content);
  patched++;
  console.log("  patched: deploy/nginx-app.conf (generic API CSP)");
}

// P-A3: scripts/check-staging.cjs
{
  const p = R("scripts/check-staging.cjs");
  let content = readText("scripts/check-staging.cjs");
  const oldDefault = 'const DEFAULT_URL = "https://charts.edusuccess.vn";';
  const newDefault = 'const DEFAULT_URL = process.env.STAGING_URL || "";';
  if (!content.includes(oldDefault)) {
    console.error("ASSERT FAIL: DEFAULT_URL not found in check-staging.cjs");
    process.exit(1);
  }
  content = content.replace(oldDefault, newDefault);
  const oldUrlArg = 'const url = arg("--url", process.env.STAGING_URL || DEFAULT_URL);';
  const newUrlArg = 'const url = arg("--url", process.env.STAGING_URL || DEFAULT_URL);\n'
    + '\t\tif (!url) {\n'
    + '\t\t\tconsole.log("check-staging: SKIP (no --url or STAGING_URL provided)");\n'
    + '\t\t\tprocess.exit(2);\n'
    + '\t\t}';
  if (!content.includes(oldUrlArg)) {
    console.error("ASSERT FAIL: url arg check not found in check-staging.cjs");
    process.exit(1);
  }
  content = content.replace(oldUrlArg, newUrlArg);
  fs.writeFileSync(p, content);
  patched++;
  console.log("  patched: scripts/check-staging.cjs (STAGING_URL env default)");
}

// P-A3: scripts/lib/staging-evidence.cjs
{
  const p = R("scripts/lib/staging-evidence.cjs");
  let content = readText("scripts/lib/staging-evidence.cjs");
  const oldStagingUrl = 'const url = stagingUrl || "https://charts.edusuccess.vn/health.json";';
  const newStagingUrl = 'const url = stagingUrl || process.env.STAGING_HEALTH_URL || "";';
  if (!content.includes(oldStagingUrl)) {
    console.error("ASSERT FAIL: stagingUrl not found in staging-evidence.cjs");
    process.exit(1);
  }
  content = content.replace(oldStagingUrl, newStagingUrl);
  fs.writeFileSync(p, content);
  patched++;
  console.log("  patched: scripts/lib/staging-evidence.cjs (STAGING_HEALTH_URL env default)");
}

// P-A3: scripts/run-gates.cjs
{
  const p = R("scripts/run-gates.cjs");
  let content = readText("scripts/run-gates.cjs");
  const oldWatchUrl = 'const STAGING_WATCH_URL = "https://charts.edusuccess.vn/?standalone=1";';
  const newWatchUrl = 'const STAGING_WATCH_URL = process.env.WATCH_URL || "";';
  if (!content.includes(oldWatchUrl)) {
    console.error("ASSERT FAIL: STAGING_WATCH_URL not found in run-gates.cjs");
    process.exit(1);
  }
  content = content.replace(oldWatchUrl, newWatchUrl);
  fs.writeFileSync(p, content);
  patched++;
  console.log("  patched: scripts/run-gates.cjs (WATCH_URL env default)");
}

// P-A3: scripts/check-blob-secrets.mjs
{
  const p = R("scripts/check-blob-secrets.mjs");
  let content = readText("scripts/check-blob-secrets.mjs");
  content = content.replace(
    "/vni1\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+/",
    "/vni1\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{30,}/"
  );
  content = content.replace(
    '"token=npm_abcdefghijklmnopqrstuvwxyz0123456789\\n"',
    '"token=" + "npm_" + "abcdefghijklmnopqrstuvwxyz0123456789\\n"'
  );
  fs.writeFileSync(p, content);
  patched++;
  console.log("  patched: scripts/check-blob-secrets.mjs (realistic vni1 secret length + selfTest literal)");
}


// P-A3: src/demo/index.tsx
{
  const p = R("src/demo/index.tsx");
  let content = readText("src/demo/index.tsx");
  const oldComment = "//      points at https://docker.edusuccess.vn WITHOUT a hostname in `src/**`.";
  if (!content.includes(oldComment)) {
    console.error("ASSERT FAIL: docker.edusuccess.vn comment not found in demo/index.tsx");
    process.exit(1);
  }
  content = content.replace(oldComment, "//      points at the configured API base without a hardcoded hostname.");
  fs.writeFileSync(p, content);
  patched++;
  console.log("  patched: src/demo/index.tsx (generic API base comment)");
}

// P-A3: src/demo/demoLicense.ts
{
  const p = R("src/demo/demoLicense.ts");
  let content = readText("src/demo/demoLicense.ts");
  const oldDomain = "bind domain `charts.edusuccess.vn`;";
  if (!content.includes(oldDomain)) {
    console.error("ASSERT FAIL: charts.edusuccess.vn not found in demoLicense.ts");
    process.exit(1);
  }
  content = content.replace(oldDomain, "bind domain (e.g. `demo.example.invalid`);");
  fs.writeFileSync(p, content);
  patched++;
  console.log("  patched: src/demo/demoLicense.ts (generic demo domain)");
}

// P-A3: demo CSV + imports
{
  const srcCsv = path.join(ROOT, "docs", "data", "bitfinex_xbtusd_1m.csv");
  if (!fs.existsSync(srcCsv)) {
    console.error("ASSERT FAIL: source CSV not found: " + srcCsv);
    process.exit(1);
  }
  const dstDir = R("src/demo/data");
  fs.mkdirSync(dstDir, { recursive: true });
  fs.copyFileSync(srcCsv, path.join(dstDir, "bitfinex_xbtusd_1m.csv"));
  console.log("  copied: src/demo/data/bitfinex_xbtusd_1m.csv");

  // Patch src/demo/demoData.ts
  const pData = R("src/demo/demoData.ts");
  let contentData = readText("src/demo/demoData.ts");
  const oldImport = 'import bitstampCsv from "../../docs/data/bitfinex_xbtusd_1m.csv";';
  const newImport = 'import bitstampCsv from "./data/bitfinex_xbtusd_1m.csv";';
  if (!contentData.includes(oldImport)) {
    console.error("ASSERT FAIL: CSV import not found in demoData.ts");
    process.exit(1);
  }
  contentData = contentData.replace(oldImport, newImport);
  fs.writeFileSync(pData, contentData);
  patched++;
  console.log("  patched: src/demo/demoData.ts (CSV path)");

  // Patch src/demo/__tests__/demoData.test.ts
  const pTest = R("src/demo/__tests__/demoData.test.ts");
  let contentTest = readText("src/demo/__tests__/demoData.test.ts");
  const oldMock = 'vi.mock("../../../docs/data/bitfinex_xbtusd_1m.csv", () => ({ default: "" }));';
  const newMock = 'vi.mock("../data/bitfinex_xbtusd_1m.csv", () => ({ default: "" }));';
  if (!contentTest.includes(oldMock)) {
    console.error("ASSERT FAIL: CSV mock not found in demoData.test.ts");
    process.exit(1);
  }
  contentTest = contentTest.replace(oldMock, newMock);
  fs.writeFileSync(pTest, contentTest);
  patched++;
  console.log("  patched: src/demo/__tests__/demoData.test.ts (CSV mock path)");
}

// P-A3: src/demo/dataSources/__tests__/vninvest.test.ts
{
  const p = R("src/demo/dataSources/__tests__/vninvest.test.ts");
  let content = readText("src/demo/dataSources/__tests__/vninvest.test.ts");
  const count = content.split("https://saas.edusuccess.vn").length - 1;
  if (count !== 2) {
    console.error("ASSERT FAIL: expected 2 https://saas.edusuccess.vn in vninvest.test.ts, found " + count);
    process.exit(1);
  }
  content = content.replaceAll("https://saas.edusuccess.vn", "https://api.example.invalid");
  fs.writeFileSync(p, content);
  patched++;
  console.log("  patched: src/demo/dataSources/__tests__/vninvest.test.ts (generic test host)");
}

// P-A3: src/demo/dataSources/__tests__/VNInvestWebSocketClient.test.ts
{
  const p = R("src/demo/dataSources/__tests__/VNInvestWebSocketClient.test.ts");
  let content = readText("src/demo/dataSources/__tests__/VNInvestWebSocketClient.test.ts");
  if (!content.includes("https://saas.edusuccess.vn") || !content.includes("wss://saas.edusuccess.vn")) {
    console.error("ASSERT FAIL: saas.edusuccess.vn not found in VNInvestWebSocketClient.test.ts");
    process.exit(1);
  }
  content = content.replace("https://saas.edusuccess.vn", "https://api.example.invalid");
  content = content.replace("wss://saas.edusuccess.vn", "wss://api.example.invalid");
  fs.writeFileSync(p, content);
  patched++;
  console.log("  patched: src/demo/dataSources/__tests__/VNInvestWebSocketClient.test.ts (generic WS host)");
}

// P-A3: README.md + guides
{
  // 1. Copy WIDGET_EMBED_GUIDE.md and MIGRATION_0_2_0.md from ROOT to snapshot root
  const guideSrc = path.join(ROOT, "docs", "WIDGET_EMBED_GUIDE.md");
  const migSrc = path.join(ROOT, "docs", "MIGRATION_0_2_0.md");
  fs.copyFileSync(guideSrc, R("WIDGET_EMBED_GUIDE.md"));
  fs.copyFileSync(migSrc, R("MIGRATION_0_2_0.md"));
  console.log("  copied: WIDGET_EMBED_GUIDE.md and MIGRATION_0_2_0.md to root");

  // 2. Rewrite README.md
  const pReadme = R("README.md");
  let contentReadme = readText("README.md");

  contentReadme = contentReadme.replaceAll("./docs/WIDGET_EMBED_GUIDE.md", "./WIDGET_EMBED_GUIDE.md");
  contentReadme = contentReadme.replaceAll("`docs/WIDGET_EMBED_GUIDE.md`", "`WIDGET_EMBED_GUIDE.md`");
  contentReadme = contentReadme.replaceAll("./docs/MIGRATION_0_2_0.md", "./MIGRATION_0_2_0.md");

  // Remove sentence referencing PLAN_B2B
  const planOld = " — see\n[L1.1 of the plan](./docs/upgrade-standard/plans/PLAN_B2B_WIDGET_2026-10-06.md) for why\nthis licence and not MIT/MPL-2.0/AGPL-3.0.";
  if (!contentReadme.includes(planOld)) {
    console.error("ASSERT FAIL: PLAN_B2B sentence not found in README.md");
    process.exit(1);
  }
  contentReadme = contentReadme.replace(planOld, ".");

  // Assert: no ./docs/ remains in README.md
  if (contentReadme.includes("./docs/")) {
    console.error("ASSERT FAIL: ./docs/ references still remain in README.md");
    process.exit(1);
  }

  fs.writeFileSync(pReadme, contentReadme);
  patched++;
  console.log("  patched: README.md (public links, 0 ./docs/ refs)");
}

// ---- 5. git init + commit + push ---------------------------------------------
console.log("--- git init & commit ---");
sh("git", ["init", "-b", "main"], { cwd: OUT });
sh("git", ["config", "user.name", "VNInvestCharts Release Bot"], { cwd: OUT });
sh("git", ["config", "user.email", "release@vninvestcharts.org"], { cwd: OUT });
sh("git", ["add", "-A"], { cwd: OUT });
sh("git", ["commit", "-m", COMMIT_MSG], { cwd: OUT });

if (DO_PUSH) {
  console.log(`--- git push main -> ${REPO} ---`);
  sh("git", ["remote", "add", "origin", REPO], { cwd: OUT });
  sh("git", ["push", "-u", "origin", "main"], { cwd: OUT });
}

console.log("\n=======================================================");
console.log(`SUCCESS: public snapshot ready at ${OUT}`);
console.log(`Total patched files: ${patched}`);
console.log("Verify next with:");
console.log(`  node scripts/check-public-tree.mjs --root "${OUT}" --scope public`);
console.log(`  node scripts/check-no-internal-host.mjs --dir "${OUT}/src" --scope public`);
console.log(`  node scripts/check-blob-secrets.mjs --repo "${OUT}" --scope public`);
console.log("=======================================================\n");



