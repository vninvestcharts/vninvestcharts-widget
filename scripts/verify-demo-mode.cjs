#!/usr/bin/env node
/**
 * verify-demo-mode.cjs — E2E: trang demo staging tự cài licence pro demo.
 *
 * Bối cảnh (DEMO-MODE 2026-10-17, src/demo/demoLicense.ts): build demo nhúng blob
 * licence pro (bind charts.edusuccess.vn) qua DefinePlugin VNI_DEMO_LICENSE; trang
 * tự cài vào `vni_license_key` lúc boot để mọi khách test được toàn bộ chức năng.
 *
 * Gate này đo 4 điều trên ĐÚNG bundle đang phục vụ (mặc định staging, Rule 17):
 *   DEMO-01  visitor path (?standalone=1): blob được cài, đúng shape vni1.
 *   DEMO-02  ?dockgate=1: quyền PRO quan sát được — KHÔNG có nudge, dock wrapper
 *            (role=complementary) hiện diện.
 *   DEMO-03  đối chứng FREE (tombstone `vnsc_demo_license_off=1` qua init-script):
 *            KHÔNG cài licence + nudge FREE hiện diện. Không có cặp đối chứng này
 *            thì DEMO-02 là vacuous (một build chẳng bao giờ hiện nudge cũng
 *            "pass" DEMO-02).
 *   DEMO-04  no-overwrite với licence THẬT của khách (seed VNI_E2E_LICENSE qua
 *            init-script, chạy trước bundle nên phải thắng): storage giữ nguyên
 *            sau khi app lên PRO. Thiếu licence thật ⇒ BLOCK (không PASS/FAIL).
 *   DEMO-05  no-overwrite rộng hơn: blob rác có sẵn trong slot cũng không bị ghi
 *            đè (chỉ khẳng định storage sau khi widget root mount).
 *
 * Đây là gate của DEMO BUILD: chạy trên bundle không có VNI_DEMO_LICENSE
 * (ví dụ `npm run watch` local) sẽ fail ngay DEMO-01 với chẩn đoán rõ ràng —
 * đúng ý đồ, vì gate này chấm bản build đang phục vụ chứ không chấm máy chạy.
 *
 *   node scripts/verify-demo-mode.cjs
 *   $env:WATCH_URL="https://charts.edusuccess.vn/?standalone=1"; node scripts/verify-demo-mode.cjs
 */
"use strict";

const { chromium } = require("playwright");
// SSOT cho key `vni_license_key` + licence thật dùng ở DEMO-04 (không hardcode lại).
const { STORAGE_KEY, stagingLicense } = require("./e2e-license.cjs");

const WATCH_URL = process.env.WATCH_URL || "https://charts.edusuccess.vn/?standalone=1";
// Phải khớp DEMO_LICENSE_OPTOUT_KEY trong src/demo/demoLicense.ts.
const STORAGE_OPTOUT = "vnsc_demo_license_off";

const LICENSE_SHAPE = /^vni1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
// Shape-valid nhưng chữ ký rác: đủ để vượt shape-check của installer, engine sẽ
// từ chối ⇒ trang free. DEMO-04 chỉ quan tâm storage có bị ghi đè hay không.
const FAKE_CUSTOMER_LICENSE = "vni1.eyJ0IjoicHJvIn0.AAAA";

