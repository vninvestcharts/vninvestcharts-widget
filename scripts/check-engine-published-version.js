#!/usr/bin/env node
/**
 * check-engine-published-version — is the engine build this widget LINKS
 * against actually obtainable by a consumer?
 *
 * WHY THIS EXISTS (B1, 2026-11). The P3-07 fix added `reconcileDrawings` to the
 * engine's public `UseDrawingInteractionReturn` and published nothing. Every
 * local gate stayed green, and that was not luck:
 *
 *   - `scripts/sync-engine-dist.js` copies the sibling engine's freshly built
 *     `dist/` OVER the engine packages inside `node_modules`, so what
 *     `node_modules` holds is an overlay carrying code that was never published;
 *   - `scripts/gen-engine-tsconfig-paths.mjs` maps the engine specifiers to that
 *     sibling checkout's declarations, so `tsc` type-checks against them too.
 *
 * So `type-check`, `npm test` and `verify:consumer` all validate a build no
 * consumer can obtain. 2.0.2 had already been published from commit 00eb2b9 and
 * npm forbids republishing it, so `reconcileDrawings` could never reach it.
 *
 * WHAT IS COMPARED — and why not the range. The first version of this gate
 * compared the engine's source version against the widget's declared RANGE and
 * called a mismatch a failure. That was wrong, and the gate's own self-test is
 * what caught it: `^2.0.2` ADMITS 2.1.0. A caret range admits every minor.
 *
 * The thing that actually strands a consumer is the LOCKFILE: `npm ci` — which
 * is what CI, Docker and every reproducible install run — resolves the pinned
 * tarball URL, not the range. The lockfile pinned engine-react 2.0.2 from
 * `registry.npmjs.org`, so `npm ci` and `npm install` both fetched the published
 * package, and the locally overlaid `reconcileDrawings` was invisible outside
 * this checkout.
 *
 * So: engine source version vs the version pinned in `package-lock.json`. When
 * the source is NEWER than the pin, this checkout links against code that
 * cannot be installed. Prints SKIP (neither pass nor fail) when there is no
 * engine checkout — a consumer or registry CI runner legitimately has none.
 *
 * Usage:
 *   node scripts/check-engine-published-version.js            # enforce
 *   node scripts/check-engine-published-version.js --self-test
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SELF_TEST = process.argv.includes("--self-test");

const ENGINE_PACKAGES = [
	["@vninvestcharts/engine-core", "vn-kline-engine-core"],
	["@vninvestcharts/engine-drawing", "vn-kline-engine-drawing"],
	["@vninvestcharts/engine-react", "vn-kline-engine-react"],
];

/**
 * Minimal semver comparison: is `a` strictly newer than `b`?
 * Returns null when either is not a plain x.y.z, so an exotic version string
 * is reported as uncomparable rather than silently judged equal.
 */
function isNewer(a, b) {
	const re = /^(\d+)\.(\d+)\.(\d+)/;
	const pa = String(a).match(re);
	const pb = String(b).match(re);
	if (!pa || !pb) return null;
	for (let i = 1; i <= 3; i += 1) {
		const da = Number(pa[i]);
		const db = Number(pb[i]);
		if (da > db) return true;
		if (da < db) return false;
	}
	return false;
}

/** Kept because the range is still worth reporting, just not worth failing on. */
function rangeAdmits(range, version) {
	if (typeof range !== "string") return null;
	const m = range.trim().match(/^([\^~]?)(\d+)\.(\d+)\.(\d+)$/);
	if (!m) return null;
	if (range.trim() === version) return true;
	const op = m[1];
	const maj = Number(m[2]);
	const min = Number(m[3]);
	const [vmaj, vmin] = version.split(".").map(Number);
	if (op === "^") {
		if (maj > 0) return vmaj === maj;
		if (min > 0) return vmaj === 0 && vmin === min;
		return vmaj === 0 && vmin === 0;
	}
	if (op === "~") return vmaj === maj && vmin === min;
	return vmaj === maj && vmin === min;
}

function readJson(p) {
	return JSON.parse(fs.readFileSync(p, "utf8"));
}

