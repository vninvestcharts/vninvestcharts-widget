// verify-uiux-controls.cjs — đo LIVENESS của từng control trong tab Settings.
//
// WHY (sóng UIUX_STAGING_BASELINE_2026-10-20):
//   Sau Batch A+B, 12 slice audit chưa từng chạy trên staging, còn ~35/40 control trong UI
//   được nghi là "chết" (bật/tắt không đổi gì). "Chết" trước đây chỉ là suy đoán từ grep.
//   Probe này ĐO: bật/tắt control ⇒ vùng chart có đổi hình không?
//
// METHOD (A→B→A + kiểm tra tĩnh) — xem plan docs/upgrade-standard/plans/PLAN_UIUX_STAGING_BASELINE_2026-10-20.md §2.2:
//   S1/S2  : trạng thái A, 2 ảnh cách ≥1s. S1 != S2 => nền không tĩnh => UNDECIDABLE.
//   F1/F1' : trạng thái B, 2 ảnh cách ≥1s. F1 != F1' => UNDECIDABLE.
//   F2     : trả về trạng thái A.
//   ALIVE  : F1 != S1 && F2 == S1  (đổi rồi về đúng như cũ)
//   DEAD   : F1 == S1 && F2 == S1  (bật/tắt không đổi gì)
//   PARTIAL: F1 != S1 && F2 != S1  (dính state)
//   DRIFT  : F1 == S1 && F2 != S1
//
// BẮT BUỘC (đã audit 3 vòng — PA-1/PA-2/PA-3/NB-1..NB-4):
//   - capture LUÔN khi modal đã đóng (backdrop `fixed; inset:0; blur` phủ đúng bbox chart
//     ⇒ capture lúc modal mở = FALSE ALIVE cho mọi control).
//   - 2 ticker 1s nằm trong vùng capture: badge đếm ngược + `footer-clock` => phải tắt/che.
//   - crosshair chỉ vẽ khi hover => row crosshair phải hover ở điểm CỐ ĐỊNH.
//
// Usage: WATCH_URL=https://charts.edusuccess.vn/?standalone=1 node scripts/verify-uiux-controls.cjs
// Exit: 0 = đo đủ (có cả ALIVE/DEAD) · 2 = có control UNDECIDABLE (đo không được) · 1 = probe lỗi.
"use strict";
const { chromium } = require("playwright");
const crypto = require("node:crypto");
const fs = require("node:fs");

const WATCH_URL = process.env.WATCH_URL || "http://localhost:3000/?standalone=1";
const OUT_FILE = process.env.UIUX_PROBE_OUT || "";
/** UIUX_PROBE_LIVE=1 ⇒ chạy ở LIVE mode (bỏ qua pre-step offline) và chỉ đo control `mode:"live"`.
 *  Lý do: control nhãn X (12h/24h) cần bar INTRADAY; offline CSV chỉ có bar NGÀY ⇒ 12h/24h không
 *  khác nhau ⇒ đo ở offline sẽ cho kết luận DEAD SAI (false negative do surface, không phải do code). */
const LIVE_ONLY = process.env.UIUX_PROBE_LIVE === "1";
/** UIUX_PROBE_ONLY=<substring> ⇒ chỉ đo control có id chứa substring (debug). */
const ONLY = process.env.UIUX_PROBE_ONLY || "";

// Nhãn tab (i18n vi — surface `?standalone=1` ghim locale "vi", xem StandaloneEmbedDemo.tsx:359-360).
const TAB_SCALES = "Thang đo & Toạ độ";
const TAB_APPEARANCE = "Diện mạo & Nền";

/**
 * Hàm thuần: phân loại kết quả đo. Tách ra để self-test (L-E06) kiểm được logic mà không cần mạng.
 * @param {{s1:string,s2:string,f1:string,f1p:string,f2:string}} m
 * @returns {"ALIVE"|"DEAD"|"PARTIAL"|"DRIFT"|"UNDECIDABLE"}
 */
function classify(m) {
	if (!m || !m.s1 || !m.s2 || !m.f1 || !m.f1p || !m.f2) return "UNDECIDABLE";
	if (m.s1 !== m.s2) return "UNDECIDABLE";
	if (m.f1 !== m.f1p) return "UNDECIDABLE";
	if (m.f1 !== m.s1 && m.f2 === m.s1) return "ALIVE";
	if (m.f1 === m.s1 && m.f2 === m.s1) return "DEAD";
	if (m.f1 !== m.s1 && m.f2 !== m.s1) return "PARTIAL";
	if (m.f1 === m.s1 && m.f2 !== m.s1) return "DRIFT";
	return "UNDECIDABLE";
}

