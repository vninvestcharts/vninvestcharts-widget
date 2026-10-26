// D6: settings-fix runtime probe (Stage 6.0) — khuôn scripts/verify-p3.cjs.
// Usage (staging): WATCH_URL=https://charts.edusuccess.vn/ node scripts/verify-settings-fix.cjs
// Surface: Stage 6.0 dùng ROOT (MultiChartsShowcaseDemo) — surface này pin `theme`
// prop qua VNInvestMultiCharts nên đo được đúng live propagation của preset (F-07:
// fix route qua prop onThemePresetChange). `?standalone=1` pin theme 2-mode ở demo
// shell (pre-existing, có chủ ý) — preset ở đó chỉ ghi storage, attr không live.
// Locale: các label dưới đây là chuỗi vi từ widget i18n (demo root + standalone đều vi).
const { chromium } = require("playwright");

const WATCH_URL = process.env.WATCH_URL || "http://localhost:3000/?standalone=1";
const results = [];
const pageErrors = [];

function step(name, ok, detail = "") {
	results.push({ name, ok });
	console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
}

function blocked(name, why) {
	results.push({ name, ok: false, blocked: true });
	console.log(`FAIL ${name} (BLOCKED: ${why})`);
}

const L = {
	tabTrading: /Giao dịch & Sự kiện/,
	tabTheme: /Chủ đề & Màu sắc/,
	cvdEnable: "Hiển thị chỉ báo CVD",
	cvdHistogram: "Cột (Histogram)",
	audioLabel: "Bật chuông âm thanh khi kích hoạt cảnh báo giá",
	presetMidnight: "Midnight Blue",
	menuLog: "Logarit",
	menuAuto: "Tự động",
	menuResetZoom: "Đặt lại zoom giá",
};

