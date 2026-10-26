// Regression lock: a package whose barrel registers things at import time must
// not claim "sideEffects": false.
//
// This cost a full day of drawing runtime. @vninvestcharts/engine-drawing
// declares `sideEffects: false`, but its src/index.ts calls
// registerDrawingTool() for all 76 tools at module scope. That registration is
// exactly the side effect the flag tells the bundler it may erase, so webpack
// dropped it in the browser and drawingToolRegistry stayed empty.
//
// The symptom was silent and misleading: the toolbar showed the active tool, the
// pointer reached the chart, zero JS errors, and no drawing was ever created.
// Worse, Node was green (CJS evaluates the whole barrel, nothing is shaken) and
// 2468 unit tests passed, because nothing tree-shakes under vitest. Only a real
// browser build exposed it.
//
// Usage: node scripts/check-package-side-effects.js [engine-repo] [--allow-missing-engine]
// Exit:  0 clean · 1 a package lies about its side effects, or the engine this
//            gate exists to inspect could not be found (see ALLOW_MISSING_ENGINE)
const fs = require("fs");
const path = require("path");

// Fail-closed argument handling (2026-10-01).
//
// This gate used to exit 0 with "not applicable - no engine at ..." whenever the
// engine was missing, so a typo'd VN_ENGINE_REPO or VN_ENGINE_REPO pointing at
// the wrong worktree produced a green result while checking nothing. Proven at
// 405b12a:
//     node scripts/check-package-side-effects.js "C:\nonexistent-engine-xyz"  ->  exit 0
// The whole regression this file locks is about a registry being empty because a
// bundler erased import-time registration; a gate that cannot reach the engine
// cannot detect that, so it must not report success.
//
//   --allow-missing-engine   opt out and treat an absent engine as
//                            "not applicable". Defaults to OFF. A caller that
//                            legitimately runs without an engine checkout
//                            (CI, registry consumer) must say so explicitly.
//                            Does NOT apply when an engine was NAMED on the
//                            command line or via VN_ENGINE_REPO: that is a typo
//                            or a stale worktree, never a legitimate absence.
const ALLOW_MISSING_ENGINE = "--allow-missing-engine";
const SELF_TEST = "--self-test";
const argv = process.argv.slice(2);
const flags = new Set([ALLOW_MISSING_ENGINE, SELF_TEST]);
const engineArg = argv.find((arg) => !flags.has(arg));
const allowMissingEngine = argv.includes(ALLOW_MISSING_ENGINE);

// An engine that was named explicitly but is not usable is a hard failure with
// no opt-out: that is a typo or a stale worktree path, never a legitimate
// "consumer install" situation. Same rule as scripts/check-engine-timestamp.js
// and scripts/check-fat-files.js.
const engineExplicitlyNamed = Boolean(engineArg || process.env.VN_ENGINE_REPO);

// Function declaration được hoist nên gọi được ở đây. Chạy self-test TRƯỚC khi đòi
// engine: bảng case về glob không cần checkout engine nào, và một self-test mà
// không chạy được khi thiếu engine thì sẽ bị bỏ qua âm thầm trên CI.
if (argv.includes(SELF_TEST)) selfTest();

const ENGINE = path.resolve(
	__dirname,
	"..",
	engineArg || process.env.VN_ENGINE_REPO || "../vninvestcharts-engine",
);
const ROOT = path.resolve(__dirname, "..");

// Packages that build a registry at import time: a top-level call to a
// register*() function in a module reachable from src/index.ts.
const PACKAGES = ["vn-kline-engine-core", "vn-kline-engine-drawing", "vn-kline-engine-react"];

if (!fs.existsSync(path.join(ENGINE, "packages"))) {
	if (allowMissingEngine && !engineExplicitlyNamed) {
		console.log(`check-package-side-effects: SKIPPED by ${ALLOW_MISSING_ENGINE} - no engine at ${ENGINE}`);
		process.exit(0);
	}

	console.error(`check-package-side-effects: FAILED - no engine at ${ENGINE}`);
	if (engineExplicitlyNamed && allowMissingEngine) {
		console.error(
			`  ${ALLOW_MISSING_ENGINE} does not apply here: an engine was named\n` +
				`  (${engineArg ? `argument ${engineArg}` : `VN_ENGINE_REPO=${process.env.VN_ENGINE_REPO}`})\n` +
				"  but no packages/ directory is there. That is a typo or a stale\n" +
				"  worktree path, and the opt-out must not be able to hide it.",
		);
	}
	if (engineExplicitlyNamed && !allowMissingEngine) {
		console.error(
			`  An engine was named explicitly (${engineArg ? `argument ${engineArg}` : `VN_ENGINE_REPO=${process.env.VN_ENGINE_REPO}`})\n` +
				"  but no packages/ directory is there. This is a typo or a stale worktree path,\n" +
				"  not an environment without an engine, so it cannot be opted out of.",
		);
	}
	console.error(
		"\n  Nothing was checked. Report the sideEffects lie only as real when the engine\n" +
			"  is reachable; otherwise this gate has no evidence and must not pass.\n" +
			"  Point it at a checkout:\n" +
			"    node scripts/check-package-side-effects.js <engine-repo>\n" +
			"  or pass the explicit opt-in to run it knowing the engine is not inspected:\n" +
			`    node scripts/check-package-side-effects.js ${ALLOW_MISSING_ENGINE}`,
	);
	process.exit(1);
}

