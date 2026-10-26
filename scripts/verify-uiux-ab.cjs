// verify-uiux-ab.cjs — probe AC runtime cho các slice Batch A/B còn nợ (UIUX_AC_RUNTIME).
//
// MỤC TIÊU: đo **hành vi** của từng slice, không đo "trông có giống". Mỗi assert phải FAIL nếu slice
// bị revert. Cơ chế (áp dụng từ W0–W5):
//   - đọc DOM trước pixel; so A→B→A trên cùng điều kiện;
//   - **precondition**: không quan sát được state A ⇒ `UNDECIDABLE` (KHÔNG FAIL);
//   - ghi **cả 2** khoá composite (thô + prefixed) với **MERGE**, đọc lại theo thứ tự adapter-first;
//   - dispatch `vnsc-settings-sync` để đổi cờ **live** (phải gửi ĐỦ mọi field của section vì
//     listener thay trọn khối: `useWidgetSettings.ts:501`, `useChartSettingsSections.ts:108`);
//   - restore **đúng key** đã ghi + assert round-trip (không xoá sạch staging);
//   - exit: 0 = đo đủ & xanh · 1 = assert FAIL · 2 = có UNDECIDABLE hoặc probe không chạy được.
//
// Usage: WATCH_URL=https://charts.edusuccess.vn node scripts/verify-uiux-ab.cjs
"use strict";
const { chromium } = require("playwright");

const WATCH_URL = process.env.WATCH_URL || "https://charts.edusuccess.vn";
const ORIGIN = new URL(WATCH_URL).origin;
const SINGLE_URL = `${ORIGIN}/?standalone=1`;
const MULTI_URL = `${ORIGIN}/`;
const HARNESS_URL = `${ORIGIN}/?noprovider=1`;
const OUT_FILE = process.env.UIUX_AB_OUT || "";
const COMPOSITE = "vnsc_chart_settings_v1";
const PREFIX = "vninvestcharts:";
const SETTLE = 6000;

const results = [];
function record(id, verdict, detail, spec) {
	results.push({ id, verdict, detail, spec });
	console.log(`${verdict.padEnd(11)} ${id}${detail ? ` — ${detail}` : ""}${spec ? ` | spec: ${spec}` : ""}`);
}

/** Hàm thuần: phân loại kết quả A→B→A (tự test được). */
function classifyText(a, b, a2) {
	if (!Array.isArray(a) || !Array.isArray(b) || !Array.isArray(a2)) return "UNDECIDABLE";
	if (a.length === 0) return "UNDECIDABLE";
	const eq = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
	const same = eq(a, b);
	const restored = eq(a, a2);
	if (same && restored) return "DEAD";
	if (!same && restored) return "ALIVE";
	if (!same && !restored) return "PARTIAL";
	return "DRIFT";
}

/** Hàm thuần: parse số từ chuỗi đã locale (ví dụ "81,312.1" ⇒ 81312.1; "Chưa có giá" ⇒ null). */
function parseNum(text) {
	if (typeof text !== "string") return null;
	const m = text.match(/-?\d[\d.,\s]*/);
	if (!m) return null;
	let s = m[0].replace(/\s/g, "");
	const lastDot = s.lastIndexOf(".");
	const lastComma = s.lastIndexOf(",");
	if (lastDot >= 0 && lastComma >= 0) {
		const dec = Math.max(lastDot, lastComma);
		const head = s.slice(0, dec).replace(/[.,]/g, "");
		const tail = s.slice(dec + 1).replace(/[.,]/g, "");
		s = head + (tail ? `.${tail}` : "");
	} else if (lastComma >= 0) {
		const parts = s.split(",");
		s = parts.length > 2 || parts[parts.length - 1].length === 3 ? s.replace(/,/g, "") : s.replace(",", ".");
	}
	const n = Number.parseFloat(s);
	return Number.isFinite(n) ? n : null;
}

/** Hàm thuần: nội suy giá theo thang pixel (2 handle làm thước đo) — null nếu thang vô nghĩa. */
function priceFromScale(p0, y0, p1, y1, y) {
	if (![p0, y0, p1, y1, y].every((v) => typeof v === "number" && Number.isFinite(v))) return null;
	if (y1 === y0) return null;
	return p0 + ((p1 - p0) * (y - y0)) / (y1 - y0);
}

/** Self-test (L-E06): chứng minh các hàm thuần phân biệt được các trường hợp. */
function selfTest() {
	const cases = [
		{ name: "classify ALIVE", got: classifyText(["a"], ["b"], ["a"]), want: "ALIVE" },
		{ name: "classify DEAD", got: classifyText(["a"], ["a"], ["a"]), want: "DEAD" },
		{ name: "classify PARTIAL", got: classifyText(["a"], ["b"], ["c"]), want: "PARTIAL" },
		{ name: "classify DRIFT", got: classifyText(["a"], ["a"], ["c"]), want: "DRIFT" },
		{ name: "classify UNDECIDABLE", got: classifyText([], [], []), want: "UNDECIDABLE" },
		{ name: "parse thousands", got: parseNum("81,312.1"), want: 81312.1 },
		{ name: "parse no quote vi", got: parseNum("Chưa có giá"), want: null },
		{ name: "parse no quote en", got: parseNum("No quote"), want: null },
		{ name: "parse comma decimal", got: parseNum("0,5"), want: 0.5 },
		{ name: "parse eu decimal", got: parseNum("1.234,5"), want: 1234.5 },
		{ name: "scale mid", got: priceFromScale(100, 0, 200, 100, 50), want: 150 },
		{ name: "scale degenerate", got: priceFromScale(100, 10, 200, 10, 50), want: null },
	];
	let failed = 0;
	for (const c of cases) {
		const ok = c.got === c.want;
		if (!ok) failed += 1;
		console.log(`${ok ? "ok  " : "FAIL"} ${c.name}: ${JSON.stringify(c.got)} (want ${JSON.stringify(c.want)})`);
	}
	console.log(`verify-uiux-ab SELF-TEST: ${cases.length - failed}/${cases.length} case`);
	return failed === 0 ? 0 : 1;
}

