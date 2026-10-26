/**
 * Hardcoded Vietnamese text audit (H0.17 — scope widened 2026-10-03).
 *
 * WHY THIS FILE CHANGED SHAPE
 * The gate reported "Scanning 143 .tsx files under src/widget/..." and passed, and
 * that sentence was true and useless at the same time. Three blind spots:
 *
 *   1. SCAN_ROOT was src/widget, so src/lib and src/demo were never read.
 *   2. It matched only `.tsx`. The files carrying the most Vietnamese literals are
 *      `.ts` — MarketRules.ts, RiskEngine.ts, DarkFlowBadge.tsx, PaneHeader.tsx —
 *      so the whole trading/drawing core was invisible to it.
 *   3. EXCLUDE_DIRS excluded directories named `i18n`, but src/demo/i18n.tsx is a
 *      FILE with that name. The demo's 545-key dictionary was being read as if it
 *      were hardcoded copy: ~250 of the ~300 demo hits were the translation
 *      dictionary itself.
 *
 * A gate that reads half the repo does not get to report PASS in the affirmative.
 * It now reads every .ts and .tsx under src/widget and src/lib.
 *
 * src/demo IS ENFORCED TOO. It was excluded first, on the grounds that it is a
 * separate surface with its own 545-key i18n (src/demo/i18n.tsx) and that AGENTS.md
 * Rule 8 confines it to configuring existing capabilities. Once the dictionary
 * exclusion was fixed (§3 above), that exclusion was defending almost nothing:
 * demo turned out to hold only 12 real hits, not the ~300 the broken exclusion
 * implied. A gate that needs an exemption to pass is a gate whose scope should be
 * widened instead. src/demo is scanned; its 12 pre-existing lines sit in the
 * baseline with the rest.
 *
 * The one thing that must stay excluded is translation dictionaries — by directory
 * AND by file name, because src/demo/i18n.tsx is a file whose name says i18n.
 *
 * THE BASELINE. Widening scope found 53 pre-existing hits that nobody had looked
 * at. Turning the gate red on them would block every future push for something
 * that is not a regression, and dropping them from the report would pretend they
 * do not exist. So they are recorded in config/hardcoded-text-baseline.json and the
 * gate fails only on NEW hits. Two rules keep that honest:
 *   - baseline entries are keyed by path + matched content, never by line number,
 *     so an unrelated edit above them does not silently "fix" them;
 *   - every run prints the outstanding debt. A baseline you never see is how a
 *     ratchet turns into a lie.
 *
 * Usage: node scripts/audit-hardcoded-text.js
 * Exit 0 = no NEW hardcoded Vietnamese text
 * Exit 1 = new hardcoded Vietnamese text found (reports file:line)
 */
const fs = require("fs");
const path = require("path");

const VI_REGEX = /[À-ỹ]/;
const VI_WORDS = [
	"Đóng", "Mở", "Tải", "Chọn", "Xóa", "Thêm", "Hiện", "Ẩn",
	"Đang", "Chưa", "Không", "Có", "Đã", "Sẽ", "Hãy",
	"Lọc", "Giá", "Khối", "lượng", "lệnh", "tỷ", "Tất cả",
	"Khuyến nghị", "Mua", "Bán", "Giữ", "Mạnh",
	"Cá Mập", "Kỹ Thuật", "Rủi Ro", "Tâm Lý", "Tin cậy",
	"Giải thích", "Tóm tắt", "Nhấn", "để", "lấy",
	"Bố cục", "Chỉ báo", "Giao diện", "Đặt lại", "Múi giờ",
	"Chu kỳ", "Độ lệch", "Nhanh", "Chậm", "Tín hiệu",
	"Đường", "Vùng", "Cột", "Khối lượng", "Dòng tiền",
	"Sức mạnh", "tương đối", "Trung bình", "động",
	"Đoạn thẳng", "Hình", "Tròn", "Tam giác", "Mũi tên",
	"Độ nhạy", "Nam châm", "Yếu", "Bình thường", "Mạnh",
	"Cảnh báo", "Bật", "Hướng", "kích hoạt", "Cắt", "lên", "xuống",
	"Phát", "Tạm dừng", "Về đầu", "hiện tại", "Lùi", "Tiến",
	"Tốc độ", "nến", "Giao dịch", "ảo", "vị thế", "Nhật ký",
	"Loại nến", "rỗng", "diện tích", "Công cụ", "gần đây",
	"Yêu thích", "Phóng to", "Thu nhỏ",
];

const ROOT = path.resolve(__dirname, "..");
const BASELINE_FILE = path.join(ROOT, "config", "hardcoded-text-baseline.json");

/** Every root is enforced. Anything not listed here is not read at all. */
const SCAN_ROOTS = ["src/widget", "src/lib", "src/demo"];

const EXCLUDE_DIRS = ["node_modules", "__tests__", "i18n", ".git"];
/** Translation dictionaries can be FILES, not only directories — see header §3. */
const I18N_FILE = /^(i18n)\.[tj]sx?$|\.messages\.[a-z-]+\.[tj]s?$|^messages\.[a-z-]+\.[tj]s?$/;
const TEST_FILE = /\.test\.tsx?$/;

