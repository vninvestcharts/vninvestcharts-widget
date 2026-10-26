#!/usr/bin/env node
/**
 * check-vitest-config.cjs — no dead config keys in vitest.config.ts.
 *
 * B18 is the case this exists for. `vitest.config.ts` declared three keys the installed Vitest
 * does not accept — `projects` (a Vitest 2+ key; the repo is on 1.6.1 with no
 * vitest.workspace.*), `transformMode`, and `esbuild` nested under `test` — totalling 113
 * lines. Vitest drops a key it does not know WITHOUT a warning, so that config sat there
 * looking authoritative while doing nothing.
 *
 * The allowed-key surface is read out of the INSTALLED package's own type declarations, not
 * from a hand-written list. A hardcoded list would rot exactly the way this bug did: silently
 * stop covering keys after an upgrade.
 *
 * The config itself is parsed with the TypeScript compiler API rather than a hand-rolled
 * tokenizer. A first version scanned braces and comments by hand and was wrong four times in
 * ways that all looked like "nothing found": string-vs-comment precedence, TypeScript's
 * optional-property `?:`, and a glob containing `/**` read as a block-comment opener. Using
 * `typescript` - already a dependency - removes that entire class of bug instead of fixing
 * another instance of it.
 *
 * Exit codes: 0 clean · 1 dead key(s) · 2 cannot verify (distinct from "clean", on purpose).
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.argv[2] || path.join(__dirname, "..");
const CONFIG_REL = "vitest.config.ts";

const fail = (msg) => {
  console.error(`check-vitest-config FAIL: ${msg}`);
  process.exit(2);
};

// ---- TypeScript is available; if not, say so rather than degrade ----------------
let ts;
try {
  ts = require("typescript");
} catch {
  fail("cannot load `typescript`; this gate needs it to parse the config");
}

// ---- the allowed-key surface, from the installed types --------------------------
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "node_modules/vitest/package.json"), "utf8"));
const version = pkg.version;
const major = Number(version.split(".")[0]);

if (major >= 2) {
  // On Vitest 2+ `projects` is valid, so the B18 class does not apply. Saying so is better
  // than silently applying a check built for a different major.
  console.log(`vitest ${version}: \`projects\` is valid on this major - no dead-key check applies.`);
  console.log("\ncheck-vitest-config SKIP");
  process.exit(0);
}

const bridgePath = path.join(ROOT, "node_modules/vitest/dist/config.d.ts");
if (!fs.existsSync(bridgePath)) fail(`bridge type file missing: ${bridgePath}`);
const bridge = fs.readFileSync(bridgePath, "utf8");
const reexport = bridge.match(/from\s+["']\.\/(reporters-[^"']+)["']/);
if (!reexport) fail(`cannot tell where UserConfig comes from in ${bridgePath}`);
const typesPath = path.join(ROOT, "node_modules/vitest/dist", reexport[1].replace(/\.js$/, ".d.ts"));
if (!fs.existsSync(typesPath)) fail(`type file missing: ${typesPath}`);
const typesSrc = fs.readFileSync(typesPath, "utf8");

/** Every property name that appears anywhere in a .d.ts, via the AST. */
function allPropertyNames(src) {
  const sf = ts.createSourceFile("t.d.ts", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names = new Set();
  const add = (name) => {
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) names.add(name.text);
  };
  const visit = (node) => {
    if (ts.isPropertySignature(node) || ts.isPropertyDeclaration(node) || ts.isMethodSignature(node)) {
      if (node.name) add(node.name);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return names;
}

/** Members of `name` PLUS every interface it extends, transitively.
 *
 * Two reasons this exists rather than a flat property-name scan:
 *  - `test` is NOT a member of Vitest's UserConfig; it arrives through Vitest's
 *    `declare global { interface UserConfig { test?: VitestInlineConfig } }` augmentation, so
 *    enumerating members must be combined with the explicit allowance below.
 *  - Vite's UserConfig extends several other interfaces, so `resolve` only shows up once the
 *    chain is followed. Skipping that reported `resolve` as unknown, which would have made
 *    the gate fail on a legitimate key.
 *  - `projects` IS mentioned somewhere in Vitest's types (a scan found it), so a
 *    whole-file name scan would wrongly accept it. Membership in the actual config interface
 *    is the check that stays correct.
 */
function configInterfaceKeys(src, names) {
  const sf = ts.createSourceFile("t.d.ts", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const byName = new Map();
  const visit = (node) => {
    if (ts.isInterfaceDeclaration(node)) byName.set(node.name.text, node);
    ts.forEachChild(node, visit);
  };
  visit(sf);

  const out = new Set();
  const walk = (name, seen) => {
    if (seen.has(name)) return;
    seen.add(name);
    const decl = byName.get(name);
    if (!decl) return;
    for (const m of decl.members) {
      if (m.name && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name))) out.add(m.name.text);
    }
    for (const h of decl.heritageClauses || []) {
      for (const t of h.types) {
        if (ts.isExpressionWithTypeArguments(t) && ts.isIdentifier(t.expression)) walk(t.expression.text, seen);
      }
    }
  };
  for (const n of names) walk(n, new Set());
  return out;
}

const vitestKeys = configInterfaceKeys(typesSrc, ["InlineConfig", "UserConfig"]);
// `test` arrives via module augmentation, not via a member declaration.
vitestKeys.add("test");

const viteTypesPath = path.join(ROOT, "node_modules/vite/dist/node/index.d.ts");
// Vite's own config surface, minus the augmentation.
const viteKeys = fs.existsSync(viteTypesPath)
  ? configInterfaceKeys(fs.readFileSync(viteTypesPath, "utf8"), ["UserConfig"])
  : new Set();

/* Vite-level keys accepted at the TOP level.
 *
 * These live in parent interfaces several hops from `vite`'s UserConfig (`resolve` is not
 * declared on it at all), and chasing Vite's whole type graph is a bigger job than this gate
 * is for. So they are listed, with two deliberate properties that keep the list honest:
 *   - it is consulted for TOP-LEVEL keys ONLY. `test.esbuild` is checked against Vitest's own
 *     surface and gets no help from here, which is why that dead key is still caught.
 *   - the self-check below asserts the list actually accepts `resolve`, `plugins` and
 *     `server`, so deleting an entry that matters shows up as exit 2, not as a silent pass.
 *
 * Known limit: a Vite key added after this list was written will be reported as unknown. That
 * is the safe direction to fail - a false positive is a one-line fix, a false negative is the
 * B18 bug recurring. */
const viteTopLevel = new Set([
  ...viteKeys,
  "resolve", "plugins", "server", "optimizeDeps", "build", "preview", "esbuild", "css",
  "publicDir", "root", "base", "mode", "logLevel", "clearScreen", "define", "cacheDir",
  "worker", "appType", "json", "assetsInclude", "envPrefix", "assetsInclude",
  "experimental", "oxc", "ssr", "build", "envDir",
]);

const known = new Set([...vitestKeys, ...viteTopLevel]);
console.log(`vitest ${version}`);
console.log(`  accepted surface: vitest config interfaces (${vitestKeys.size}, incl. the augmented \`test\`) + vite top-level (${viteTopLevel.size})`);
console.log(`  \`projects\` is a vitest config key: ${vitestKeys.has("projects")}`);

// Self-check. A gate that cannot see anything must not report everything as fine - that is
// the whole hazard this file guards against.
const mustHave = ["include", "exclude", "setupFiles", "testTimeout", "hookTimeout", "retry", "coverage", "environment"];
const missingProbe = mustHave.filter((k) => !vitestKeys.has(k));
if (missingProbe.length) fail(`vitest key set lacks ${missingProbe.join(", ")}; the parse is broken, not the config`);
const viteMust = ["resolve", "plugins", "server"];
const missingVite = viteMust.filter((k) => !viteTopLevel.has(k));
if (missingVite.length) fail(`vite top-level set lacks ${missingVite.join(", ")}; it is stale, not the config`);
if (vitestKeys.has("projects")) fail("`projects` counted as a vitest config key on this major - the check's premise is wrong");
console.log(`  self-check ok (vitest ${vitestKeys.size}, vite top-level ${viteTopLevel.size}; both accept their known-good probes)`);

// ---- parse the config with TypeScript ------------------------------------------
const configPath = path.join(ROOT, CONFIG_REL);
if (!fs.existsSync(configPath)) fail(`${CONFIG_REL} not found`);
const cfgSrc = fs.readFileSync(configPath, "utf8");
const cfgSf = ts.createSourceFile(CONFIG_REL, cfgSrc, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

let configObject = null;
const findDefault = (node) => {
  if (ts.isExportAssignment(node) && node.expression && ts.isCallExpression(node.expression)) {
    const arg = node.expression.arguments[0];
    if (arg && ts.isObjectLiteralExpression(arg)) configObject = arg;
  }
  ts.forEachChild(node, findDefault);
};
findDefault(cfgSf);
if (!configObject) fail(`no \`export default defineConfig({...})\` object literal found in ${CONFIG_REL}`);

const topKeys = configObject.properties
  .filter((p) => ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p))
  .map((p) => p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null)
  .filter(Boolean);

console.log(`  config declares: ${topKeys.join(", ")}`);

// `test.*` against VitestInlineConfig, which is `type VitestInlineConfig = InlineConfig`.
let nestedKnown = configInterfaceKeys(typesSrc, ["VitestInlineConfig", "InlineConfig"]);
const testProp = configObject.properties.find((p) => ts.isPropertyAssignment(p) && p.name && p.name.text === "test");
const nestedKeys = testProp && ts.isObjectLiteralExpression(testProp.initializer)
  ? testProp.initializer.properties
      .filter((p) => ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p))
      .map((p) => p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null)
      .filter(Boolean)
  : [];