/**
 * Tự kiểm hàm glob.
 *
 * Không có self-test thì một bug trong `globMatches` làm gate **luôn xanh**: không
 * pattern nào khớp ⇒ không file nào bị coi là bị xoá ⇒ không offender. Đó là hình dạng
 * tệ nhất của một gate — im lặng và luôn xanh. Vì vậy glob được kiểm bằng bảng case,
 * gồm cả case phải cho `false`.
 */
function selfTest() {
	const cases = [
		// pattern, path, expected
		["**/*.css", "lib/indicators/index.ts", false],
		["**/*.css", "a/b/x.css", true],
		["**/*.css", "x.css", true],
		["**/*.css", "x.module.css", true],
		["*.css", "x.css", true],
		["*.css", "lib/x.css", false],
		["src/**/*.ts", "src/lib/a.ts", true],
		["src/**/*.ts", "src/lib/a.js", false],
		["**", "lib/a.ts", true],
		["**", "a", true],
		["**/*.ts", "a/b/c.ts", true],
		["**/*.ts", "a/b/c.tsx", false],
		["", "a.ts", false],
		["src/*/a.ts", "src/lib/a.ts", true],
		["src/*/a.ts", "src/lib/deep/a.ts", false],
	];
	let failed = 0;
	for (const [pattern, rel, expected] of cases) {
		const got = globMatches(pattern, rel);
		const ok = got === expected;
		if (!ok) failed++;
		console.log(`  ${ok ? "ok" : "FAIL"}  ${JSON.stringify(pattern)} vs ${JSON.stringify(rel)} -> ${got} (mong doi ${expected})`);
	}
	if (failed) {
		console.error(`\ncheck-package-side-effects SELF-TEST FAIL: ${failed}/${cases.length} case sai`);
		process.exit(1);
	}
	console.log(`check-package-side-effects SELF-TEST PASS: ${cases.length} case`);
	process.exit(0);
}

const offenders = [];

/**
 * Tìm `registerXxx(...)` ở module scope trong mọi file nguồn (trừ test).
 *
 * Một lời gọi, KHÔNG phải một khai báo: `registerX(...)` đứng ngay trước dấu chấm
 * phẩy. Một khai báo là `registerX(...): SomeType {` hoặc `registerX(...): SomeType;`
 * và không được khớp — nếu khớp thì lock sẽ gào về một chữ ký hàm export.
 */
function findRegistrars(srcDir) {
	const registrars = [];
	const walk = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (/\.tsx?$/.test(entry.name) && !/\.test\.|\.spec\.|\.d\.ts$/.test(entry.name)) {
				const src = fs.readFileSync(full, "utf8");
				const lines = src.split(/\r?\n/);
				lines.forEach((line, i) => {
					if (/^\s*register[A-Z]\w*\([^)]*\)\s*;/.test(line)) {
						registrars.push(path.relative(srcDir, full).split(path.sep).join("/") + ":" + (i + 1));
					}
				});
			}
		}
	};
	if (fs.existsSync(srcDir)) walk(srcDir);
	return registrars;
}

/**
 * Glob tối giản cho `sideEffects: [...]`.
 *
 * Hỗ trợ `**` (khớp 0 hoặc nhiều phân đoạn) và `*` (khớp trong **một** phân đoạn,
 * kể cả dạng `*.css`). Đây là glob của npm/webpack cho đúng những pattern ta dùng.
 *
 * Fail-closed: pattern là chuỗi rỗng hoặc không hiểu ⇒ `false` ⇒ file đó **không**
 * được bảo vệ. Glob lạ không phải lý do để im lặng bỏ qua một lời gọi `register*()`.
 */
