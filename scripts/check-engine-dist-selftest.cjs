const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vn-engine-"));
const PKGS = [
  ["engine-core", "vn-kline-engine-core"],
  ["engine-react", "vn-kline-engine-react"],
  ["engine-drawing", "vn-kline-engine-drawing"],
];

// Build a fake engine repo whose dist is IDENTICAL to the real sibling, for two packages,
// and byte-ALTERED in a non-sentinel code file for the third.
const real = "C:/Mujoco Projects/vninvestcharts-engine";
for (const [, pkg] of PKGS) {
  const src = path.join(tmp, "packages", pkg, "dist");
  fs.mkdirSync(src, { recursive: true });
  const realDist = path.join(real, "packages", pkg, "dist");
  const walk = (d, base = d, out = []) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f, base, out);
      else out.push(path.relative(base, f).split(path.sep).join("/"));
    }
    return out;
  };
  for (const rel of walk(realDist)) {
    const to = path.join(src, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(realDist, rel), to);
  }
}
// engine-core: alter a non-sentinel CODE file (not index.d.ts, not .map)
const victim = path.join(tmp, "packages", "vn-kline-engine-core", "dist", "index.cjs");
const orig = fs.readFileSync(victim, "utf8");
fs.writeFileSync(victim, orig + "\n// DRIFT-INJECTED\n");

const env = { ...process.env, VN_ENGINE_REPO: tmp };
const run = () => {
  try {
    const out = execFileSync(process.execPath, ["scripts/sync-engine-dist.js", "--check"], {
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: (e.stdout || "") + (e.stderr || "") };
  }
};

console.log("--- CHECK with injected CODE drift in engine-core ---");
const r = run();
console.log(r.out.trim());
console.log("EXIT=" + r.code);
const caughtCode = r.code === 1;

// Now remove the code drift but leave ONLY .map missing => must NOT fail
fs.writeFileSync(victim, orig);
const maps = path.join(tmp, "packages", "vn-kline-engine-core", "dist", "index.js.map");
if (fs.existsSync(maps)) fs.rmSync(maps);
console.log("--- CHECK with .map drift ONLY (packaging noise) ---");
const r2 = run();
console.log(r2.out.trim());
console.log("EXIT=" + r2.code);
const mapNoFail = r2.code === 0;

console.log("");
console.log("NEGATIVE TEST (fail-before proof): code drift must exit 1 =", caughtCode);
console.log("POSITIVE  (no false positive): .map-only drift exits 0 =", mapNoFail);
process.exit(caughtCode && mapNoFail ? 0 : 1);