/**
 * Phân loại kết quả đo bằng **DOM text** (A→B→A trên mảng chuỗi).
 * Khác `classify` (pixel): không cần kiểm tra nền tĩnh vì không so sánh ảnh.
 * @param {{a: string[], b: string[], a2: string[]}} m
 * @returns {"ALIVE"|"DEAD"|"PARTIAL"|"DRIFT"|"UNDECIDABLE"}
 */
function classifyText(m) {
	if (!m || !Array.isArray(m.a) || !Array.isArray(m.b) || !Array.isArray(m.a2)) return "UNDECIDABLE";
	if (m.a.length === 0) return "UNDECIDABLE";
	const eq = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
	const same = eq(m.a, m.b);
	const restored = eq(m.a, m.a2);
	if (same && restored) return "DEAD";
	if (!same && restored) return "ALIVE";
	if (!same && !restored) return "PARTIAL";
	return "DRIFT";
}

/**
 * Danh sách control đo.
 * `path`  — đường dẫn field trong composite `vnsc_chart_settings_v1` (đọc lại để chứng minh
 *           thao tác đã ăn — KHÔNG phụ thuộc text UI hay tên class đã hash).
 * `kind`  — checkbox | segmented | color | presence.
 * `buttons` (segmented) — map giá trị → regex nút trong nhóm segmented.
 * `alt`   (segmented/color) — giá trị dùng cho trạng thái B (khác giá trị gốc).
 * `expect` — KỲ VỌNG của reviewer (plan §2.3), KHÔNG phải kết quả; lệch ⇒ phải giải thích.
 */
const CONTROLS = [
	{ id: "scales.invertScale", tab: "scales", kind: "checkbox", path: "scales.invertScale", label: "Đảo ngược thang đo", expect: "DEAD" },
	{ id: "scales.showSymbolLastValue", tab: "scales", kind: "checkbox", path: "scales.showSymbolLastValue", label: "Nhãn giá trị gần nhất của mã", expect: "DEAD" },
	{ id: "scales.showPrevCloseValue", tab: "scales", kind: "checkbox", path: "scales.showPrevCloseValue", label: "Nhãn giá đóng cửa phiên trước", expect: "DEAD" },
	{ id: "scales.showIndicatorValues", tab: "scales", kind: "checkbox", path: "scales.showIndicatorValues", label: "Nhãn giá trị của các chỉ báo", expect: "DEAD" },
	{
		id: "scales.showCountdownToBarClose",
		tab: "scales",
		kind: "presence",
		path: "scales.showCountdownToBarClose",
		label: "Hiển thị đồng hồ đếm ngược đóng nến",
		presenceSelector: "[data-rsc-bar-countdown]",
		// ĐO ĐƯỢC 2026-10-22 trên staging `326668f6`: **UNDECIDABLE**, không phải ALIVE.
		// Nguyên nhân (đo, không đoán): badge chỉ render khi có **dữ liệu nến** để tính
		// countdown (`BarCountdownBadge.tsx:64` → `if (!countdown || !visible) return null`)
		// và chỉ với timeframe **nội ngày** (`1M`/undefined → null, `BarCountdownBadge.test.tsx:7-13`).
		// Demo staging hiện có **0 nến** (`Số nến: 0` trên status line) vì thiếu PAT →
		// `GET /core/v1/stock-management/stocks/{symbol}/bars/` trả **401**.
		// ⇒ KHÔNG kết luận DEAD được (L-E01): cần demo có dữ liệu trước.
		expect: "UNDECIDABLE",
		note: "đo bằng DOM presence (badge chỉ render khi visible=true - BarCountdownBadge.tsx:64-71). 2026-10-22: UNDECIDABLE vì demo staging 0 nến (thiếu PAT) ⇒ cần dữ liệu + timeframe nội ngày rồi đo lại",
	},
	{
		id: "scales.priceScaleMode",
		tab: "scales",
		kind: "segmented",
		path: "scales.priceScaleMode",
		buttons: { normal: /Thông thường/, logarithmic: /Logarit/, percentage: /Phần trăm/ },
		alt: "logarithmic",
		defaultValue: "normal",
		// ĐO ĐƯỢC 2026-10-22 trên staging `326668f6`: **DEAD** (A="normal" B="logarithmic"
		// nhưng readB="logarithmic" ⇒ đổi cờ KHÔNG đổi được gì hiển thị).
		// Bảng cũ ghi "ALIVE" ⇒ **kỳ vọng sai** — đã sửa theo đo.
		expect: "DEAD",
		note: "2026-10-22: đo được DEAD (A=normal B=logarithmic, readB=logarithmic - cờ đổi mà không có gì đổi). Bảng cũ ghi ALIVE ⇒ sai",
	},
	{
		id: "scales.priceAxisPosition",
		tab: "scales",
		kind: "segmented",
		path: "scales.priceAxisPosition",
		buttons: { right: /Bên phải/, left: /Bên trái/ },
		alt: "left",
		defaultValue: "right",
		expect: "DEAD",
	},
	{
		id: "scales.timeFormat",
		tab: "scales",
		kind: "domText",
		path: "scales.timeFormat",
		// Nhãn hover của crosshair: CHỈ có khi hover và có giờ ⇒ quan sát được 12h/24h
		// (nhãn trục X ở surface này chỉ có NGÀY ⇒ không quan sát được).
		selector: '[data-rsc-fork-x-axis="hover-label"]',
		buttons: { "24h": /^24h$/, "12h": /12h/ },
		alt: "12h",
		defaultValue: "24h",
		expect: "ALIVE",
		mode: "live",
		hover: true,
		observable: /\d{1,2}:\d{2}/,
		note: "đo bằng DOM (nhãn hover crosshair — có GIờ); nhãn trục X ở surface này chỉ có ngày ⇒ không dùng để kết luận",
	},
	{ id: "appearance.vertGridVisible", tab: "appearance", kind: "checkbox", path: "appearance.vertGridVisible", label: "Lưới dọc", expect: "DEAD" },
	{ id: "appearance.horzGridVisible", tab: "appearance", kind: "checkbox", path: "appearance.horzGridVisible", label: "Lưới ngang", expect: "DEAD" },
	{
		id: "appearance.crosshairMode",
		tab: "appearance",
		kind: "segmented",
		path: "appearance.crosshairMode",
		buttons: { cross: /Chữ thập/, dot: /Điểm/, magnet: /Nam châm/ },
		alt: "dot",
		defaultValue: "cross",
		expect: "ALIVE",
		hover: true,
		clipAroundHover: 40,
		note: "vùng đo = 40x40 px quanh con trỏ (chỉ chứa crosshair, tránh nến ở rìa phải)",
	},
	{ id: "appearance.crosshairColor", tab: "appearance", kind: "color", path: "appearance.crosshairColor", label: "Màu crosshair", expect: "ALIVE", hover: true },
	{ id: "appearance.vertGridColor", tab: "appearance", kind: "color", path: "appearance.vertGridColor", label: "Lưới dọc", expect: "ALIVE" },
	{ id: "appearance.horzGridColor", tab: "appearance", kind: "color", path: "appearance.horzGridColor", label: "Lưới ngang", expect: "DEAD" },
];