async function gotoWithRetry(page, url, attempts = 3) {
	let last = null;
	for (let i = 0; i < attempts; i++) {
		try {
			await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
			return;
		} catch (e) {
			last = e;
			await page.waitForTimeout(2000 * (i + 1));
		}
	}
	throw last;
}

/** Đọc chartId của surface/ô (từ `[data-chart-id]`). */
async function readChartIds(page) {
	return await page.evaluate(() => {
		const host = document.querySelector("[data-chart-id]");
		return host ? host.getAttribute("data-chart-id") : null;
	});
}

/** Ghi 1 field vào composite (2 khoá) — MERGE, không thay cả object. */
async function writeScoped(page, chartId, patch) {
	return await page.evaluate(
		({ chartId, patch, composite, prefix }) => {
			const keys = chartId ? [`${composite}_${chartId}`, `${prefix}${composite}_${chartId}`] : [composite, `${prefix}${composite}`];
			const written = [];
			for (const key of keys) {
				let state = {};
				try {
					state = JSON.parse(localStorage.getItem(key) || "{}");
				} catch {
					state = {};
				}
				for (const [section, fields] of Object.entries(patch)) {
					state[section] = { ...(state[section] || {}), ...fields };
				}
				localStorage.setItem(key, JSON.stringify(state));
				written.push(key);
			}
			return written;
		},
		{ chartId, patch, composite: COMPOSITE, prefix: PREFIX },
	);
}

/** Đọc lại composite theo thứ tự app đọc (adapter-first) để làm precondition. */
async function readEffective(page, chartId, path) {
	return await page.evaluate(
		({ chartId, path, composite, prefix }) => {
			const keys = chartId ? [`${prefix}${composite}_${chartId}`, `${composite}_${chartId}`] : [`${prefix}${composite}`, composite];
			for (const key of keys) {
				const raw = localStorage.getItem(key);
				if (!raw) continue;
				try {
					const j = JSON.parse(raw);
					const v = path.split(".").reduce((a, b) => (a == null ? a : a[b]), j);
					if (v !== undefined) return v;
				} catch {
					/* ignore */
				}
			}
			return undefined;
		},
		{ chartId, path, composite: COMPOSITE, prefix: PREFIX },
	);
}

/** Snapshot + restore chính xác các khoá đã ghi. */
async function snapshot(page) {
	return await page.evaluate((composite) => {
		const out = {};
		for (let i = 0; i < localStorage.length; i += 1) {
			const k = localStorage.key(i);
			if (k && (k.startsWith(composite) || k.startsWith(`vninvestcharts:${composite}`))) out[k] = localStorage.getItem(k);
		}
		return out;
	}, COMPOSITE);
}

async function restore(page, saved, written) {
	return await page.evaluate(
		({ saved, written }) => {
			for (const key of written) {
				const prev = Object.prototype.hasOwnProperty.call(saved, key) ? saved[key] : null;
				if (prev === null) localStorage.removeItem(key);
				else localStorage.setItem(key, prev);
			}
			return written.length;
		},
		{ saved, written },
	);
}

/** Dispatch `vnsc-settings-sync` (live, không ghi localStorage). Phải gửi ĐỦ field của section. */
async function dispatchSettings(page, state, chartId = null) {
	await page.evaluate(
		({ state, chartId }) => {
			window.dispatchEvent(new CustomEvent("vnsc-settings-sync", { detail: { chartId, state } }));
		},
		{ state, chartId },
	);
}

/** Đếm phần tử có `data-testid` bắt đầu bằng `prefix` (tuỳ chọn giới hạn trong `scope`). */
async function countByPrefix(page, prefix, scope = null) {
	return await page.evaluate(
		({ prefix, scope }) => {
			const root = scope ? document.querySelector(scope) : document;
			if (!root) return -1;
			return root.querySelectorAll(`[data-testid^="${prefix}"]`).length;
		},
		{ prefix, scope },
	);
}

/** Lấy danh sách hậu tố sau `prefix` trong `data-testid` (dùng để so id giữa panel và overlay). */
async function idsByPrefix(page, prefix, scope = null) {
	return await page.evaluate(
		({ prefix, scope }) => {
			const root = scope ? document.querySelector(scope) : document;
			if (!root) return [];
			return Array.from(root.querySelectorAll(`[data-testid^="${prefix}"]`)).map((el) =>
				(el.getAttribute("data-testid") || "").slice(prefix.length),
			);
		},
		{ prefix, scope },
	);
}

