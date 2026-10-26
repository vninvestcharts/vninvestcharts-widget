/**
 * Rule 15 analog: public widget MUST NOT statically import @vninvestcharts/widget-pro.
 *
 * widget-pro is the private Pro module. A static import in public src would
 * make the Free/Community bundle unresolvable for consumers without the
 * private registry (Rule 15: fail-closed, no static engine-pro import pattern).
 * Public code reaches Pro only via the adapter registry
 * (src/lib/pinescript/adapter.ts: getPineScriptAdapter()).
 *
 * Dynamic import() is ALSO a leak — esbuild inlines it when resolvable
 * (measured: ~600KB compiler inside dist/vninvestchart.iife.js), defeating
 * open-core. The SINGLE sanctioned lazy path is usePineScriptRestore.ts,
 * which catches the load failure fail-closed AND now prefers the sync
 * adapter when a Pro host registered it. That file is allowlisted below;
 * any other dynamic import is a violation.
 *
 * Usage: node scripts/check-widget-pro-leak.mjs
 * Exit 0 = no violation.
 * Exit 1 = violation(s) reported with file:line.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT, "src");

function walk(dir, files) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      walk(full, files);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function findViolations() {
  const files = walk(SRC_DIR, []);
  const violations = [];
  const staticRe = /from\s+['"]@vninvestcharts\/widget-pro['"]|require\(\s*['"]@vninvestcharts\/widget-pro['"]/;
  const dynamicRe = /import\(\s*['"]@vninvestcharts\/widget-pro['"]\s*\)/;
  // The sanctioned lazy path: sync-via-adapter first, dynamic import as fallback,
  // failure caught fail-closed. Any other file doing dynamic import is a leak.
  const dynamicAllowlist = new Set(["src/widget/hooks/usePineScriptRestore.ts"]);
  for (const f of files) {
    const rel = path.relative(ROOT, f).split(path.sep).join("/");
    const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // type-only imports are erased at runtime — no runtime dependency.
      if (/^import\s+type\b/.test(line)) continue;
      if (staticRe.test(lines[i])) {
        violations.push({ file: rel, line: i + 1 });
        break;
      }
      if (dynamicRe.test(lines[i]) && !dynamicAllowlist.has(rel)) {
        violations.push({ file: rel, line: i + 1 });
        break;
      }
    }
  }
  return violations;
}

function selfTest() {
  let bad = 0;
  const check = (name, ok, detail = "") => {
    console.log(`${ok ? "ok   " : "FAIL "} ${name}${detail ? `  ${detail}` : ""}`);
    if (!ok) bad += 1;
  };
  const tmpFile = path.join(SRC_DIR, "__selftest_widget_pro_leak.ts");
  const runGate = () => {
    try {
      const r = spawnSync(process.execPath, [__filename], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
      return { status: r.status, out: String(r.stdout ?? ""), err: String(r.stderr ?? "") };
    } catch (e) {
      return { status: e.status, out: String(e.stdout ?? ""), err: String(e.stderr ?? "") };
    }
  };
  const ctrl = runGate();
  check("control: clean tree -> exit 0 + PASS", ctrl.status === 0 && /PASS/.test(ctrl.out), `status=${ctrl.status}`);
  fs.writeFileSync(tmpFile, 'import { x } from "@vninvestcharts/widget-pro";\nconsole.log(x);\n', "utf8");
  try {
    const neg = runGate();
    const out = `${neg.out}\n${neg.err}`;
    check("negative: planted import -> exit 1", neg.status === 1, `status=${neg.status}`);
    check("negative: reports file:line", /__selftest_widget_pro_leak\.ts:\d+/.test(out), `out=${out.trim().slice(0, 160)}`);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    check("finally: temp file removed", !fs.existsSync(tmpFile));
  }
  // type-only imports are erased at runtime — must NOT trigger.
  fs.writeFileSync(tmpFile, 'import type { X } from "@vninvestcharts/widget-pro";\ntype Y = X;\nexport type { Y };\n', "utf8");
  try {
    const typeOnly = runGate();
    check("type-only: import type -> exit 0", typeOnly.status === 0, `status=${typeOnly.status}`);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    check("finally: type-only temp removed", !fs.existsSync(tmpFile));
  }
  // dynamic import outside the allowlisted hook must trigger.
  fs.writeFileSync(tmpFile, 'const m = await import("@vninvestcharts/widget-pro");\nconsole.log(m);\n', "utf8");
  try {
    const dyn = runGate();
    const dynOut = `${dyn.out}\n${dyn.err}`;
    check("dynamic: unallowlisted import() -> exit 1", dyn.status === 1, `status=${dyn.status}`);
    check("dynamic: reports file:line", /__selftest_widget_pro_leak\.ts:\d+/.test(dynOut), `out=${dynOut.trim().slice(0, 160)}`);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    check("finally: dynamic temp removed", !fs.existsSync(tmpFile));
  }
  console.log(`\ncheck-widget-pro-leak SELF-TEST ${bad === 0 ? "PASS" : "FAIL"}: ${bad === 0 ? "all cases passed" : `${bad} case(s) failed`}`);
  process.exit(bad === 0 ? 0 : 1);
}

if (process.argv.includes("--self-test")) {
  selfTest();
}

const violations = findViolations();

if (violations.length === 0) {
  console.log("PASS: no public src/ imports @vninvestcharts/widget-pro (use the pinescript adapter registry).");
  process.exit(0);
}

console.error("FAIL: public src/ statically imports @vninvestcharts/widget-pro (Rule 15 analog — use the adapter registry):");
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}`);
}
process.exitCode = 1;