const MODAL = '[data-testid="settings-modal"]';
const CHART = '[data-testid="vninvest-charts"]';

/** Chờ chart có dữ liệu thật (số nến > 0) — không dùng "text khác rỗng" (xem verify-p3.cjs:92-101). */
async function waitForChartData(page, timeout = 45000) {
	try {
		await page.waitForFunction(
			() => {
				const s = document.querySelector('[data-testid="chart-a11y-summary"]');
				const bars = s && s.getAttribute("data-bar-count");
				const n = Number(bars);
				return Number.isFinite(n) && n > 0;
			},
			undefined,
			{ timeout }
		);
		return true;
	} catch {
		return false;
	}
}

/** Đóng modal và chờ nó thật sự biến mất (backdrop phủ chart — PA-1). */
async function closeModal(page) {
	const close = page.locator('[data-testid="settings-close-btn"]').first();
	if (!(await close.count())) return false;
	await close.click();
	await page.locator(MODAL).waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
	return (await page.locator(MODAL).count()) === 0;
}

async function openModal(page) {
	const btn = page.locator('[data-testid="menu-settings-btn"]').first();
	if (!(await btn.count())) return false;
	await btn.click({ timeout: 8000 }).catch(() => {});
	await page.locator(MODAL).waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
	return (await page.locator(MODAL).count()) > 0;
}

async function selectTab(page, label) {
	// Tên truy cập của tab = icon + nhãn (SettingsModal.tsx:346-347) ⇒ khớp bằng regex, không `exact`.
	const re = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
	await page.locator(MODAL).getByRole("tab", { name: re }).first().click({ timeout: 8000 });
	await page.waitForTimeout(200);
}