function engineRepo() {
	const configured = process.env.VN_ENGINE_REPO;
	if (configured) return path.resolve(configured);
	const sibling = path.resolve(ROOT, "..", "vninvestcharts-engine");
	return fs.existsSync(path.join(sibling, "packages")) ? sibling : null;
}

/** The two facts that can disagree: engine source version, and the lockfile pin. */
function collect(repo) {
	const widgetPkg = readJson(path.join(ROOT, "package.json"));
	const lock = readJson(path.join(ROOT, "package-lock.json"));
	const out = [];
	for (const [name, dir] of ENGINE_PACKAGES) {
		const pkgPath = path.join(repo, "packages", dir, "package.json");
		if (!fs.existsSync(pkgPath)) continue;
		const sourceVersion = readJson(pkgPath).version;
		const pinned = (lock.packages || {})[`node_modules/${name}`];
		const range = (widgetPkg.dependencies || {})[name] || (widgetPkg.peerDependencies || {})[name] || null;
		out.push({
			name,
			sourceVersion,
			pinned: pinned ? pinned.version : null,
			range,
			newerThanPin: pinned ? isNewer(sourceVersion, pinned.version) : null,
			rangeAdmits: rangeAdmits(range, sourceVersion),
		});
	}
	return out;
}

function main() {
	const repo = engineRepo();
	if (!repo) {
		console.log(
			"check-engine-published-version SKIP: no engine checkout to compare against.\n" +
			"  (A consumer or a registry CI runner legitimately has none. What is pinned in\n" +
			"  package-lock.json is then exactly what everyone installs.)",
		);
		return;
	}

	const rows = collect(repo);
	const problems = rows.filter((r) => r.newerThanPin === true);
	const uncomparable = rows.filter((r) => r.newerThanPin === null && r.pinned);

	console.log(`engine source: ${repo}`);
	console.log("  package                          source   lock pin  range     verdict");
	for (const r of rows) {
		const verdict = r.newerThanPin === true ? "NEWER THAN PIN" : r.newerThanPin === null ? "uncomparable" : "ok";
		console.log(
			`  ${r.name.padEnd(32)} ${String(r.sourceVersion).padEnd(8)} ${String(r.pinned ?? "-").padEnd(9)} ` +
			`${String(r.range ?? "-").padEnd(9)} ${verdict}`,
		);
	}

	if (problems.length > 0) {
		console.error("\ncheck-engine-published-version FAIL:\n");
		for (const p of problems) {
			console.error(
				`  * ${p.name}: the engine checkout is ${p.sourceVersion} but package-lock.json pins` +
				` ${p.pinned}.\n` +
				"    `scripts/sync-engine-dist.js` overlays the built dist over node_modules, so every\n" +
				"    local gate passes against code that `npm ci` and `npm install` cannot obtain.\n" +
				"    Fix: publish the engine version, then re-resolve the lockfile\n" +
				"    (npm install --package-lock-only). Until it is published, this checkout is\n" +
				"    not reproducible and must not be released.",
			);
		}
		process.exitCode = 1;
		return;
	}

	if (uncomparable.length > 0) {
		console.log(`\n${uncomparable.length} package(s) have a version this gate cannot compare. Not a failure.`);
	}
	console.log("\nPASS: every engine package is pinned at or above the checked-out source version.");
}

/**
 * Negative proof. A gate seen only passing is untested, and this one guards the
 * exact failure that produced B1 — so it must be shown to go RED when the source
 * runs ahead of the pin, and it must be shown NOT to fire on the case that
 * looked like the bug and was not (a caret range admitting a newer minor).
 */