/** Đọc `style.top` (px) của một phần tử — null nếu không có/không parse được. */
async function readStyleTop(page, selector) {
	return await page.evaluate((selector) => {
		const el = document.querySelector(selector);
		if (!el) return null;
		const raw = el.style ? el.style.top : "";
		const n = Number.parseFloat(raw);
		return Number.isFinite(n) ? n : null;
	}, selector);
}

/** Đọc text của cụm O/H/L-C ở header single. */
async function readClusterText(page) {
	return await page.evaluate(() => {
		const c = document.querySelector('[data-testid="ohlc-cluster"]');
		return c ? (c.textContent || "").replace(/\s+/g, " ").trim() : null;
	});
}

/** Giá ask hiện tại (null nếu chưa có quote). */
async function readAskPrice(page) {
	const txt = await page.locator('[data-testid="ask-price"]').first().textContent().catch(() => null);
	return parseNum(txt);
}

/** Mở ticket MUA (không dùng sell: `MarketRules.ts:79` cấm SHORT ⇒ submit bị reject). */
async function openBuyTicket(page) {
	await page.locator('[data-testid="buy-btn"]').first().click();
	await page.waitForSelector('[data-testid="order-ticket-overlay"]', { timeout: 10000 });
	await page.waitForSelector('[data-testid="ticket-submit"]', { timeout: 10000 });
}

/** Tick tiến trình ticket: bật checkbox + điền giá. */
async function setTicketField(page, testid, value) {
	const input = page.locator(`[data-testid="${testid}"]`).first();
	await input.waitFor({ state: "visible", timeout: 8000 });
	await input.fill(String(value));
}

/** Submit ticket; trả về lý do nếu không submit được (⇒ UNDECIDABLE, không FAIL). */
async function submitTicket(page) {
	const submit = page.locator('[data-testid="ticket-submit"]').first();
	if (await submit.isDisabled()) {
		const err = await page.locator('[data-testid="ticket-error"]').first().textContent().catch(() => null);
		return { ok: false, reason: `submit disabled (ticket-error="${(err || "").trim()}")` };
	}
	await submit.click();
	await page.waitForTimeout(1800);
	return { ok: true, reason: "" };
}

/** Đóng ticket nếu đang mở (Escape hoặc nút cancel). */
async function closeTicket(page) {
	await page.locator('[data-testid="ticket-cancel"]').first().click().catch(() => {});
	await page.keyboard.press("Escape").catch(() => {});
	await page.waitForTimeout(400);
}

/** Khôi phục **toàn bộ** composite đã snapshot (xoá khoá mới + trả khoá cũ về đúng giá trị). */
async function restoreAll(page, saved) {
	return await page.evaluate((saved) => {
		const composite = "vnsc_chart_settings_v1";
		const prefix = "vninvestcharts:";
		for (let i = localStorage.length - 1; i >= 0; i -= 1) {
			const k = localStorage.key(i);
			if (!k) continue;
			if ((k.startsWith(composite) || k.startsWith(prefix + composite)) && !Object.prototype.hasOwnProperty.call(saved, k)) {
				localStorage.removeItem(k);
			}
		}
		for (const [k, v] of Object.entries(saved)) localStorage.setItem(k, v);
		return Object.keys(saved).length;
	}, saved);
}