function segMatches(pat, seg) {
	if (pat === seg) return true;
	if (!pat.includes("*")) return false;
	const re = new RegExp("^" + pat.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*") + "$");
	return re.test(seg);
}

function globMatches(pattern, rel) {
	if (typeof pattern !== "string" || pattern === "") return false;
	const parts = pattern.split("/").filter((p) => p !== "");
	const segs = rel.split("/");
	const go = (pi, si) => {
		if (pi === parts.length) return si === segs.length;
		if (parts[pi] === "**") {
			// ** có thể nuốt 0 phân đoạn (si) hoặc nhiều phân đoạn.
			for (let k = si; k <= segs.length; k++) {
				if (go(pi + 1, k)) return true;
			}
			return false;
		}
		if (si >= segs.length) return false;
		return segMatches(parts[pi], segs[si]) && go(pi + 1, si + 1);
	};
	return go(0, 0);
}

/**
 * Kiểm một manifest + cây src của nó. Trả về offender nếu khai báo sai.
 *
 * Bắt **hai** dạng nói dối, không chỉ `false`:
 *
 *   1. `"sideEffects": false` — bundler được xoá **mọi** module không dùng.
 *   2. `"sideEffects": ["**\/*.css"]` — bundler được xoá mọi module JS không dùng,
 *      kể cả module đăng ký ở module scope. Cùng kết quả với (1) nhưng **trông**
 *      có vẻ tinh vi nên dễ lọt. Nếu một package có bất kỳ `register*()` nào thì
 *      phải khai `true` (hoặc liệt kê đúng mọi file đăng ký — điều mà ta chọn
 *      không làm vì danh sách đó phải cập nhật mỗi lần thêm file).
 */
function checkOne(manifestPath, srcDir, label) {
	if (!fs.existsSync(manifestPath)) return null;
	const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
	const declared = manifest.sideEffects;
	if (declared === undefined || declared === true) return null;

	const registrars = findRegistrars(srcDir);
	if (registrars.length === 0) return null;

	const relFile = (loc) => loc.split(":")[0];

	// `dropped` = những lời gọi đăng ký mà bundler ĐƯỢC xoá.
	// Với mảng sideEffects, file KHÔNG khớp bất kỳ pattern nào là phần bị xoá.
	// (Tên biến trước đây là `excluded` và nghĩa ngược nhau — dễ đọc nhầm thành "được
	//  miễn trừ", đã đổi tên cho đúng nghĩa.)
	let dropped;
	if (declared === false) {
		dropped = registrars; // không module nào được bảo vệ
	} else if (Array.isArray(declared)) {
		dropped = registrars.filter(
			(loc) => !declared.some((p) => typeof p === "string" && globMatches(p, relFile(loc))),
		);
	} else {
		dropped = registrars;
	}
	if (dropped.length === 0) return null;
	return {
		name: manifest.name || label,
		label,
		declared,
		registrars: dropped,
	};
}

for (const pkg of PACKAGES) {
	const pkgDir = path.join(ENGINE, "packages", pkg);
	const bad = checkOne(path.join(pkgDir, "package.json"), path.join(pkgDir, "src"), `packages/${pkg}`);
	if (bad) offenders.push(bad);
}

// Chính repo này cũng build một registry lúc import: src/lib/indicators/index.ts gọi
// registerIndicator(...) ở module scope cho mọi chỉ báo builtin, và
// src/lib/core/registry/registerAll.ts tương tự cho series. Trước khi thêm nhánh này,
// gate chỉ soi engine — nên đặt `sideEffects: false` vào chính widget sẽ **không** bị
// bắt, dù đó đúng là cái làm sập registry trong trình duyệt và Node/test vẫn xanh.
{
	const widgetManifest = path.join(ROOT, "package.json");
	const widgetBad = checkOne(widgetManifest, path.join(ROOT, "src"), "this package");
	if (widgetBad) offenders.push(widgetBad);
}

if (offenders.length === 0) {
	console.log("package side-effects: PASS (no package with import-time registration drops it from sideEffects)");
	process.exit(0);
}

console.error(`package side-effects: FAIL — ${offenders.length} package(s) drop their import-time registration\n`);
for (const o of offenders) {
	console.error(`  ${o.name} (${o.label}) declares "sideEffects": ${JSON.stringify(o.declared)} but registers on import:`);
	for (const r of o.registrars.slice(0, 8)) console.error(`      ${r}`);
	if (o.registrars.length > 8) console.error(`      … and ${o.registrars.length - 8} more`);
}
console.error(
	"\nA bundler is entitled to delete these registrations. The registry then stays empty at",
	"\nruntime while Node and the test suite stay green. Set \"sideEffects\": true, or list",
	"\nevery module that registers - not just your CSS files.",
);
process.exit(1);