/** Ổn định khung hình: 2 rAF + 350ms. */
async function settle(page) {
	await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
	await page.waitForTimeout(350);
}

/** SHA-256 của ảnh vùng chart.
 *  - `crop` (tương đối so với bbox chart): vùng đo riêng cho control cần vùng cụ thể
 *    (vd nhãn X: chart-local 746..790 — đo thật ở live mode, dải này TĨNH).
 *  - Mặc định: cắt bỏ 32px dải dưới (footer có đồng hồ tick 1s — `footer-clock`) thay vì mask:
 *    mask của Playwright vẽ hộp theo bbox phần tử nên chữ tràn ra ngoài bbox vẫn lọt (đo thật: 43px
 *    khác nhau ở góc phải dưới). Cắt dải dưới ⇒ vùng đo luôn tĩnh, không phụ thuộc mask. */
async function fingerprint(page, mask, crop, clipAroundHover) {
	const box = await page.locator(CHART).first().boundingBox();
	if (!box) return "";
	let clip;
	if (clipAroundHover && lastHover) {
		const size = clipAroundHover;
		clip = {
			x: Math.max(box.x, lastHover.x - size / 2),
			y: Math.max(box.y, lastHover.y - size / 2),
			width: size,
			height: size,
		};
	} else if (crop) {
		clip = { x: box.x + crop.left, y: box.y + crop.top, width: crop.width, height: crop.height };
	} else {
		clip = { x: box.x, y: box.y, width: box.width, height: Math.max(50, box.height - 32) };
	}
	const opts = { clip, animations: "disabled", caret: "hide" };
	if (mask && mask.length) opts.mask = mask;
	const buf = await page.screenshot(opts);
	return crypto.createHash("sha256").update(buf).digest("hex");
}

/** Đưa chuột tới điểm CỐ ĐỊNH trong vùng chart (crosshair chỉ vẽ khi hover — PA-3). */
let lastHover = null;
async function hoverChart(page) {
	const box = await page.locator(CHART).first().boundingBox();
	if (!box) return false;
	const x = box.x + Math.round(box.width * 0.5);
	const y = box.y + Math.round(box.height * 0.45);
	await page.mouse.move(x, y);
	await page.waitForTimeout(250);
	lastHover = { x, y };
	return true;
}

/** Đọc textContent của các phần tử khớp selector (mảng chuỗi, đã trim). */
async function readDomText(page, selector) {
	return await page.evaluate((sel) => Array.from(document.querySelectorAll(sel)).map((e) => (e.textContent || "").trim()), selector);
}

/** Đọc observable (DOM text) — có hover trước khi đọc nếu control cần hover (nhãn hover chỉ tồn tại khi hover). */
async function readObservable(page, c) {
	if (c.hover) await hoverChart(page);
	return await readDomText(page, c.selector);
}

/** Mở trang có retry (staging đôi lúc timeout 30s ⇒ probe không được chết vì lỗi mạng tạm). */
async function gotoWithRetry(page, url, attempts = 3) {
	let lastErr = null;
	for (let i = 0; i < attempts; i++) {
		try {
			await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
			return;
		} catch (e) {
			lastErr = e;
			await page.waitForTimeout(2000 * (i + 1));
		}
	}
	throw lastErr;
}

/** Bộ locator cho 1 control (bên trong modal). */
function controlParts(page, c) {
	const modal = page.locator(MODAL);
	if (c.kind === "checkbox" || c.kind === "presence") {
		const label = modal.locator(`label:has-text("${c.label}")`).first();
		return { label, input: label.locator('input[type="checkbox"]').first() };
	}
	if (c.kind === "segmented" || c.kind === "domText") {
		const first = Object.values(c.buttons)[0];
		const from = modal.getByRole("button", { name: first }).first();
		const group = from.locator("xpath=..");
		return { from, group, buttons: c.buttons };
	}
	// color: <span> (crosshair) hoặc <label> (màu lưới) → lấy hàng cha → input[type=color]
	const label = modal.locator(`span:text-is("${c.label}"), label:has-text("${c.label}")`).first();
	const row = label.locator("xpath=..");
	return { label, input: row.locator('input[type="color"]').first() };
}

/** Đọc giá trị field trong composite settings (SSOT) — không phụ thuộc text UI hay class đã hash.
 *  Key: `vnsc_chart_settings_v1` (legacy/global) hoặc `vnsc_chart_settings_v1_<chartId>` (multi)
 *  — xem `src/widget/components/settings/storageKeys.ts:8-21`. */