// Bằng chứng dữ liệu thật: data-bar-count > 0 (không phụ thuộc locale, không placeholder).
async function waitForChartData(page, timeout = 45000) {
	try {
		await page.waitForFunction(
			() => {
				const summary = document.querySelector('[data-testid="chart-a11y-summary"]');
				const bars = summary && summary.getAttribute("data-bar-count");
				if (bars === null || bars === undefined || bars === "") return false;
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

async function readStored(page, prefix) {
	return page.evaluate((p) => {
		const out = [];
		for (let i = 0; i < localStorage.length; i += 1) {
			const k = localStorage.key(i);
			if (k && k.startsWith(p)) out.push(`${k}=${localStorage.getItem(k)}`);
		}
		return out;
	}, prefix);
}

// test: chuỗi predicate nhận mảng giá trị đã lưu (serialize vào page).
async function waitForStored(page, prefix, test, timeout = 6000) {
	try {
		await page.waitForFunction(
			({ p, t }) => {
				const values = [];
				for (let i = 0; i < localStorage.length; i += 1) {
					const k = localStorage.key(i);
					if (k && k.startsWith(p)) values.push(localStorage.getItem(k));
				}
				// eslint-disable-next-line no-new-func
				return new Function("values", `return (${t})(values);`)(values);
			},
			{ p: prefix, t: test },
			{ timeout }
		);
		return true;
	} catch {
		return false;
	}
}

async function openSettings(page) {
	await page.locator('[data-testid="menu-settings-btn"]').click();
	await page.locator('[data-testid="settings-modal"]').waitFor({ state: "visible", timeout: 5000 });
	return true;
}

async function closeSettings(page) {
	await page.locator('[data-testid="settings-close-btn"]').click();
	await page.locator('[data-testid="settings-modal"]').waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
}

// Menu trục giá mở bằng right-click trên vùng Y-axis (useScaleOverlays.handleSurfaceContextMenu).
// Hình học axis không ổn định giữa các theme/scale → quét điểm: phân biệt menu giá bằng
// item "Đặt lại zoom giá" (drawing menu không có). Menu lạ (drawing) → Escape, thử điểm khác.
async function openScaleMenu(page) {
	const box = await page.locator('[data-testid="vninvest-charts"]').first().boundingBox();
	if (!box || box.width < 100 || box.height < 100) return false;
	const ys = [box.y + Math.min(240, box.height * 0.4), box.y + Math.min(420, box.height * 0.62)];
	for (const y of ys) {
		for (let i = 0; i < 14; i += 1) {
			const x = box.x + box.width - 30 - i * 24;
			if (x < box.x + 40) break;
			await page.mouse.click(x, y, { button: "right" });
			await page.waitForTimeout(120);
			const isPriceMenu = await page
				.evaluate((label) => {
					const items = Array.from(document.querySelectorAll('[role="menuitem"]'));
					return items.some((b) => (b.textContent || "").includes(label));
				}, L.menuResetZoom)
				.catch(() => false);
			if (isPriceMenu) return true;
			const anyMenu = (await page.locator('[role="menuitem"]').count().catch(() => 0)) > 0;
			if (anyMenu) await page.keyboard.press("Escape");
		}
	}
	return false;
}

async function clickMenuItem(page, text) {
	await page.locator(`[role="menuitem"]:has-text("${text}")`).first().click();
}

async function main() {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	page.on("pageerror", (e) => pageErrors.push(String(e?.message || e)));

	try {
		// S6-01: load + dữ liệu thật (nến > 0).
		await page.goto(WATCH_URL, { waitUntil: "domcontentloaded" });
		const dataOK = await waitForChartData(page);
		const rootOK = (await page.locator('[data-testid="vninvest-charts"]').count()) > 0;
		step("S6-01 load + chart data", dataOK && rootOK, `data=${dataOK} root=${rootOK}`);
		if (!dataOK || !rootOK) {
			for (const id of ["S6-02..S6-11b"]) blocked(id, "chart data không load");
			return;
		}

		// S6-02: mở modal settings từ header.
		let modalOK = false;
		try {
			modalOK = await openSettings(page);
		} catch {
			modalOK = false;
		}
		step("S6-02 mở settings modal", modalOK);
		if (!modalOK) {
			for (const id of ["S6-03..S6-11b"]) blocked(id, "modal không mở");
			return;
		}

		// S6-03: cvdMode=histogram qua UI (S-01: key scoped phải được ghi).
		await page.getByRole("tab", { name: L.tabTrading }).click();
		if ((await page.locator(`button:has-text("${L.cvdHistogram}")`).count()) === 0) {
			await page.locator(`label:has-text("${L.cvdEnable}") input[type="checkbox"]`).click();
		}
		const histBtn = page.locator(`button:has-text("${L.cvdHistogram}")`).first();
		const oscBtn = page.locator(`button:has-text("Oscillator")`).first();
		await histBtn.click();
		await page.waitForTimeout(150);
		// F-01 (Stage 5 audit): webpack demo build HASH class CSS module
		// (`config/webpack.config.js` css-loader mặc định; artifact build chứng minh
		// "segmentedBtnActive" không tồn tại trong DOM). Build-agnostic: capture
		// className của button active NGAY sau click, so EQUALITY sau reload.
		const activeCvdClass = await histBtn.evaluate((b) => b.className);
		const inactiveCvdClass = await oscBtn.evaluate((b) => b.className);
		const cvdClassCapture = activeCvdClass !== inactiveCvdClass && activeCvdClass.length > 0;
		const cvdOK = await waitForStored(page, "vnsc_settings_cvdMode", `(v) => v.some((x) => x === "histogram")`);
		step(
			"S6-03 cvdMode=histogram ghi qua UI",
			cvdOK && cvdClassCapture,
			`write=${cvdOK} capture=${cvdClassCapture} [${(await readStored(page, "vnsc_settings_cvdMode")).join(" | ")}]`
		);

		// S6-04: alert audio ON qua UI.
		const audioBox = page.locator(`label:has-text("${L.audioLabel}") input[type="checkbox"]`).first();
		if (!(await audioBox.isChecked())) await audioBox.click();
		const audioOK = await waitForStored(page, "vnsc_settings_alertAudioEnabled", `(v) => v.some((x) => x === "true")`);
		step("S6-04 alertAudioEnabled=true ghi qua UI", audioOK, (await readStored(page, "vnsc_settings_alertAudioEnabled")).join(" | "));

		// S6-05: timezone Asia/Tokyo qua UI.
		await page.getByRole("tab", { name: /Mã & Nến/ }).click();
		await page.locator('select:has(option[value="Asia/Tokyo"])').first().selectOption("Asia/Tokyo");
		const tzOK = await waitForStored(page, "vnsc_settings_timezone", `(v) => v.some((x) => x === "Asia/Tokyo")`);
		step("S6-05 timezone=Asia/Tokyo ghi qua UI", tzOK, (await readStored(page, "vnsc_settings_timezone")).join(" | "));

		// S6-06: preset midnight-blue → data-chart-theme + rsc-chart-theme.
		// F-07 fix: multi root route preset qua themeState của workspace ⇒ MỌI chart
		// (children nhận theme prop) phải flip live. Guard length>0 chống vacuous PASS.
		await page.getByRole("tab", { name: L.tabTheme }).click();
		await page.locator(`[data-testid="settings-modal"] span:text-is("${L.presetMidnight}")`).click();
		const themeAttrOK = await page
			.waitForFunction(
				() => {
					const roots = Array.from(document.querySelectorAll('[data-testid="vninvest-charts"]'));
					return roots.length > 0 && roots.every((r) => r.getAttribute("data-chart-theme") === "midnight-blue");
				},
				undefined,
				{ timeout: 6000 }
			)
			.then(() => true)
			.catch(() => false);
		const themeKeyOK = await waitForStored(page, "rsc-chart-theme", `(v) => v.some((x) => x === "midnight-blue")`);
		step("S6-06 preset midnight-blue → theme root + rsc-chart-theme", themeAttrOK && themeKeyOK, `attr=${themeAttrOK} key=${themeKeyOK}`);

		// S6-07: Scale=Log qua menu trục giá (right-click Y-axis).
		await closeSettings(page);
		const menuOK = await openScaleMenu(page);
		let logOK = false;
		if (menuOK) {
			await clickMenuItem(page, L.menuLog);
			logOK = await waitForStored(page, "vnsc_priceScaleMode", `(v) => v.some((x) => x === "log")`);
		}
		step(
			"S6-07 Scale=Log qua menu trục giá",
			menuOK && logOK,
			menuOK ? (await readStored(page, "vnsc_priceScaleMode")).join(" | ") : "menu trục giá không mở"
		);

		// S6-08: reload → hydration trio (F-03/S-01/S-02): UI phải phản ánh giá trị đã lưu.
		await page.reload({ waitUntil: "domcontentloaded" });
		const data2 = await waitForChartData(page);
		const hydro = { tz: false, audio: false, cvd: false };
		if (data2) {
			await openSettings(page);
			hydro.tz = (await page.locator('select:has(option[value="Asia/Tokyo"])').first().inputValue()) === "Asia/Tokyo";
			await page.getByRole("tab", { name: L.tabTrading }).click();
			hydro.audio = await page.locator(`label:has-text("${L.audioLabel}") input[type="checkbox"]`).first().isChecked();
			if ((await page.locator(`button:has-text("${L.cvdHistogram}")`).count()) === 0) {
				await page.locator(`label:has-text("${L.cvdEnable}") input[type="checkbox"]`).click();
			}
			hydro.cvd = (await histBtn.evaluate((b) => b.className)) === activeCvdClass;
		}
		step("S6-08 reload giữ cvdMode/tz/audio (hydrate)", data2 && hydro.tz && hydro.audio && hydro.cvd, JSON.stringify(hydro));

		// S6-09: Reset → priceScaleMode=linear (theo GIÁ TRỊ, không assert key vắng mặt) + theme sống (Q5).
		const modalVisible = await page.locator('[data-testid="settings-modal"]').isVisible().catch(() => false);
		if (!modalVisible) await openSettings(page);
		await page.locator('[data-testid="settings-reset-defaults-btn"]').click();
		// F-02 (Stage 5 audit): `[].every` = true — mảng rỗng (key bị xoá mà sync chết)
		// từng có thể PASS rỗng; thêm length>0 để bắt đúng failure mode (L-E01).
		const linearOK = await waitForStored(page, "vnsc_priceScaleMode", `(v) => v.length > 0 && v.every((x) => x === "linear")`);
		const themeKeyAfter = await page.evaluate(() => localStorage.getItem("rsc-chart-theme"));
		const themeAttrAfter = await page.evaluate(() => {
			const root = document.querySelector('[data-testid="vninvest-charts"]');
			return root ? root.getAttribute("data-chart-theme") : null;
		});
		const themeSurvived = themeKeyAfter === "midnight-blue" && themeAttrAfter === "midnight-blue";
		step(
			"S6-09 Reset → priceScaleMode=linear + theme sống (Q5)",
			linearOK && themeSurvived,
			`linear=${linearOK} theme=${themeSurvived} [${(await readStored(page, "vnsc_priceScaleMode")).join(" | ")}]`
		);

		// S6-10: menu trục giá hiển thị Auto (linear) selected.
		await closeSettings(page);
		await page.waitForTimeout(300);
		const menu2 = await openScaleMenu(page);
		let autoSelected = false;
		if (menu2) {
			autoSelected = await page.evaluate((label) => {
				const item = Array.from(document.querySelectorAll('[role="menuitem"]')).find((b) => (b.textContent || "").trim() === label);
				return !!item && item.getAttribute("aria-current") === "true";
			}, L.menuAuto);
		}
		step("S6-10 menu trục giá hiển thị Auto (linear) selected", menu2 && autoSelected, `menu=${menu2} selected=${autoSelected}`);

		// S6-11 (SEC-2026-10-18): khóa license đã lưu không được render plaintext mặc định.
		// Trước fix: input prefill type=text + serial đầy đủ → mọi screenshot/screen-share
		// lộ nguyên blob + serial. Masked mặc định; reveal chỉ qua hành động chủ động.
		await openSettings(page);
		await page.locator('[role="tab"]').filter({ hasText: /Bản quyền|Licensing/ }).first().click();
		await page.waitForTimeout(250);
		const lic0 = await page.evaluate(() => {
			const input = document.querySelector('[data-testid="license-input"]');
			const reveal = document.querySelector('[data-testid="license-reveal"]');
			const serialSpan = Array.from(document.querySelectorAll("span")).find((s) => /Serial/i.test(s.textContent || ""));
			return {
				hasInput: !!input,
				type: input ? input.getAttribute("type") : null,
				hasReveal: !!reveal,
				serialText: serialSpan ? serialSpan.textContent || "" : "",
			};
		});
		const serialMasked = lic0.serialText.includes("…") && !/[0-9a-f]{8}-[0-9a-f]{4}/i.test(lic0.serialText);
		step(
			"S6-11 license key che mac dinh (password) + serial truncate",
			lic0.hasInput && lic0.type === "password" && lic0.hasReveal && serialMasked,
			`type=${lic0.type} reveal=${lic0.hasReveal} serialMasked=${serialMasked}`
		);
		let revealToggle = false;
		if (lic0.hasReveal) {
			await page.locator('[data-testid="license-reveal"]').click();
			const revealed = await page.evaluate(
				() => document.querySelector('[data-testid="license-input"]')?.getAttribute("type") === "text"
			);
			await page.locator('[data-testid="license-reveal"]').click();
			const reMasked = await page.evaluate(
				() => document.querySelector('[data-testid="license-input"]')?.getAttribute("type") === "password"
			);
			revealToggle = revealed && reMasked;
		}
		step("S6-11b reveal toggle text<->password", lic0.hasReveal && revealToggle, `toggle=${revealToggle}`);
	} finally {
		await browser.close().catch(() => {});
	}
}

main()
	.then(() => {
		if (pageErrors.length) console.log(`pageerrors: ${pageErrors.join("; ")}`);
		const pass = results.filter((r) => r.ok).length;
		console.log(`\nverify-settings-fix: ${pass}/${results.length} PASS`);
		process.exit(results.length > 0 && results.every((r) => r.ok) ? 0 : 1);
	})
	.catch((err) => {
		console.error("FATAL", err);
		process.exit(1);
	});