/** ============ NHÓM 1 — SURFACE SINGLE (?standalone=1) ============ */
async function probeSingle(page, saved) {
	const chartId = await readChartIds(page);

	// ---------- A3: màu nút submit của ticket modal (P0-3) ----------
	if (await page.locator('[data-testid="sell-btn"]').first().count()) {
		await page.locator('[data-testid="sell-btn"]').first().click();
		await page.waitForTimeout(700);
		const submit = page.locator('[data-testid="ticket-submit"]').first();
		if (!(await submit.count())) {
			record("A3", "UNDECIDABLE", "ticket mở nhưng không thấy [data-testid=ticket-submit]", "cần kiểm tra DOM ticket modal trên staging");
		} else {
			const bg = await submit.evaluate((el) => getComputedStyle(el).backgroundColor);
			const bearish = await page.evaluate(() => {
				const probe = document.createElement("div");
				probe.style.color = "var(--vnsc-color-bearish, #ef5350)";
				document.body.appendChild(probe);
				const v = getComputedStyle(probe).color;
				probe.remove();
				return v;
			});
			const bearishRgb = await page.evaluate((c) => {
				const d = document.createElement("div");
				d.style.color = c;
				document.body.appendChild(d);
				const v = getComputedStyle(d).color;
				d.remove();
				return v;
			}, bearish);
			const same = bg === bearishRgb;
			record("A3", same ? "PASS" : "FAIL", `nút submit ticket: bg=${bg} · bearish=${bearishRgb}`, same ? "" : "nút submit không dùng màu bearish ⇒ A3 chưa có hiệu lực");
			await closeTicket(page);
		}
	} else {
		record("A3", "UNDECIDABLE", "không thấy nút mở ticket ([data-testid=sell-btn])", "cần flow mở ticket trên surface đang đo");
	}

	// ---------- A4: status line O/H/L/C bật/tắt theo showOhlc ----------
	const countCluster = async () => {
		const c = await page.evaluate(() => {
			const el = document.querySelector('[data-testid="ohlc-cluster"]');
			return el ? (el.textContent || "").replace(/\s+/g, " ").trim() : null;
		});
		return c;
	};
	const a4 = await countCluster();
	if (a4 === null) {
		record("A4", "UNDECIDABLE", "không thấy [data-testid=ohlc-cluster] trên surface này", "đo trên single surface (có OHLCHeader)");
	} else {
		const w1 = await writeScoped(page, chartId, { statusLine: { showOhlc: true } });
		await gotoWithRetry(page, SINGLE_URL);
		await page.waitForTimeout(SETTLE);
		const on = await countCluster();
		const w2 = await writeScoped(page, chartId, { statusLine: { showOhlc: false } });
		await gotoWithRetry(page, SINGLE_URL);
		await page.waitForTimeout(SETTLE);
		const off = await countCluster();
		const w3 = await writeScoped(page, chartId, { statusLine: { showOhlc: true } });
		await gotoWithRetry(page, SINGLE_URL);
		await page.waitForTimeout(SETTLE);
		const on2 = await countCluster();
		await restore(page, saved, [...w1, ...w2, ...w3]);
		const verdict = on && off === null && on2 ? "PASS" : on && off !== null ? "FAIL" : "UNDECIDABLE";
		record("A4", verdict, `showOhlc=true ⇒ ${on ? "có" : "vắng"} · false ⇒ ${off === null ? "vắng" : "còn"} · trở lại true ⇒ ${on2 ? "có" : "vắng"}`, verdict === "UNDECIDABLE" ? "kiểm tra lại vùng hiển thị của status line trên surface này" : "");
	}

	// ---------- SV: statusLine.showVolume ở SINGLE (BUGFIX UIUX_AC_RUNTIME) ----------
	const statusLine = (showVolume) => ({ statusLine: { showTicker: true, showOhlc: true, showBarChange: true, showVolume } });
	const hasVol = (t) => t != null && /Vol/.test(t);
	const svBase = await readClusterText(page);
	if (svBase === null) {
		record("SV", "UNDECIDABLE", "không thấy [data-testid=ohlc-cluster] để đo showVolume", "đo trên single surface");
	} else {
		await dispatchSettings(page, statusLine(true));
		await page.waitForTimeout(800);
		const svOn = await readClusterText(page);
		await dispatchSettings(page, statusLine(false));
		await page.waitForTimeout(800);
		const svOff = await readClusterText(page);
		await dispatchSettings(page, statusLine(true));
		await page.waitForTimeout(800);
		const svOn2 = await readClusterText(page);
		const verdict = hasVol(svOn) && !hasVol(svOff) && hasVol(svOn2) ? "PASS" : hasVol(svOn) && hasVol(svOff) ? "FAIL" : "UNDECIDABLE";
		record("SV", verdict, `showVolume=true ⇒ ${hasVol(svOn) ? "có Vol" : "vắng"} · false ⇒ ${hasVol(svOff) ? "còn Vol" : "vắng"} · true lại ⇒ ${hasVol(svOn2) ? "có Vol" : "vắng"}`, verdict === "UNDECIDABLE" ? "kiểm tra lại nơi render Vol ở surface single" : "");
	}

	// ---------- A1: TP/bracket (P0-2, N-1, N-8) ----------
	const ask = await readAskPrice(page);
	let tpPrice = null;
	let slPrice = null;
	if (ask === null) {
		record("A1", "UNDECIDABLE", "chưa có giá ask (ask-price không phải số) ⇒ không đặt được lệnh", "cần quote live trên staging (ask-price parse được số)");
	} else {
		tpPrice = Math.round(ask * 1.01 * 10) / 10;
		slPrice = Math.round(ask * 0.99 * 10) / 10;
		await openBuyTicket(page);
		await page.locator('[data-testid="tp-check"]').first().check();
		await setTicketField(page, "tp-price", tpPrice);
		await page.locator('[data-testid="sl-check"]').first().check();
		await setTicketField(page, "sl-price", slPrice);
		const sub = await submitTicket(page);
		if (!sub.ok) {
			record("A1", "UNDECIDABLE", `không submit được: ${sub.reason}`, "cần balance/giá phù hợp để đặt lệnh bracket trên staging");
			await closeTicket(page);
		} else {
			const pos = await countByPrefix(page, "position-line-");
			const hTp = await countByPrefix(page, "handle-TP");
			const hSl = await countByPrefix(page, "handle-SL");
			const pending = await countByPrefix(page, "pending-line-");
			const ok = pos === 1 && hTp >= 1 && hSl >= 1 && pending === 0;
			record("A1", ok ? "PASS" : "FAIL", `ask=${ask} · tp=${tpPrice} · sl=${slPrice} ⇒ position-line=${pos} · handle-TP=${hTp} · handle-SL=${hSl} · pending-line=${pending}`, ok ? "" : "P0-2 (TP commit sai field ⇒ handle không bám giá) hoặc N-8 (child bracket bị render thành lệnh chờ) chưa đúng");
		}
	}

	// ---------- A2: drag handle + host offset (N-7, F-TRADE-06) ----------
	const yTp0 = await readStyleTop(page, '[data-testid="handle-grip-TP"]');
	const ySl0 = await readStyleTop(page, '[data-testid="handle-grip-SL"]');
	if (yTp0 === null || ySl0 === null || tpPrice === null || slPrice === null) {
		record("A2", "UNDECIDABLE", "chưa có 2 handle TP/SL để kéo (cần A1 tạo position + bracket trước)", "cần flow A1 thành công trước khi kéo");
	} else {
		const grip = page.locator('[data-testid="handle-grip-TP"]').first();
		const box = await grip.boundingBox();
		if (!box) {
			record("A2", "UNDECIDABLE", "không lấy được boundingBox của handle-grip-TP", "cần handle hiển thị trong khung nhìn");
		} else {
			const x = box.x + box.width / 2;
			const y0 = box.y + box.height / 2;
			await page.mouse.move(x, y0);
			await page.waitForTimeout(200);
			await page.mouse.down();
			await page.mouse.move(x, y0 - 40, { steps: 10 });
			await page.waitForTimeout(250);
			const yDuring = await readStyleTop(page, '[data-testid="handle-grip-TP"]');
			const tipText = await page.locator('[data-testid="handle-tooltip-TP"]').first().textContent().catch(() => null);
			await page.mouse.up();
			await page.waitForTimeout(600);
			const yAfter = await readStyleTop(page, '[data-testid="handle-grip-TP"]');
			const tipPrice = parseNum((tipText || "").split(":").pop());
			const expected = priceFromScale(tpPrice, yTp0, slPrice, ySl0, yDuring);
			const perPx = Math.abs((tpPrice - slPrice) / (yTp0 - ySl0));
			const tol = Math.max(4 * perPx, 0.001 * ask);
			const moved = yDuring !== null && yDuring !== yTp0;
			const committed = yAfter !== null && yDuring !== null && Math.abs(yAfter - yDuring) <= 2;
			let verdict = "PASS";
			if (!moved) verdict = "FAIL";
			else if (tipPrice === null || expected === null) verdict = "UNDECIDABLE";
			else if (Math.abs(tipPrice - expected) > tol) verdict = "FAIL";
			else if (!committed) verdict = "FAIL";
			record("A2", verdict, `style.top: trước=${yTp0} · kéo=${yDuring} · sau commit=${yAfter} · tooltip price=${tipPrice} · giá kỳ vọng theo thang 2 handle=${expected === null ? null : Math.round(expected * 100) / 100} · tol=${Math.round(tol * 100) / 100}`, verdict === "UNDECIDABLE" ? "cần tooltip giá + 2 handle ở 2 mức giá khác nhau để dựng thang" : "");
		}
	}

	// ---------- B5: showPaperOrders / showPaperPositions ----------
	// ⚠ Nửa "pending-line" cần một lệnh LIMIT **đang chờ** nằm TRONG vùng giá hiển thị.
	// Balance giấy = 100_000 (`MarketRules.ts:17`) mà giá BTC ~85k ⇒ sau market BUY của A1
	// chỉ còn ~15k ⇒ lệnh LIMIT rẻ hơn vậy nằm NGOÀI vùng hiển thị ⇒ `PendingOrderOverlay`
	// bị ẩn theo bounds (`PendingOrderOverlay.tsx:22`) ⇒ **không** dựng được pending line
	// trên surface single. ⇒ phần pending-line đo ở surface MULTI (đối chiếu §3) hoặc cần
	// nạp vốn qua `PaperCapitalDialog` (`header-reset` → `capital-input` → `capital-confirm`).
	if (ask === null) {
		record("B5", "UNDECIDABLE", "chưa có giá ask ⇒ không tạo được position để đo cờ", "cần quote live");
	} else {
		const base = {
			pending: await countByPrefix(page, "pending-line-"),
			position: await countByPrefix(page, "position-line-"),
			handleTp: await countByPrefix(page, "handle-TP"),
			handleSl: await countByPrefix(page, "handle-SL"),
		};
		await dispatchSettings(page, { tradingEvents: { showCorporateEvents: true, showPaperOrders: false, showPaperPositions: true } });
		await page.waitForTimeout(900);
		const noOrders = {
			pending: await countByPrefix(page, "pending-line-"),
			handleTp: await countByPrefix(page, "handle-TP"),
			handleSl: await countByPrefix(page, "handle-SL"),
		};
		await dispatchSettings(page, { tradingEvents: { showCorporateEvents: true, showPaperOrders: true, showPaperPositions: false } });
		await page.waitForTimeout(900);
		const noPositions = { position: await countByPrefix(page, "position-line-") };
		await dispatchSettings(page, { tradingEvents: { showCorporateEvents: true, showPaperOrders: true, showPaperPositions: true } });
		await page.waitForTimeout(900);
		const restored = {
			pending: await countByPrefix(page, "pending-line-"),
			position: await countByPrefix(page, "position-line-"),
			handleTp: await countByPrefix(page, "handle-TP"),
			handleSl: await countByPrefix(page, "handle-SL"),
		};
		// Discriminator: `showPaperOrders=false` ⇒ handle SL/TP vắng (handle vẽ từ model của vị thế,
		// `TradingChartSurface.tsx:146-149`); `showPaperPositions=false` ⇒ line vị thế vắng (`:137`).
		const ok =
			base.position >= 1 && base.handleTp >= 1 && base.handleSl >= 1 &&
			noOrders.handleTp === 0 && noOrders.handleSl === 0 &&
			noPositions.position === 0 &&
			restored.position === base.position && restored.handleTp === base.handleTp && restored.handleSl === base.handleSl;
		record("B5", ok ? "PASS" : "FAIL", `nền (position=${base.position}, handleTP=${base.handleTp}, handleSL=${base.handleSl}, pending=${base.pending}) · showPaperOrders=false (handleTP=${noOrders.handleTp}, handleSL=${noOrders.handleSl}) · showPaperPositions=false (position=${noPositions.position}) · khôi phục (position=${restored.position}, handleTP=${restored.handleTp}, handleSL=${restored.handleSl})`, ok ? "" : "cờ showPaperOrders/showPaperPositions không làm ẩn handle/line ⇒ B5 chưa nối đúng");
		record("B5-pending", "UNDECIDABLE", "nửa `pending-line-*` chưa đo được: cần lệnh LIMIT đang chờ nằm trong vùng giá hiển thị", "cần (i) nạp vốn qua PaperCapitalDialog (multi surface: `header-reset` → `capital-input` → `capital-confirm`) vì balance 100k < giá BTC ~85k, hoặc (ii) đo trên symbol rẻ hơn — lệnh LIMIT rẻ hơn bị ẩn theo bounds (`PendingOrderOverlay.tsx:22`)");
		record("B5-corp", "UNDECIDABLE", "showCorporateEvents là marker engine: không có DOM phản ánh được ở surface hiện tại", "cần (i) symbol PHI-Crypto (demo chỉ dùng crypto ⇒ corporateEvents.ts:4-9 loại hết), (ii) corporateEventsMode=\"demo\" (VNInvestCharts.tsx:1027 — demo không set), (iii) adapter có fetchCorporateEvents (không adapter nào trong repo implement) ⇒ DOM hook có sẵn: div[data-rsc-fork-overlay=\"corporate-events\"] (ForkEngineSurface.tsx:177) — DATA GAP, không phải UI gap");
	}

	// ---------- B3: symbol.candleStyle → chart type (đo trên SINGLE) ----------
	const readChartType = async () => {
		const btn = page.locator('[data-testid="chart-type-btn"]').first();
		if (!(await btn.count())) return null;
		if ((await btn.getAttribute("aria-expanded")) !== "true") {
			await btn.click();
			await page.waitForTimeout(400);
		}
		const v = await page.evaluate(() => {
			const li = document.querySelector('li[role="option"][aria-selected="true"]');
			return li ? li.getAttribute("data-chart-type") : null;
		});
		await page.keyboard.press("Escape").catch(() => {});
		await page.waitForTimeout(250);
		return v;
	};
	const b3a = await readChartType();
	if (b3a === null) {
		record("B3", "UNDECIDABLE", "không thấy [data-testid=chart-type-btn] trên single", "cần bật control chart type ở header của chính chart đo");
	} else {
		const target = b3a === "line" ? "candle" : "line";
		const back = target === "line" ? "candle" : "line";
		await dispatchSettings(page, { symbol: { candleStyle: target } });
		await page.waitForTimeout(1000);
		const b3b = await readChartType();
		await dispatchSettings(page, { symbol: { candleStyle: back } });
		await page.waitForTimeout(1000);
		const b3a2 = await readChartType();
		const cls = classifyText(b3a ? [b3a] : [], b3b ? [b3b] : [], b3a2 ? [b3a2] : []);
		record("B3", cls === "ALIVE" ? "PASS" : cls === "DEAD" ? "FAIL" : "UNDECIDABLE", `chart type (single, li[aria-selected][data-chart-type]): ${b3a} → ${b3b} → ${b3a2}`, cls === "ALIVE" ? "" : "nếu DEAD ⇒ effect `symbol.candleStyle → setChartType` (VNInvestCharts.tsx:788-801) không chạy");
	}
}