async function readComposite(page, path) {
	return await page.evaluate((p) => {
		const keys = [];
		for (let i = 0; i < localStorage.length; i += 1) {
			const k = localStorage.key(i);
			if (k && k.startsWith("vnsc_chart_settings_v1")) keys.push(k);
		}
		for (const k of keys) {
			try {
				const j = JSON.parse(localStorage.getItem(k) || "{}");
				const v = p.split(".").reduce((acc, part) => (acc == null ? acc : acc[part]), j);
				if (v !== undefined) return v;
			} catch {
				/* ignore */
			}
		}
		return undefined;
	}, path);
}

/** Đọc trạng thái hiện tại của control (A).
 *  Với `color` đọc DOM (hex) chứ không phải composite: composite lưu grid color dạng `rgba(...)`
 *  (`appearance.vertGridColor` = "rgba(255, 255, 255, 0.06)") ⇒ gán lại vào <input type=color> sẽ
 *  không hợp lệ ⇒ bước khôi phục A hỏng ⇒ verdict PARTIAL giả. */
async function readControl(page, c) {
	const p = controlParts(page, c);
	if (c.kind === "color") return await p.input.inputValue();
	const comp = await readComposite(page, c.path);
	if (comp !== undefined) return comp;
	if (c.kind === "checkbox" || c.kind === "presence") return await p.input.isChecked();
	return undefined;
}

/** Đặt control về `target` rồi đọc lại composite (bằng chứng thao tác đã ăn). */
async function setControl(page, c, target) {
	const p = controlParts(page, c);
	if (c.kind === "checkbox" || c.kind === "presence") {
		const cur = await p.input.isChecked();
		if (cur !== target) await p.input.click();
		await page.waitForTimeout(200);
		return (await readComposite(page, c.path)) ?? (await p.input.isChecked());
	}
	if (c.kind === "segmented" || c.kind === "domText") {
		const pattern = c.buttons[target];
		if (!pattern) return undefined;
		await p.group.getByRole("button", { name: pattern }).first().click();
		await page.waitForTimeout(250);
		return await readComposite(page, c.path);
	}
	await p.input.evaluate((el, v) => {
		const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
		setter.call(el, v);
		el.dispatchEvent(new Event("input", { bubbles: true }));
		el.dispatchEvent(new Event("change", { bubbles: true }));
	}, target);
	await page.waitForTimeout(250);
	return (await readComposite(page, c.path)) ?? (await p.input.inputValue());
}

/** Đo control kiểu "presence": phần tử DOM xuất hiện/biến mất theo setting.
 *  Mạnh hơn fingerprint (đo đúng hành vi: badge chỉ render khi visible=true) và không bị nhiễu tick. */
async function measurePresence(page, c) {
	const tabLabel = c.tab === "scales" ? TAB_SCALES : TAB_APPEARANCE;
	const sel = c.presenceSelector;
	const present = async () => (await page.locator(sel).count()) > 0;
	if (!(await openModal(page))) return { verdict: "UNDECIDABLE", detail: "settings modal không mở được" };
	await selectTab(page, tabLabel);
	const p = controlParts(page, c);
	if ((await p.input.count()) === 0) {
		await closeModal(page);
		return { verdict: "UNDECIDABLE", detail: `control "${c.label}" không tồn tại trong tab ${c.tab}` };
	}
	if (!(await p.input.isChecked())) await p.input.click(); // A = setting BẬT
	await closeModal(page);
	await page.waitForTimeout(500);
	const presentA = await present();
	if (!presentA) {
		return {
			verdict: "UNDECIDABLE",
			detail: "phần tử không render ở trạng thái A (thiếu timeframe/surface) ⇒ không kết luận DEAD được",
		};
	}
	await openModal(page);
	await selectTab(page, tabLabel);
	await setControl(page, c, false);
	await closeModal(page);
	await page.waitForTimeout(500);
	const presentB = await present();
	await openModal(page);
	await selectTab(page, tabLabel);
	await setControl(page, c, true);
	await closeModal(page);
	await page.waitForTimeout(500);
	const presentA2 = await present();
	const verdict =
		presentB !== presentA && presentA2 === presentA
			? "ALIVE"
			: presentB === presentA && presentA2 === presentA
				? "DEAD"
				: presentA2 !== presentA
					? "PARTIAL"
					: "UNDECIDABLE";
	return { verdict, detail: `presence A=${presentA} B=${presentB} A2=${presentA2}` };
}