function selfTest() {
	const fsx = require("node:fs");
	const os = require("node:os");
	let bad = 0;
	const check = (name, ok, detail = "") => {
		console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
		if (!ok) bad += 1;
	};

	// control: comparison semantics, worked by hand
	check("control: 2.1.0 is newer than 2.0.2", isNewer("2.1.0", "2.0.2") === true);
	check("control: equal versions are not newer", isNewer("2.0.2", "2.0.2") === false);
	check("control: older source is not newer", isNewer("2.0.2", "2.1.0") === false);
	check("control: core 1.5.0 vs 1.4.0 is newer", isNewer("1.5.0", "1.4.0") === true);
	check("control: non-semver is uncomparable, not false", isNewer("workspace:*", "2.0.2") === null);

	// The premise this gate was first WRONG about: a caret range admits a minor bump.
	// Asserting it keeps a future edit from reintroducing the range comparison.
	check("control: ^2.0.2 DOES admit 2.1.0 (range is not the failure signal)", rangeAdmits("^2.0.2", "2.1.0") === true);
	check("control: ^2.0.2 rejects 3.0.0", rangeAdmits("^2.0.2", "3.0.0") === false);
	check("control: ~2.0.2 rejects 2.1.0", rangeAdmits("~2.0.2", "2.1.0") === false);
	check("control: file: range is uncomparable", rangeAdmits("file:../x", "2.1.0") === null);

	// The real B1 shape, end to end.
	//
	// The fake source version is DERIVED from the real lockfile pin rather than
	// hardcoded. The previous version wrote `version: "2.1.0"` and relied on the
	// repo still being pinned below that; when the widget legitimately moved to
	// 2.1.0 the fake source equalled the pin, `newerThanPin` went false, and the
	// negative proof stopped proving anything while the gate kept reporting it as
	// a case (this ran RED on 2026-10-11 for exactly that reason). A self-test that
	// expires when the thing it watches advances is a self-test that will
	// silently stop guarding — the failure mode L-E01 exists to catch.
	const tmp = fsx.mkdtempSync(path.join(os.tmpdir(), "engine-ver-self-test-"));
	const prevRepo = process.env.VN_ENGINE_REPO;
	try {
		// Reuse collect() rather than re-reading the lockfile by hand: collect is
		// what the gate itself runs, so the fixture is measured through the same
		// code path the gate uses.
		const reactEntry = ENGINE_PACKAGES.find(([, dir]) => dir === "vn-kline-engine-react");
		if (!reactEntry) throw new Error("engine-react is not in ENGINE_PACKAGES");
		const realRows = collect(engineRepo());
		const realPin = (realRows.find((r) => r.name === reactEntry[0]) || {}).pinned;
		if (!realPin) throw new Error(`cannot read the ${reactEntry[0]} pin from package-lock.json`);
		// One minor ahead of whatever is actually pinned, so the fixture is ahead
		// today and after the next bump too.
		const [maj, min] = realPin.split(".").map(Number);
		const ahead = `${maj}.${min + 1}.0`;
		const repo = path.join(tmp, "vninvestcharts-engine");
		fsx.mkdirSync(path.join(repo, "packages", "vn-kline-engine-react"), { recursive: true });
		fsx.writeFileSync(
			path.join(repo, "packages", "vn-kline-engine-react", "package.json"),
			JSON.stringify({ name: reactEntry[0], version: ahead }),
		);
		const rows = collect(repo);
		const react = rows.find((r) => r.name === reactEntry[0]);
		check(
			`negative: source ${ahead} ahead of pin ${realPin} is flagged`,
			react?.newerThanPin === true,
			JSON.stringify(react),
		);
		// The premise the gate was first WRONG about: a caret range admits a minor
		// bump, so the RANGE being satisfied must not be what makes this pass.
		check(
			"negative: the range alone would have admitted it, so the pin is the signal",
			react?.rangeAdmits === true,
			`range ${react?.range} vs source ${react?.sourceVersion}`,
		);
	} finally {
		if (prevRepo === undefined) delete process.env.VN_ENGINE_REPO;
		else process.env.VN_ENGINE_REPO = prevRepo;
		fsx.rmSync(tmp, { recursive: true, force: true });
	}
	check("finally: temp dir removed", !fs.existsSync(tmp));

	console.log(`\ncheck-engine-published-version SELF-TEST ${bad === 0 ? "PASS" : "FAIL"}: ${bad} case(s) failed`);
	process.exit(bad === 0 ? 0 : 1);
}

if (SELF_TEST) {
	selfTest();
} else {
	main();
}