/** ============ NHÓM 2 — SURFACE MULTI (/) ============ */
async function probeMulti(page) {
	// ---------- B1: ô multi không có dải trùng + toggle scoped theo chartId ----------
	const cells = await page.evaluate(() =>
		Array.from(document.querySelectorAll('[data-testid="vninvest-charts"]')).map((cell) => {
			const host = cell.closest("[data-chart-id]") || cell;
			const toolbar = cell.querySelector('[data-testid="price-pane-header"]');
			return {
				chartId: host.getAttribute("data-chart-id"),
				strips: cell.querySelectorAll('[data-testid="cell-status-line"]').length,
				hasOpen: toolbar ? /O[:]?\d/.test(toolbar.textContent || "") : false,
				hasVol: toolbar ? /Vol[:]?\d/.test(toolbar.textContent || "") : false,
			};
		}),
	);
	if (!cells.length) {
		record("B1", "UNDECIDABLE", "không thấy ô multi nào (chạy sai surface?)", "chạy lại với URL multi (không ?standalone=1)");
	} else if (!cells.some((c) => c.hasOpen || c.hasVol)) {
		record("B1", "UNDECIDABLE", "ô không có toolbar [data-testid=price-pane-header] ⇒ không phải surface multi", "chạy lại trên surface multi (URL không có ?standalone=1)");
	} else {
		const withStrip = cells.filter((c) => c.strips > 0);
		const withOpen = cells.filter((c) => c.hasOpen);
		let toggledOk = null;
		const written = [];
		for (const c of cells) {
			if (!c.chartId) continue;
			const w = await writeScoped(page, c.chartId, { statusLine: { showOhlc: false } });
			written.push(...w);
			break;
		}
		if (written.length) {
			await gotoWithRetry(page, MULTI_URL);
			await page.waitForTimeout(SETTLE + 3000);
			const after = await page.evaluate(() =>
				Array.from(document.querySelectorAll('[data-testid="vninvest-charts"]')).map((cell) => {
					const toolbar = cell.querySelector('[data-testid="price-pane-header"]');
					return {
						hasOpen: toolbar ? /O[:]?\d/.test(toolbar.textContent || "") : false,
						hasVol: toolbar ? /Vol[:]?\d/.test(toolbar.textContent || "") : false,
					};
				}),
			);
			const idx = cells.findIndex((c) => c.chartId);
			if (idx >= 0) {
				const t = after[idx];
				toggledOk = t && t.hasOpen === false && t.hasVol === true;
			}
			await restoreAll(page, {});
		}
		const verdict = withStrip.length === 0 && withOpen.length === cells.length && toggledOk === true ? "PASS" : "FAIL";
		record("B1", verdict, `ô có dải trùng = ${withStrip.length}/${cells.length} · ô hiện O/H/L-C = ${withOpen.length}/${cells.length} · toggle scoped ẩn O nhưng giữ Vol = ${toggledOk}`, verdict === "PASS" ? "" : "kiểm tra phần toggle scoped theo chartId");
	}

	// ---------- A6: một replay book cho mọi ô (P0-1) ----------
	const cellSel = '[data-chart-id="chart-1"]';
	const canvasSel = `${cellSel} canvas[data-vn-kline-engine="canvas"]`;
	const cellCount = await page.locator("[data-chart-id]").count();
	if (cellCount < 4) {
		record("A6", "UNDECIDABLE", `chỉ ${cellCount} ô multi (cần 4 ⇒ tier pro; free bị cap 2)`, "cần license pro trên staging (demo tự cài VNI_DEMO_LICENSE)");
	} else {
		const canvas = page.locator(canvasSel).first();
		await canvas.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
		const box = await canvas.boundingBox().catch(() => null);
		const toggle = page.locator('[data-testid="replay-toggle"]').first();
		if (!box) {
			record("A6", "UNDECIDABLE", "không thấy canvas engine ở chart-1", "cần ô multi render chart fork runtime");
		} else if (!(await toggle.count())) {
			record("A6", "UNDECIDABLE", "không thấy [data-testid=replay-toggle] trên surface multi", "cần header workspace render replay toggle");
		} else {
			const x1 = box.x + box.width * 0.45;
			const y1 = box.y + box.height * 0.35;
			await page.mouse.move(x1, y1);
			await page.waitForTimeout(400);
			await toggle.click();
			// ⚠ Click vào nút đã đưa chuột RỜI canvas ⇒ crosshair bị clear ⇒
			// `ReplayCutOverlay` trả null (crosshair = null) ⇒ phải hover LẠI canvas
			// thì overlay mới hiện (đo thật 2026-10-21: hover lại ⇒ cutOverlay = 1).
			await page.mouse.move(x1, y1);
			await page.waitForTimeout(600);
			const cutSel = `${cellSel} [data-testid="replay-cut-overlay"]`;
			const cutOk = await page
				.waitForSelector(cutSel, { timeout: 8000 })
				.then(() => true)
				.catch(() => false);
			if (!cutOk) {
				record("A6", "UNDECIDABLE", "bật replay không tạo cut overlay ở chart-1 (tier chặn replay HOẶC click trượt vùng plot)", "cần hover đúng vùng nến trước khi bật replay; nếu tier free ⇒ replay bị gate (useChartImperativeHandle.ts:987)");
			} else {
				await page.mouse.move(x1, y1);
				await page.waitForTimeout(300);
				await page.mouse.click(x1, y1);
				await page.waitForTimeout(800);
				const panelBtn = page.getByTitle(/Giao dịch mô phỏng|Paper Trading/).first();
				if (!(await panelBtn.count())) {
					record("A6", "UNDECIDABLE", "không thấy nút mở panel Paper Trading ở footer", "cần footer multi render tab Paper Trading (MultiChartsFooter.tsx:268-276)");
				} else {
					await panelBtn.click();
					await page.waitForSelector('[data-testid="trading-bottom-panel"]', { timeout: 10000 }).catch(() => {});
					const box2 = (await canvas.boundingBox().catch(() => null)) || box;
					const x2 = box2.x + box2.width * 0.4;
					const y2 = box2.y + box2.height * 0.35;
					await page.mouse.move(x2, y2);
					await page.waitForTimeout(400);
					await page.mouse.click(x2, y2);
					await page.waitForTimeout(900);
					const fwd = page.getByTitle(/Tiến 1 nến|Step forward/).first();
					if (await fwd.count()) {
						await fwd.click().catch(() => {});
						await page.waitForTimeout(1400);
					}
					const panelIds = await idsByPrefix(page, "position-row-", '[data-testid="trading-bottom-panel"]');
					const cellIds = await idsByPrefix(page, "position-line-", cellSel);
					const shared = panelIds.filter((id) => cellIds.includes(id));
					let verdict = "UNDECIDABLE";
					if (panelIds.length && cellIds.length) verdict = shared.length ? "PASS" : "FAIL";
					else if (!panelIds.length && !cellIds.length) verdict = "UNDECIDABLE";
					record("A6", verdict, `panel position ids=[${panelIds.join(",")}] · overlay position ids ở chart-1=[${cellIds.join(",")}] · id chung=[${shared.join(",")}]`, verdict === "UNDECIDABLE" ? "cần lệnh replay fill (market order chỉ fill ở nến kế tiếp) + panel đọc đúng sổ workspace" : "");
				}
			}
		}
	}
}