/**
 * Đo control kiểu "domText": so **textContent** của các phần tử khớp selector (A→B→A).
 * Ưu điểm so với pixel: không bị nhiễu bởi nến live / anti-aliasing ⇒ kết luận chính xác.
 * Điều kiện bắt buộc (PA-1): state A phải **quan sát được** (khớp `observable`) — nếu không
 * ⇒ `UNDECIDABLE`, **không bao giờ** DEAD (tránh kết luận sai kiểu "control chết").
 */
async function measureDomText(page, c) {
	const tabLabel = c.tab === "scales" ? TAB_SCALES : TAB_APPEARANCE;
	const sel = c.selector;
	if (!(await openModal(page))) return { verdict: "UNDECIDABLE", detail: "settings modal không mở được" };
	await selectTab(page, tabLabel);
	const p = controlParts(page, c);
	const origRaw = await readControl(page, c);
	const orig = origRaw === undefined ? c.defaultValue : origRaw;
	const bValue = c.kind === "checkbox" || c.kind === "presence" ? !orig : c.alt;
	await closeModal(page);

	// State A: đọc observable.
	const a = await readObservable(page, c);
	if (a.length === 0) {
		return { verdict: "UNDECIDABLE", detail: `selector "${sel}" không trả về phần tử nào` };
	}
	if (c.observable && !a.some((t) => c.observable.test(t))) {
		return {
			verdict: "UNDECIDABLE",
			detail: `surface không quan sát được (nhãn chỉ có ngày): ${JSON.stringify(a.slice(0, 4))}`,
		};
	}

	// State B: bật/tắt control.
	await openModal(page);
	await selectTab(page, tabLabel);
	const readB = await setControl(page, c, bValue);
	await closeModal(page);
	await page.waitForTimeout(700);
	// M-6: nếu thao tác KHÔNG ăn (composite không đổi) ⇒ không được kết luận DEAD (sẽ là false DEAD).
	if (readB !== undefined && String(readB) === String(orig)) {
		return {
			verdict: "UNDECIDABLE",
			detail: `thao tác không ăn (composite vẫn = ${JSON.stringify(orig)}) ⇒ không kết luận DEAD được`,
		};
	}
	const b = await readObservable(page, c);

	// Trả lại A.
	await openModal(page);
	await selectTab(page, tabLabel);
	await setControl(page, c, orig);
	await closeModal(page);
	await page.waitForTimeout(700);
	const a2 = await readObservable(page, c);

	return {
		verdict: classifyText({ a, b, a2 }),
		detail: `A=${JSON.stringify(a.slice(0, 4))} B=${JSON.stringify(b.slice(0, 4))} A2=${JSON.stringify(a2.slice(0, 4))} readB=${JSON.stringify(readB)}`,
	};
}

/** Đo 1 control theo chuỗi A→B→A của plan §2.2 (bước 0..8). */
async function measureControl(page, c, mask) {
	if (c.kind === "presence") return await measurePresence(page, c);
	if (c.kind === "domText") return await measureDomText(page, c);
	const tabLabel = c.tab === "scales" ? TAB_SCALES : TAB_APPEARANCE;
	if (!(await openModal(page))) return { verdict: "UNDECIDABLE", detail: "settings modal không mở được" };
	await selectTab(page, tabLabel);
	const p = controlParts(page, c);
	if (c.kind === "segmented" || c.kind === "domText") {
		const pat = c.buttons[c.alt];
		if (!pat || (await p.group.getByRole("button", { name: pat }).count()) === 0) {
			await closeModal(page);
			return { verdict: "UNDECIDABLE", detail: `nút cho giá trị "${c.alt}" không tồn tại trong tab ${c.tab} (bản build này chưa có control)` };
		}
	} else if ((await p.input.count()) === 0) {
		await closeModal(page);
		return { verdict: "UNDECIDABLE", detail: `control "${c.label || c.alt}" không tồn tại trong tab ${c.tab}` };
	}
	const origRaw = await readControl(page, c);
	// Composite có thể chưa tồn tại (chưa đổi setting lần nào) ⇒ dùng giá trị mặc định để khôi phục.
	const orig = origRaw === undefined ? c.defaultValue : origRaw;
	const bValue =
		c.kind === "checkbox" || c.kind === "presence"
			? !orig
			: c.kind === "segmented"
				? c.alt
				: String(orig).toLowerCase() === "#ff00ff"
					? "#00ffff"
					: "#ff00ff";
	await closeModal(page);

	// Bước 0: baseline ở trạng thái A — 2 ảnh cách ≥3s (cửa sổ tĩnh phải dài hơn chu kỳ
	// dao động dữ liệu, không chỉ 1,2s — PA-1 vòng 1).
	await hoverChart(page);
	await settle(page);
	const s1 = await fingerprint(page, mask, c.crop, c.clipAroundHover);
	await page.waitForTimeout(3000);
	await settle(page);
	const s2 = await fingerprint(page, mask, c.crop, c.clipAroundHover);
	if (s1 !== s2)
		return {
			verdict: "UNDECIDABLE",
			detail: `nền không tĩnh (S1 != S2) · vùng đo=${JSON.stringify(c.crop || "chart-32px-dưới")} · mask=${mask.length ? "clock" : "không"}`,
		};

	// Bước 1..6: sang trạng thái B, chụp F1.
	await openModal(page);
	await selectTab(page, tabLabel);
	const readB = await setControl(page, c, bValue);
	await closeModal(page);
	await hoverChart(page);
	await settle(page);
	const f1 = await fingerprint(page, mask, c.crop, c.clipAroundHover);

	// Bước 7: F1' (trạng thái B, lần 2) — nếu lệch ⇒ nền không tĩnh.
	await page.waitForTimeout(1100);
	await settle(page);
	const f1p = await fingerprint(page, mask, c.crop, c.clipAroundHover);
	if (f1 !== f1p) return { verdict: "UNDECIDABLE", detail: "nền không tĩnh ở trạng thái B (F1 != F1')" };

	// Bước 8: trả về A, chụp F2.
	await openModal(page);
	await selectTab(page, tabLabel);
	await setControl(page, c, orig);
	await closeModal(page);
	await hoverChart(page);
	await settle(page);
	const f2 = await fingerprint(page, mask, c.crop, c.clipAroundHover);

	return {
		verdict: classify({ s1, s2, f1, f1p, f2 }),
		detail: `A=${JSON.stringify(orig)} B=${JSON.stringify(bValue)} readB=${JSON.stringify(readB)}`,
	};
}

