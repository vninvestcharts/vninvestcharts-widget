/**
 * Rule: src/lib/** MUST NOT import src/widget/** (layering boundary).
 *
 * src/lib is the low-level shared utility layer; src/widget is the presentation
 * layer. Allowing lib to import widget creates an inverted dependency that makes
 * the widget impossible to tree-shake and couples shared logic to UI concerns.
 *
 * Exception: backward-compat re-export shims that live in src/lib solely to keep
 * old import paths working after the drawing/widget SSOT migration:
 *   - src/lib/advisory/AdvisoryPanel.ts   (re-exports from widget/components/overlays/AdvisoryPanel)
 *   - src/lib/tape/TapePanel.ts           (re-exports from widget/components/overlays/TapePanel)
 * These are pure `export { X } from ".../widget/..."` and carry no real dependency.
 *
 * Usage: node scripts/check-lib-to-widget-import.js
 * Exit 0 = no violation.
 * Exit 1 = violation(s) reported with file:line.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const LIB_DIR = path.join(ROOT, "src", "lib");

// Pure backward-compat re-export shims: allowed to import from src/widget.
const ALLOWED_REEXPORT = new Set([
	path.join(LIB_DIR, "advisory", "AdvisoryPanel.ts"),
	path.join(LIB_DIR, "tape", "TapePanel.ts"),
]);

function walk(dir, files) {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walk(full, files);
		} else if (
			/\.(ts|tsx)$/.test(entry.name) &&
			!/\.test\.(ts|tsx)$/.test(entry.name)
		) {
			files.push(full);
		}
	}
	return files;
}

function findViolations() {
	const files = walk(LIB_DIR, []);
	const violations = [];
	for (const file of files) {
		if (ALLOWED_REEXPORT.has(file)) continue;
		const rel = path.relative(ROOT, file).split(path.sep).join("/");
		const content = fs.readFileSync(file, "utf8");
		const lines = content.split(/\r?\n/);
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			// import ... from ".../widget/..."   or   import type ... from ".../widget/..."
			const m = line.match(
				/import\s+(?:type\s+)?[^;]*?\s+from\s*['"]([^'"]*\/widget\/[^'"]*)['"]/
			);
			if (m) {
				violations.push({ file: rel, line: i + 1, importFrom: m[1] });
				break; // one violation per file is enough to report
			}
		}
	}
	return violations;
}

// Guard --self-test TRUOC khi tinh vi pham, de self-test khong bi anh huong
// boi trang thai cay hien tai (robustness reservation R2).
if (process.argv.includes("--self-test")) {
	selfTest();
}

const violations = findViolations();

if (violations.length === 0) {
	console.log(
		"PASS: no src/lib/ imports src/widget/ (except AdvisoryPanel/TapePanel backward-compat re-export)"
	);
	process.exit(0);
}

console.error(
	"FAIL: src/lib/ imports src/widget/ (Rule: src/lib/** must not import src/widget/**):"
);
for (const v of violations) {
	console.error(`  ${v.file}:${v.line}  imports ${v.importFrom}`);
}
process.exitCode = 1;

// ---- self-test ------------------------------------------------------------------
// Chuc nang nhu check-fat-files / check-vitest-config: gate cua chung chi co nghia
// neu chuong trinh chinh da duoc chay qua --self-test va da duoc chung minh co the DO.
// Hai case:
//   - control: cay sach (khong vi lan lam thuc) -> exit 0, in PASS.
//   - am tinh: them mot file src/lib/* import thuc su tu src/widget/ -> exit 1
//     va bao file:line cua file da them. File temp duoc xoa trong finally.
function selfTest() {
	let bad = 0;
	const check = (name, ok, detail = "") => {
		console.log(`${ok ? "ok   " : "FAIL "} ${name}${detail ? `  ${detail}` : ""}`);
		if (!ok) bad += 1;
	};
	const ROOT = path.resolve(__dirname, "..");
	const LIB_DIR = path.join(ROOT, "src", "lib");
	const tmpFile = path.join(LIB_DIR, "__selftest_lib_to_widget_violation.ts");

	const runGate = () => {
		try {
			const r = spawnSync(process.execPath, [__filename], {
				encoding: "utf8",
				stdio: ["pipe", "pipe", "pipe"],
			});
			return { status: r.status, out: String(r.stdout ?? ""), err: String(r.stderr ?? "") };
		} catch (e) {
			return {
				status: e.status,
				out: String(e.stdout ?? ""),
				err: String(e.stderr ?? ""),
			};
		}
	};

	// control: cay hien tai khong co vi lam thuc (tru 2 re-export duoc phep) -> exit 0.
	const ctrl = runGate();
	check(
		"control: cay sach khong vi lam -> exit 0 + PASS",
		ctrl.status === 0 && /PASS/.test(ctrl.out),
		`status=${ctrl.status} out=${ctrl.out.trim().slice(0, 100)}`,
	);

	// am tinh: them file bi lam vao src/lib, gate phai exit 1 va bao file:line.
	fs.writeFileSync(tmpFile, 'import { Button } from "../widget/components/ui/Button";\n', "utf8");
	try {
		const neg = runGate();
		const out = `${neg.out}\n${neg.err}`;
		check("am tinh: file bi lam -> exit 1", neg.status === 1, `status=${neg.status}`);
		check(
			"am tinh: bao file:line cua file da them",
			/__selftest_lib_to_widget_violation\.ts:\d+/.test(out),
			`out=${out.trim().slice(0, 160)}`,
		);
	} finally {
		if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
		check("finally: file temp da xoa", !fs.existsSync(tmpFile));
	}

	console.log(
		`\ncheck-lib-to-widget-import SELF-TEST ${bad === 0 ? "PASS" : "FAIL"}: ${bad === 0 ? "all cases passed" : `${bad} case(s) failed`}`,
	);
	process.exit(bad === 0 ? 0 : 1);
}