/** ============ NHÓM 3 — HARNESS A5 (?noprovider=1) ============ */
async function probeHarness(browser) {
	const viewport = { width: 1920, height: 1080 };
	const readCells = async (page) => {
		await page.waitForTimeout(14000);
		return await page.locator("[data-chart-id]").count();
	};
	const ctxPro = await browser.newContext({ viewport });
	const pagePro = await ctxPro.newPage();
	let proCount = 0;
	try {
		await gotoWithRetry(pagePro, HARNESS_URL);
		proCount = await readCells(pagePro);
	} finally {
		await ctxPro.close();
	}
	const ctxFree = await browser.newContext({ viewport });
	const pageFree = await ctxFree.newPage();
	let freeCount = 0;
	try {
		await pageFree.addInitScript(() => {
			try {
				localStorage.setItem("vnsc_demo_license_off", "1");
			} catch {
				/* ignore */
			}
		});
		await gotoWithRetry(pageFree, HARNESS_URL);
		freeCount = await readCells(pageFree);
	} finally {
		await ctxFree.close();
	}
	let verdict = "UNDECIDABLE";
	if (proCount === 0) verdict = "UNDECIDABLE";
	else if (proCount >= 3) verdict = "PASS";
	else verdict = "FAIL";
	record("A5", verdict, `harness KHÔNG wrap provider: tier pro ⇒ ${proCount} ô (kỳ vọng 3) · đối chứng tier free (opt-out license) ⇒ ${freeCount} ô (kỳ vọng 2 = cap free)`, verdict === "FAIL" ? "cap 2 ở tier pro ⇒ `VNInvestMultiCharts` KHÔNG tự wrap `SaaSFeatureProvider` (RD-09 chưa fix)" : "");
	record("A5-ctl", freeCount === 2 ? "PASS" : "UNDECIDABLE", `đối chứng tier free: ${freeCount} ô (kỳ vọng 2 — resolveMaxChartsForTier("free")=2, multiChartDefaults.ts:21-25)`, "");
}