const results = [];
function step(name, ok, detail, opts = {}) {
	results.push({ name, ok, blocked: !!opts.blocked, detail });
	console.log(`${opts.blocked ? " BLOCK" : ok ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** URL gốc có thể đã có sẵn query; ghép param không phá nó. */
function withParam(url, param) {
	return url.includes("?") ? `${url}&${param}` : `${url}?standalone=1&${param}`;
}

/** Storage + dấu hiệu app đã boot (module demo chạy xong ⇒ installer đã chạy). */
function readState(page) {
	return page.evaluate(
		([key, optOutKey]) => {
			let license = null;
			let optOut = null;
			try {
				license = localStorage.getItem(key);
				optOut = localStorage.getItem(optOutKey);
			} catch {
				/* ignore */
			}
			return {
				license,
				optOut,
				nudge: document.querySelectorAll('[data-testid="dock-upgrade-nudge"]').length,
				// Full-dock marker của surface standalone KHÔNG phải
				// `role=complementary` (đó là WorkspaceRightDockSlot dùng ở surface
				// khác). Standalone render qua VNInvestCharts → RightDockRail →
				// LazyRightSidebarDockHost; marker ngôn ngữ-độc lập là strip tab
				// `dock-tab-*` (host render ⇒ pro; free thì rail chỉ ra
				// DockUpgradeNudge ⇒ 0 tab).
				//
				// Đổi 2026-10-19 (DOCK_SSOT_B3 B3): marker cũ là `dock-splitter`
				// (chỉ render khi panel ĐANG MỞ). D1 đổi default sang strip-only
				// (chưa persist ⇒ không mở panel) nên splitter = 0 dù PRO — đo
				// staging: license=yes, tab=1, splitter=0. Tiêu chí vẫn là
				// "PRO quan sát được dock, FREE thấy nudge".
				dock: document.querySelectorAll('[data-testid="dock-tab-watchlist"]').length,
				// Splitter để tham khảo (không tính vào tiêu chí).
				splitter: document.querySelectorAll('[data-testid="dock-splitter"]').length,
				// Boot marker độc lập tier: widget root. Dùng để chờ "module demo đã
				// chạy xong" (⇒ installer đã chạy) ở các bước không thể dùng dock.
				boot: document.querySelectorAll('[data-testid="vninvest-charts"]').length,
			};
		},
		[STORAGE_KEY, STORAGE_OPTOUT],
	);
}

/** Poll `predicate(readState(page))` tới khi true hoặc hết budget. */
async function pollState(page, budgetMs, predicate) {
	const deadline = Date.now() + budgetMs;
	let last = null;
	while (Date.now() < deadline) {
		try {
			last = await readState(page);
		} catch {
			await sleep(250);
			continue;
		}
		if (predicate(last)) return { ok: true, state: last };
		// App booted (dock slot đã render) nhưng predicate vẫn sai: chờ tiếp vẫn
		// hữu ích vì tier resolve async (verify chữ ký), nhưng ghi nhận state cuối.
		await sleep(400);
	}
	return { ok: false, state: last };
}

(async () => {
	const browser = await chromium.launch();
	const pageErrors = [];
	const watchPage = (page) => page.on("pageerror", (e) => pageErrors.push(e.message));

	// ---- DEMO-01: visitor path tự cài blob -------------------------------
	const ctx1 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const page1 = await ctx1.newPage();
	watchPage(page1);
	await page1.goto(WATCH_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
	const r1 = await pollState(page1, 45000, (s) => s.license !== null);
	const shapeOk = r1.ok && LICENSE_SHAPE.test(r1.state.license || "");
	step(
		"DEMO-01 visitor path cài licence demo",
		shapeOk,
		shapeOk
			? `blob ${String(r1.state.license).slice(0, 24)}…`
			: r1.state
				? `không thấy blob trong 45s (nudge=${r1.state.nudge}, dock=${r1.state.dock}) — build thiếu VNI_DEMO_LICENSE?`
				: "không đọc được storage",
	);
	await ctx1.close();

	// ---- DEMO-02: PRO observable trên ?dockgate=1 ------------------------
	const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const page2 = await ctx2.newPage();
	watchPage(page2);
	await page2.goto(withParam(WATCH_URL, "dockgate=1"), { waitUntil: "domcontentloaded", timeout: 60000 });
	const r2 = await pollState(page2, 45000, (s) => s.nudge === 0 && s.dock >= 1 && s.license !== null);
	step(
		"DEMO-02 PRO observable (no nudge + dock wrapper)",
		r2.ok,
		`license=${r2.state?.license ? "yes" : "no"} nudge=${r2.state?.nudge} dock=${r2.state?.dock}`,
	);
	await ctx2.close();

	// ---- DEMO-03: đối chứng FREE qua tombstone ---------------------------
	const ctx3 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	await ctx3.addInitScript((optOutKey) => {
		try {
			localStorage.setItem(optOutKey, "1");
		} catch {
			/* ignore */
		}
	}, STORAGE_OPTOUT);
	const page3 = await ctx3.newPage();
	watchPage(page3);
	await page3.goto(withParam(WATCH_URL, "dockgate=1"), { waitUntil: "domcontentloaded", timeout: 60000 });
	const r3 = await pollState(page3, 45000, (s) => s.nudge >= 1);
	const demoBlocked = r3.ok && r3.state.license === null && r3.state.optOut === "1";
	step(
		"DEMO-03 đối chứng FREE (opt-out chặn cài + nudge hiện)",
		demoBlocked,
		`nudge=${r3.state?.nudge} dock=${r3.state?.dock} license=${r3.state?.license ? "PRESENT" : "null"}`,
	);
	await ctx3.close();

	// ---- DEMO-04: licence THẬT của khách không bị ghi đè ------------------
	// Đối tượng đúng là licence ký production (VNI_E2E_LICENSE). Một blob rác
	// shape-valid KHÔNG đại diện được "licence khách đang có": đo 2026-10-17,
	// licence rác đưa app vào trạng thái riêng (không render cả nudge lẫn dock)
	// và lần đầu gate này báo FAIL oan vì message không phân biệt `!r4.ok` với
	// "storage đổi". Không có licence thật ⇒ BLOCK (không phải PASS, không FAIL).
	const customerLicence = stagingLicense();
	if (!customerLicence) {
		step(
			"DEMO-04 không ghi đè licence khách đang có",
			false,
			"bỏ qua: không có licence thật để seed (đặt VNI_E2E_LICENSE)",
			{ blocked: true },
		);
	} else {
		const ctx4 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
		await ctx4.addInitScript(
			([key, lic]) => {
				try {
					localStorage.setItem(key, lic);
				} catch {
					/* ignore */
				}
			},
			[STORAGE_KEY, customerLicence],
		);
		const page4 = await ctx4.newPage();
		watchPage(page4);
		// `&dockgate=1` (không phải plain URL): đo 2026-10-17, trang plain KHÔNG
		// render right rail (không nudge, không dock) cho MỌI tier — chỉ `?dock`/
		// `?dockgate` mới bật. Thiếu param ⇒ predicate dock không bao giờ khớp và
		// bước này báo FAIL oan trong khi storage vẫn nguyên.
		await page4.goto(withParam(WATCH_URL, "dockgate=1"), { waitUntil: "domcontentloaded", timeout: 60000 });
		// Licence hợp lệ ⇒ trang lên PRO như DEMO-02; chờ đúng observable pro rồi
		// mới khẳng định (nếu không, "storage còn nguyên" có thể chỉ vì app chưa boot).
		const r4 = await pollState(page4, 45000, (s) => s.dock >= 1 && s.license !== null);
		if (r4.ok) await sleep(1000);
		const preserved = r4.ok && r4.state.license === customerLicence;
		step(
			"DEMO-04 không ghi đè licence khách đang có",
			preserved,
			preserved
				? "storage giữ nguyên licence đã seed"
				: r4.ok
					? "storage bị ghi đè/thay đổi sau khi app boot"
					: `không quan sát được PRO trong 45s (dock=${r4.state?.dock}, nudge=${r4.state?.nudge})`,
		);
		await ctx4.close();
	}

	// ---- DEMO-05: blob rác trong storage cũng không bị ghi đè -------------
	// Invariant rộng hơn DEMO-04: installer tuyệt đối không đụng slot đã có giá
	// trị. Nhánh này chấp nhận app ở trạng thái licence-invalid (không tier
	// sạch) nên chỉ khẳng định storage — sau khi root widget đã mount.
	const ctx5 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	await ctx5.addInitScript(
		([key, lic]) => {
			try {
				localStorage.setItem(key, lic);
			} catch {
				/* ignore */
			}
		},
		[STORAGE_KEY, FAKE_CUSTOMER_LICENSE],
	);
	const page5 = await ctx5.newPage();
	watchPage(page5);
	await page5.goto(WATCH_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
	const r5 = await pollState(page5, 45000, (s) => s.boot >= 1);
	if (r5.ok) await sleep(2000);
	const untouched = r5.ok && r5.state.license === FAKE_CUSTOMER_LICENSE;
	step(
		"DEMO-05 blob có sẵn trong slot không bị ghi đè (kể cả blob rác)",
		untouched,
		untouched
			? "storage giữ nguyên blob rác đã seed"
			: r5.ok
				? "storage bị thay đổi sau khi widget mount"
				: "widget root không mount trong 45s",
	);
	await ctx5.close();

	await browser.close();

	const graded = results.filter((r) => !r.blocked);
	const ok = graded.filter((r) => r.ok).length;
	const blocked = results.length - graded.length;
	console.log(
		`RESULT: ${ok}/${graded.length} ${ok === graded.length ? "PASS" : "FAIL"}` +
			(blocked ? ` (${blocked} step(s) blocked by an unmet precondition)` : ""),
	);
	if (pageErrors.length) {
		console.log(`page errors: ${pageErrors.length} (${pageErrors.slice(0, 3).join(" | ")})`);
	}
	process.exitCode = ok === graded.length ? 0 : 1;
})().catch((e) => {
	console.error(`FATAL: ${e.message}`);
	process.exitCode = 1;
});