/** Bật/tắt chế độ offline (CSV tĩnh) của demo shell ⇒ chart không còn tick theo giá live.
 *  Đo đặc: với data live (Binance), vùng chart đổi mỗi giây (nến cuối + header) ⇒ mọi fingerprint
 *  đều "không tĩnh" ⇒ không kết luận được gì. Đây là vệ sinh đo, KHÔNG phải feature của widget.
 *  Nguồn: `src/demo/StandaloneEmbedDemo.tsx:266-282` (checkbox `offlineMode`) + `:261` `data-offline-mode`. */
async function setOffline(page, on) {
	const status = page.locator('[data-testid="feed-status"]').first();
	if ((await status.count()) === 0) return { ok: false, detail: "không có feed-status" };
	const cur = (await status.getAttribute("data-offline-mode")) === "on";
	if (cur === on) return { ok: true, detail: `offline đã ${on ? "bật" : "tắt"}` };
	const box = page.locator('label:has-text("Offline CSV") input[type="checkbox"]').first();
	if ((await box.count()) === 0) return { ok: false, detail: "không tìm thấy switch offline" };
	await box.click();
	await page.waitForTimeout(1500);
	for (let i = 0; i < 20; i++) {
		if (((await status.getAttribute("data-offline-mode")) === "on") === on) break;
		await page.waitForTimeout(500);
	}
	await page.waitForTimeout(on ? 3000 : 2500);
	return { ok: ((await status.getAttribute("data-offline-mode")) === "on") === on, detail: `offline ${on ? "bật" : "tắt"}` };
}

/** Pre-step 1 (PA-2): tắt badge đếm ngược (tick 1s) trước sweep. */
async function preStepDisableBadge(page) {
	if (!(await openModal(page))) return { ok: false, detail: "modal không mở" };
	await selectTab(page, TAB_SCALES);
	const p = controlParts(page, { kind: "checkbox", label: "Hiển thị đồng hồ đếm ngược đóng nến" });
	if ((await p.input.count()) === 0) {
		await closeModal(page);
		return { ok: false, detail: "checkbox đếm ngược không tồn tại" };
	}
	const was = await p.input.isChecked();
	if (was) await p.input.click();
	await closeModal(page);
	return { ok: true, detail: was ? "đã tắt badge" : "badge vốn đã tắt" };
}

/** Bật lại badge (row 11 đo riêng) / tắt lại sau khi đo. */
async function setBadge(page, on) {
	if (!(await openModal(page))) return false;
	await selectTab(page, TAB_SCALES);
	const p = controlParts(page, { kind: "checkbox", label: "Hiển thị đồng hồ đếm ngược đóng nến" });
	if ((await p.input.count()) === 0) {
		await closeModal(page);
		return false;
	}
	if ((await p.input.isChecked()) !== on) await p.input.click();
	await closeModal(page);
	return true;
}