function isExcludedDir(dirPath) {
	return EXCLUDE_DIRS.some((d) => dirPath.includes(d));
}

function collectFiles(root, extensions) {
	const out = [];
	const walk = (dir) => {
		let entries;
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (!isExcludedDir(full)) walk(full);
			} else if (
				extensions.some((ext) => entry.name.endsWith(ext)) &&
				!TEST_FILE.test(entry.name) &&
				!I18N_FILE.test(entry.name)
			) {
				out.push(full);
			}
		}
	};
	walk(path.join(ROOT, root));
	return out;
}

function checkFile(filePath) {
	const lines = fs.readFileSync(filePath, "utf8").split("\n");
	const hits = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();
		if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;
		const matches = line.match(/["'`][^"'`]*["'`]/g);
		if (!matches) continue;
		for (const match of matches) {
			const inner = match.slice(1, -1);
			if (inner.startsWith(".") || inner.startsWith("#") || inner.startsWith("data-") || inner.length < 2) continue;
			if (/^[\u{1F000}-\u{1FFFF}]+$/u.test(inner)) continue;
			if (VI_REGEX.test(inner) || VI_WORDS.some((w) => inner.includes(w))) {
				hits.push({ line: i + 1, content: trimmed });
				break;
			}
		}
	}
	return hits;
}

/** Current findings as a path -> sorted unique content list map. */
function scan(roots) {
	const files = roots.flatMap((r) => collectFiles(r, [".ts", ".tsx"]));
	const found = new Map();
	for (const file of files) {
		const rel = path.relative(ROOT, file).split(path.sep).join("/");
		const hits = checkFile(file);
		if (hits.length) found.set(rel, hits);
	}
	return { files: files.length, found };
}

function loadBaseline() {
	if (!fs.existsSync(BASELINE_FILE)) return {};
	try {
		return JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
	} catch (err) {
		console.error(`FAIL audit-hardcoded-text: cannot read ${path.relative(ROOT, BASELINE_FILE)} — ${err.message}`);
		process.exit(2);
	}
}

function countHits(map) {
	let n = 0;
	for (const hits of map.values()) n += hits.length;
	return n;
}

function main() {
	const enforced = scan(SCAN_ROOTS);

	// --update rewrites the baseline from the current findings. It is deliberately
	// not wired to any npm script: lowering the bar has to be a conscious act with a
	// reviewable diff, not a side effect of running a gate.
	if (process.argv.includes("--update")) {
		const next = {};
		for (const [rel, hits] of [...enforced.found].sort()) {
			next[rel] = [...new Set(hits.map((h) => h.content))].sort();
		}
		fs.writeFileSync(BASELINE_FILE, JSON.stringify(next, null, "\t") + "\n", "utf8");
		console.log(
			`baseline written — ${countHits(enforced.found)} lines across ${Object.keys(next).length} files ` +
				`-> ${path.relative(ROOT, BASELINE_FILE)}`,
		);
		process.exit(0);
	}

	const baseline = loadBaseline();

	// NEW = present now, absent from baseline. Compared on (path, content) so a
	// line shift elsewhere in the file does not manufacture or hide a finding.
	const fresh = [];
	for (const [rel, hits] of enforced.found) {
		const known = new Set(baseline[rel] || []);
		for (const hit of hits) {
			if (!known.has(hit.content)) fresh.push({ rel, ...hit });
		}
	}

	// OUTSTANDING = still present, still baselined. Printed every run.
	const outstanding = [];
	for (const [rel, hits] of enforced.found) {
		const known = new Set(baseline[rel] || []);
		for (const hit of hits) {
			if (known.has(hit.content)) outstanding.push({ rel, ...hit });
		}
	}
	// RESOLVED = baselined but gone. Suggests the baseline can be lowered.
	let resolved = 0;
	for (const [rel, contents] of Object.entries(baseline)) {
		const now = enforced.found.get(rel);
		for (const content of contents) {
			if (!now || !now.some((h) => h.content === content)) resolved++;
		}
	}

	console.log(
		`Scanning ${enforced.files} .ts/.tsx files under ${SCAN_ROOTS.join(" + ")} (was: 143 .tsx under src/widget only)\n`,
	);

	const reportOnly = null;

	console.log(
		`Outstanding baselined debt: ${outstanding.length} lines` +
			(resolved > 0 ? ` (${resolved} baseline entries now resolved — regenerate to lower the bar)` : "") +
			"\n",
	);

	if (fresh.length === 0) {
		console.log("✅ PASS: no NEW hardcoded Vietnamese text.");
		process.exit(0);
	}

	console.log(`❌ FAIL: ${fresh.length} NEW lines with hardcoded Vietnamese text:`);
	for (const f of fresh) console.log(`   ${f.rel}:${f.line}  ${f.content.substring(0, 80)}`);
	console.log(
		"\nConvert these to useWidgetI18n().t(), or — if the string is diagnostic data " +
			"rather than UI copy — say so in a review comment and regenerate the baseline " +
			"deliberately (node scripts/audit-hardcoded-text.js --update).",
	);
	process.exit(1);
}

main();