async function main() {
	if (process.argv.includes("--self-test")) return selfTest();
	const browser = await chromium.launch();
	const pageErrors = [];
	try {
		const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
		const page = await ctx.newPage();
		page.on("pageerror", (e) => pageErrors.push(String((e && e.message) || e)));
		await gotoWithRetry(page, SINGLE_URL);
		await page.waitForTimeout(9000);
		const saved = await snapshot(page);
		await probeSingle(page, saved);
		await restoreAll(page, saved);
		await gotoWithRetry(page, MULTI_URL);
		await page.waitForTimeout(14000);
		await probeMulti(page);
		await restoreAll(page, saved);
		await probeHarness(browser);
	} catch (e) {
		record("probe", "UNDECIDABLE", `lỗi probe: ${(e && e.message) || e}`, "");
	} finally {
		await browser.close();
	}

	if (pageErrors.length) console.log(`\npage errors (${pageErrors.length}): ${pageErrors.slice(0, 3).join(" | ")}`);
	const failed = results.filter((r) => r.verdict === "FAIL").length;
	const undec = results.filter((r) => r.verdict === "UNDECIDABLE").length;
	const md = [
		"| slice | verdict | chi tiết |",
		"|---|---|---|",
		...results.map((r) => `| ${r.id} | **${r.verdict}** | ${(r.detail || "").replace(/\|/g, "/")}${r.spec ? ` <br>spec: ${r.spec.replace(/\|/g, "/")}` : ""} |`),
		"",
		`Tổng: ${results.length} slice · PASS ${results.length - failed - undec} · FAIL ${failed} · UNDECIDABLE ${undec}`,
		"",
		"> Exit code: 0 = đo đủ & xanh · 1 = có assert FAIL · 2 = có UNDECIDABLE (probe **không** dùng làm gate CI).",
	].join("\n");
	console.log("\n" + md);
	if (OUT_FILE) require("node:fs").writeFileSync(OUT_FILE, md + "\n", "utf8");
	if (failed > 0) return 1;
	if (undec > 0) return 2;
	return 0;
}

main()
	.then((code) => process.exit(code))
	.catch((e) => {
		console.error("verify-uiux-ab: lỗi không kỳ vọng:", e);
		process.exit(2);
	});

