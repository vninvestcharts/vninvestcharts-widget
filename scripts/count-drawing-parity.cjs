#!/usr/bin/env node
/**
 * count-drawing-parity.cjs — đo parity tool vẽ theo SSOT capability registry (T6.2, W6).
 *
 * P0-4 = "tool KHÔNG thao tác được runtime". SSOT cho câu đó là
 * `TOOL_CAPABILITY_REGISTRY` (engine) với `ParityStatus`:
 *   "parityReady" | "authoringBeta" | "renderOnly" | "disabled"
 * (`toolCapabilityRegistry.ts:19`). Vì vậy metric đo 2 tầng:
 *
 *   1. CAPABILITY (P0-4): đếm status trong registry — đây là con số quyết định.
 *   2. RENDER-DISPATCH: toolbar id ⊆ switch render của engine (`overlayPrimitiveAdapter.ts`)
 *      ⇒ "tool có được vẽ ra không". Tầng này KHÔNG đại diện "thao tác được" — một
 *      tool có thể render nhưng registry vẫn ghi authoringBeta.
 *
 * Nguồn: registry trong package ĐANG CHẠY (`node_modules/@vninvestcharts/engine-drawing`,
 * đúng thứ widget nạp theo Rule 13) — fallback sang source sibling nếu thiếu.
 *
 * Usage: node scripts/count-drawing-parity.cjs [--engine <path>]
 * Exit 0 + in: toolbar · registry counts · render-dispatch · danh sách chưa parityReady.
 */
const fs = require("node:fs");
const path = require("node:path");

const widgetRoot = path.resolve(__dirname, "..");
const engineDraw = process.argv.includes("--engine")
	? path.resolve(process.argv[process.argv.indexOf("--engine") + 1])
	: path.resolve(widgetRoot, "..", "vninvestcharts-engine", "packages", "vn-kline-engine-drawing", "src");

const read = (p) => fs.readFileSync(p, "utf8");

// ── 1. toolbar ids (widget SSOT) ─────────────────────────────────────────────
const tg = read(path.join(widgetRoot, "src", "widget", "config", "toolGroups.ts"));
const toolbar = [...new Set([...tg.matchAll(/tools:\s*\[([\s\S]*?)\]/g)].flatMap((m) =>
	[...m[1].matchAll(/"([a-zA-Z][a-zA-Z0-9]*)"/g)].map((x) => x[1]),
))].filter((t) => t !== "cursor" && t !== "crosshair");

// ── 2. capability status (engine registry — SSOT của P0-4) ──────────────────
function readRegistryStatus() {
	const candidates = [
		path.join(widgetRoot, "node_modules", "@vninvestcharts", "engine-drawing", "dist", "index.js"),
		path.join(engineDraw, "toolCapabilityRegistry.ts"),
	];
	for (const p of candidates) {
		if (!fs.existsSync(p)) continue;
		const s = read(p);
		const counts = {};
		let m; const re = /status:\s*["']([A-Za-z]+)["']/g;
		while ((m = re.exec(s)) !== null) counts[m[1]] = (counts[m[1]] || 0) + 1;
		const total = Object.values(counts).reduce((a, b) => a + b, 0);
		if (total > 0) return { counts, source: p, total };
	}
	return null;
}

// ── 3. render dispatch (engine switch) ─────────────────────────────────────
const ov = read(path.join(engineDraw, "overlayPrimitiveAdapter.ts"));
const renderSwitch = new Set();
{
	const re = /case\s+['"]([A-Za-z]+)['"]/g;
	let m;
	while ((m = re.exec(ov)) !== null) renderSwitch.add(m[1]);
}

const missingRender = toolbar.filter((t) => !renderSwitch.has(t));
const reg = readRegistryStatus();

console.log(`drawing-parity (toolbar=${toolbar.length})`);
if (reg) {
	const c = reg.counts;
	console.log(`  registry-status: parityReady=${c.parityReady ?? 0} authoringBeta=${c.authoringBeta ?? 0} renderOnly=${c.renderOnly ?? 0} disabled=${c.disabled ?? 0} (total=${reg.total})`);
	console.log(`  source: ${path.relative(widgetRoot, reg.source) || reg.source}`);
} else {
	console.log("  registry-status: KHONG DOC DUOC (khong tim thay registry) — P0-4 chua do duoc");
}
console.log(`  render-dispatch: parity=${toolbar.length - missingRender.length} missing=${missingRender.length}${missingRender.length ? ` (${missingRender.join(", ")})` : ""}`);

if (reg) {
	const notReady = (reg.counts.authoringBeta ?? 0) + (reg.counts.renderOnly ?? 0) + (reg.counts.disabled ?? 0);
	console.log(`  P0-4 (chua parityReady): ${notReady}/${reg.total} — ${notReady === 0 ? "KHONG con gap" : "con gap, xac nhan bang lenh nay"}`);
}