async function main() {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	const pageErrors = [];
	page.on("pageerror", (e) => pageErrors.push(String((e && e.message) || e)));
	const results = [];
	let fatal = "";

	try {
		await gotoWithRetry(page, WATCH_URL);
		const dataOK = await waitForChartData(page);
		const rootOK = (await page.locator(CHART).count()) > 0;
		if (!dataOK || !rootOK) {
			fatal = `chart chưa sẵn sàng (data=${dataOK} root=${rootOK})`;
		} else {
			if (!LIVE_ONLY) {
				const freeze = await setOffline(page, true);
				if (!freeze.ok) fatal = `pre-step 0 thất bại: ${freeze.detail}`;
				const pre = await preStepDisableBadge(page);
				if (!pre.ok) fatal = fatal || `pre-step 1 thất bại: ${pre.detail}`;
			}

			// Pre-step 2 (NB-1): dò ticker thứ 2 trong vùng capture để che.
			const clock = page.locator('[data-testid="footer-clock"]');
			const hasClock = (await clock.count()) > 0;
			const baseMask = hasClock ? [clock.first()] : [];

			for (const c of CONTROLS) {
				if (fatal) break;
				if (ONLY && !c.id.includes(ONLY)) continue;
				if (LIVE_ONLY && c.mode !== "live") continue;
				if (!LIVE_ONLY && c.mode === "live") continue; // đo ở run LIVE riêng
				// Control cần data intraday (nhãn X theo giờ) ⇒ đo ở LIVE mode (tắt offline tạm).
				if (c.mode === "live") {
					const off = await setOffline(page, false);
					if (!off.ok) {
						results.push({ id: c.id, expect: c.expect, note: c.note || "", verdict: "UNDECIDABLE", detail: `không tắt được offline: ${off.detail}` });
						continue;
					}
				}
				const r = await measureControl(page, c, baseMask);
				if (c.mode === "live") await setOffline(page, true);
				results.push({ id: c.id, expect: c.expect, note: c.note || "", ...r });
				console.log(`${r.verdict.padEnd(12)} ${c.id}${r.detail ? ` — ${r.detail}` : ""}`);
			}
			if (!fatal) {
				console.log(`\nmask: ${baseMask.length ? "footer-clock" : "(không có footer-clock)"}`);
			}
		}
	} catch (err) {
		fatal = `lỗi probe: ${(err && err.message) || err}`;
	} finally {
		await browser.close();
	}

	const undecidable = results.filter((r) => r.verdict === "UNDECIDABLE").length;
	// Ánh xạ verdict → exit code (contract ghi trong header + plan §2.2):
	//   0 = đo đủ (có cả ALIVE/DEAD/PARTIAL) · 2 = có control UNDECIDABLE (đo không được) · 1 = probe lỗi (fatal)
	const lines = [];
	lines.push("| control | kỳ vọng (plan §2.3) | kết quả đo | ghi chú |");
	lines.push("|---|---|---|---|");
	for (const r of results) {
		lines.push(`| \`${r.id}\` | ${r.expect || "-"} | **${r.verdict}** | ${(r.detail || "").replace(/\|/g, "/")} |`);
	}
	lines.push("");
	lines.push(`Tổng: ${results.length} control · ALIVE ${results.filter((r) => r.verdict === "ALIVE").length} · DEAD ${results.filter((r) => r.verdict === "DEAD").length} · PARTIAL ${results.filter((r) => r.verdict === "PARTIAL").length} · DRIFT ${results.filter((r) => r.verdict === "DRIFT").length} · UNDECIDABLE ${undecidable}`);
	if (fatal) lines.push(`\n**FATAL**: ${fatal}`);
	if (pageErrors.length) lines.push(`\npage errors (${pageErrors.length}): ${pageErrors.slice(0, 5).join(" | ")}`);
	const md = lines.join("\n");
	console.log("\n" + md);
	if (OUT_FILE) fs.writeFileSync(OUT_FILE, md + "\n", "utf8");

	if (fatal) return 1;
	if (undecidable > 0) return 2;
	return 0;
}

if (require.main === module) {
	main()
		.then((code) => process.exit(code))
		.catch((err) => {
			console.error("verify-uiux-controls: lỗi không ký vọng:", err);
			process.exit(1);
		});
}

module.exports = { classify, classifyText, CONTROLS };