console.log(`  test.* declares: ${nestedKeys.join(", ")}`);
console.log(`  \`esbuild\` valid under test.*: ${nestedKnown.has("esbuild")} (it is a top-level Vite option, not a test one)`);

// ---- the check ------------------------------------------------------------------
const problems = [];
for (const k of topKeys) if (!known.has(k)) problems.push({ key: k, where: "top level" });
for (const k of nestedKeys) if (!nestedKnown.has(k)) problems.push({ key: `test.${k}`, where: "inside test" });

if (problems.length) {
  console.error("\ncheck-vitest-config FAIL: vitest.config.ts declares key(s) the installed Vitest does not accept.");
  for (const { key } of problems) {
    if (key === "projects") {
      console.error("  - projects: a Vitest 2+ key. On 1.x it needs a vitest.workspace.* file; as a top-level key it never took effect.");
    } else if (key === "test.esbuild") {
      // The audit corrected the mechanism: Vitest deep-merges `test` into project.config, so
      // the value landed on project.config.esbuild where nothing read it. The verdict was
      // verified by comparing the RESOLVED vite config before and after - byte-identical.
      console.error("  - test.esbuild: a top-level Vite option, not a test option. Deep-merged onto project.config.esbuild, where nothing reads it; the tsconfigRaw options never reached the transform.");
    } else {
      console.error(`  - ${key}: not in the accepted config surface`);
    }
  }
  console.error("\nVitest drops a key it does not know without warning, so config can sit here looking authoritative while doing nothing.");
  process.exit(1);
}

console.log(`\ncheck-vitest-config PASS: ${topKeys.length} top-level and ${nestedKeys.length} test.* keys are all valid for vitest ${version}.`);
