// CAPABILITY-GATE E2E (plan §9.3): at `free`, every sellable capability this widget
// actually ENFORCES must be blocked, must surface an upsell, and the upsell copy must be
// Vietnamese rather than a raw i18n key.
//
// Usage:
//   npm run build:css && npm run watch
//   WATCH_URL='http://localhost:3000/?standalone=1&dock=1' node scripts/verify-capability-gate.cjs
// Exit 0 = all steps PASS. `--self-test` proves the harness can fail.
//
// THE TIER GAP — WHY THERE IS NO `pro` BRANCH HERE
// ----------------------------------------------
// There is no lever that sets the widget's effective tier to `pro` from a URL or a global:
//   * `debugTier` is a React prop (VNInvestChartsProps.ts:148), read at exactly one site,
//     `props.debugTier ?? effectiveToolbarTier` (VNInvestCharts.tsx:707). Nothing under
//     src/demo/** passes it.
//   * `effectiveToolbarTier` (VNInvestCharts.tsx:699) resolves only from a
//     signature-verified `vni1.*` license or a server `/core/v1/auth/me` answer
//     (usePatTierAuthentication.ts:9-22). The trust anchor is a public key in the engine
//     whose private half is deliberately absent, so a browser harness cannot mint a key it
//     accepts — the same limit verify-license-persist.cjs:10-18 states.
//   * `?pro=1` exists (MultiChartsShowcaseDemo.tsx:80-81) but only feeds `forceProDock` ->
//     `dockTierGate` (MultiChartsShowcaseDemo.tsx:103), a dock-only opt-out (dockAccess.ts:
//     14,26). It never reaches `hasCapability`.
// Asserting "it opens at pro" without a lever would be a fabricated pass. What IS provable
// at the one reachable tier is the property that matters for a paywall: forgeable
// credentials lift nothing, and every enforced gate is fail-closed with a visible upsell.
// GATE-08 is that assertion. The pro branch stays a recorded gap.
//
// The gate inventory is a data table of ENFORCEMENT SITES, not of MIN_TIER: 44 of the 52
// capabilities in capabilities.ts have no widget call site at all. Asserting those would be
// asserting a UI that was never built, so they are reported, not graded.
//
// MAINTENANCE NOTE (2026-09-30): a ~300-line trim was attempted and rejected — 75 lines are
// the GATES/VI/upgrades data and 12 are the self-test bad-input cases, and both are
// assertions. Only true duplication was removed. Do not delete a `gap(...)` to hit a number.

const { chromium } = require("playwright");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const REPO_ROOT = path.resolve(__dirname, "..");

const WATCH_URL = process.env.WATCH_URL || "http://localhost:3000/?standalone=1&dock=1";
const results = [];
const gaps = [];
const errors = [];

function step(name, ok, detail = "") {
	results.push({ name, ok });
	console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
}

/** A step whose precondition failed is BLOCKED, not PASS (same rule as verify-p3/export). */
function blocked(name, why) {
	results.push({ name, ok: false, blocked: true });
	console.log(`FAIL ${name} (BLOCKED: ${why})`);
}

/** Something the plan asked for that the code demonstrably does not do. Never counted. */
function gap(what, why) {
	gaps.push({ what, why });
	console.log(`GAP  ${what} — ${why}`);
}

// ---------------------------------------------------------------------------
// PREDICATES. The real run and the --self-test call these SAME functions. A self-test
// that re-implements the assertion with the polarity flipped proves nothing, which is the
// exact failure this file exists to avoid.
// ---------------------------------------------------------------------------

/** An upsell label is acceptable only if it is the shipped Vietnamese string. */
function viLabelOk(label, cap) {
	return typeof label === "string" && label.length > 0 && label === VI[cap].title;
}
/** `tOrKey` (CapabilityGate.tsx:193) falls back to the raw key when a translation misses. */
function rawI18nKey(label) {
	return typeof label === "string" && label.startsWith("capability.");
}
/** title is `${title} — ${benefit}` (CapabilityGate.tsx:155): both halves must be localised. */
function viBenefitOk(title, cap) {
	return typeof title === "string" && title.includes(VI[cap].title) && title.includes(VI[cap].benefit);
}
/** A locked badge must declare the tier that unlocks it and not fall back to a raw key. */
function badgeLocked(info) {
	return info !== null && info.requiredTier === "pro" && !rawI18nKey(info.label);
}
/** The free path must send the user to the upgrade page AND produce no file. */
function redirectClean(upsell, downloads) {
	return upsell === true && downloads === 0;
}
/** Nothing may open: an element that must be absent at free tier. */
function absent(n) {
	return n === 0;
}
/** The paywall property: no gate may flip from blocked to open on a forged credential. */
function noGateLifted(before, after) {
	return GATES.filter((g) => before[g.cap] === true && after[g.cap] === false).length === 0;
}

/**
 * Vietnamese upsell copy, verbatim from src/widget/i18n/capability.messages.vi.ts.
 *
 * PINE-COPY 2026-10-08: kept in step with the honest copy that replaced three
 * claims describing behaviour that does not exist. This block is a byte-for-byte
 * mirror, so editing the i18n file WITHOUT editing here makes this gate red on a
 * string that is now correct. That coupling is the point: it is why the old false
 * copy could not be fixed in isolation.
 */
const VI = {
	pine_editor: {
		title: "Trình soạn thảo Pine và script tùy chỉnh",
		benefit: "Tự viết chỉ báo bằng Pine và kiểm tra cú pháp, logic ngay khi gõ.",
	},
	strategy_tester: {
		title: "Bộ kiểm thử chiến lược kèm báo cáo",
		benefit: "Backtest 4 chiến lược dựng sẵn trên dữ liệu đang tải và xem báo cáo giao dịch.",
	},
};

/** One record per dock-only upgrade: the capability plus its position in the tab strip.
 *  Position, not label — see TAB_SELECTOR. Source order is ChartFooter.tsx:75-77. */
const upgrades = {
	pine_editor: { cap: "pine_editor", tabIndex: 0 },
	strategy_tester: { cap: "strategy_tester", tabIndex: 1 },
};

/** One row per capability the widget ENFORCES, with the DOM proof and the source site. */
const GATES = [
	{
		cap: "export_png",
		id: "GATE-01",
		src: "VNInvestCharts.tsx:741",
		sel: '[data-testid="menu-snapshot-btn"]',
		how: "redirect",
		why: "click must reach the upgrade page and render no PNG",
	},
	{
		cap: "export_csv",
		id: "GATE-02",
		src: "VNInvestCharts.tsx:753",
		sel: '[data-testid="menu-csv-btn"]',
		how: "redirect",
		why: "click must reach the upgrade page and download no file",
	},
	{
		cap: "replay",
		id: "GATE-03",
		src: "VNInvestCharts.tsx:711 -> OHLCHeader.tsx:629",
		sel: '[data-testid="replay-toggle"]',
		how: "disabled",
		why: "toggle stays discoverable but cannot start replay",
	},
	{
		cap: "pine_editor",
		id: "GATE-04",
		src: "VNInvestCharts.tsx:2762",
		sel: '.vnsc-locked-feature[data-capability="pine_editor"]',
		how: "locked",
		// The badge only mounts inside the collapsible bottom panel (VNInvestCharts.tsx:2726),
		// so the tab has to be opened first. The tab is located structurally, not by its
		// Vietnamese label — see TAB_SELECTOR for why a translated literal is the wrong
		// locator even though this surface happens to be Vietnamese today.
		upgrade: upgrades.pine_editor,
		why: "LockedFeature badge carrying the Vietnamese upsell",
	},
	{
		cap: "strategy_tester",
		id: "GATE-05",
		src: "VNInvestCharts.tsx:2741",
		sel: '.vnsc-locked-feature[data-capability="strategy_tester"]',
		how: "locked",
		upgrade: upgrades.strategy_tester,
		why: "LockedFeature badge carrying the Vietnamese upsell",
	},
	{
		cap: "alert_drawing",
		id: "GATE-06",
		src: "VNInvestCharts.tsx:2873",
		sel: ".vnsc-alert-host",
		how: "absent",
		mustExist: '[data-testid="vninvest-charts"]',
		why: "host must not mount — a Community alert toast is free revenue given away",
	},
];

/** Read a LockedFeature badge's markup. Returns null when the badge is not on screen. */
async function readBadge(page, cap) {
	const badge = page.locator(`.vnsc-locked-feature[data-capability="${cap}"]`).first();
	if ((await badge.count()) === 0) return null;
	return badge.evaluate((n) => ({
		requiredTier: n.getAttribute("data-required-tier"),
		label: n.querySelector(".vnsc-locked-feature__label")?.textContent ?? "",
		aria: n.getAttribute("aria-label") ?? "",
		title: n.getAttribute("title") ?? "",
	}));
}

/**
 * The bottom-panel tab strip, located by STRUCTURE rather than by its label.
 *
 * The three tabs used to be found with `page.locator("button", { hasText: <Vietnamese> })`,
 * which is the exact trap this repo has already paid for twice: `verify-export.cjs` and
 * `verify-alerts.cjs` both reported "the control never appeared" while it was on screen
 * the whole time, because the surface renders in the host locale and the locator was a
 * translated literal (`verify-alerts.cjs:62-66` records it). A locale change, a copy edit,
 * or an English surface would silently turn GATE-04 and GATE-05 into `missing` — which
 * this script reports as a FAIL, so at least it would be loud. Loud is not the same as
 * correct: the assertion would no longer be grading the capability at all.
 *
 * `ChartFooter.tsx:47-63` renders each tab as a bare `<button>` — no `data-testid`, no
 * `data-*`, no `role`, no `aria-label` — while every other button in the footer does carry
 * a `data-*` attribute (`TimeframeFooter.tsx:94` `data-timeframe`, `:116` `data-range`,
 * `:137` `data-scale`). So "the buttons inside the footer that have no `data-*`" describes
 * the tab strip exactly, and in no language.
 *
 * Two further buttons also lack `data-*`, and the indices depend on both rendering AFTER
 * the tabs, which is verified rather than assumed:
 *   - the panel close button, `ChartFooter.tsx:78-82`, conditional on `activeBottomTab`;
 *   - the shortcut hint chip, `ShortcutHelpModal.tsx:133-137`, rendered as `trailingNode`
 *     at `TimeframeFooter.tsx:162` and conditional on a localStorage "seen" flag.
 * Both are positioned after the tab buttons in source, so pine_editor (0),
 * strategy_tester (1) and paper_trade (2) are stable whether or not either of them shows.
 */
const TAB_SELECTOR =
	'[data-testid="timeframe-footer"] button:not([data-timeframe]):not([data-range]):not([data-scale])';

/** Click a bottom tab by its position in the tab strip. Resolves false when absent. */
async function openUpgradeTab(page, upgrade, settle = 1200) {
	const tab = page.locator(TAB_SELECTOR).nth(upgrade.tabIndex);
	if ((await tab.count()) === 0) return false;
	await tab.click({ timeout: 10000 }).catch(() => {});
	await page.waitForTimeout(settle);
	return true;
}

/** Grade one gate row. Returns { ok, detail, missing }; `missing` marks a bad precondition. */
async function observe(page, g) {
	// `absent` rows are the awkward case: absence is the PASS, so the count==0 branch must
	// NOT be read as a missing element. It is only vacuous if the surface it lives on never
	// rendered, which is what `mustExist` guards.
	if (g.how === "absent") {
		if (g.mustExist && (await page.locator(g.mustExist).count()) === 0) {
			return { ok: false, missing: true, detail: `host ${g.mustExist} never rendered` };
		}
		const n = await page.locator(g.sel).count();
		return { ok: absent(n), detail: `${n} match(es) for ${g.sel}` };
	}
	if (g.upgrade && !(await openUpgradeTab(page, g.upgrade))) {
		return { ok: false, missing: true, detail: `no bottom tab at index ${g.upgrade.tabIndex} (${TAB_SELECTOR})` };
	}
	const el = page.locator(g.sel).first();
	if ((await el.count()) === 0) {
		return { ok: false, missing: true, detail: `no ${g.sel} in the DOM` };
	}
	if (g.how === "redirect") {
		const before = page.url();
		const popups = [];
		const downloads = [];
		page.on("popup", (p) => popups.push(p));
		page.on("download", (d) => downloads.push(d));
		await el.click({ timeout: 10000 });
		await page.waitForTimeout(1200);
		// A popup only counts as evidence if it actually went somewhere real. A popup
		// parked on a browser error page (chrome-error://chromewebdata/, about:blank)
		// means the upgrade host was unreachable — that is a BROKEN environment, not a
		// working gate. It used to satisfy this check, so a dead :8080 could turn GATE-02
		// green while proving nothing: a measurement of the wrong thing.
		const realTarget = (u) => typeof u === "string" && /^https?:\/\//i.test(u);
		const popupUrl = popups.length > 0 ? popups[0].url() : null;
		const navigatedAway = page.url() !== before && realTarget(page.url());
		const upsell = (popups.length > 0 && realTarget(popupUrl)) || navigatedAway;
		const where = upsell
			? `popup -> ${popupUrl}` + (navigatedAway ? ` AND navigated -> ${page.url()}` : "")
			: popups.length > 0
				? `popup parked on ${popupUrl} (not a real URL — upgrade host unreachable?)`
				: "no redirect and no popup: silent no-op";
		return {
			ok: redirectClean(upsell, downloads.length),
			detail: upsell
				? `${where}${downloads.length ? ` AND ${downloads.length} download(s)` : ""}`
				: "no redirect and no popup: silent no-op",
		};
	}
	if (g.how === "disabled") {
		const disabled = await el.evaluate(
			(n) => n.disabled === true || n.getAttribute("aria-disabled") === "true",
		);
		return { ok: disabled === true, detail: disabled ? "disabled" : "enabled at free tier" };
	}
	const info = await readBadge(page, g.cap);
	return {
		ok: badgeLocked(info),
		detail: info === null ? "badge vanished mid-read" : `required=${info.requiredTier} label="${info.label}"`,
	};
}

/** The three copy checks for one upsell badge, read off the RENDERED node. */
function i18nChecks(info, cap) {
	return [
		{ name: `I18N-${cap} aria-label is Vietnamese, not a raw key`, ok: !rawI18nKey(info.aria), detail: info.aria },
		{ name: `I18N-${cap} upsell title localised`, ok: viLabelOk(info.label, cap), detail: JSON.stringify(info.label) },
		{ name: `I18N-${cap} upsell benefit localised`, ok: viBenefitOk(info.title, cap), detail: info.title.slice(0, 96) },
	];
}

/** Refuse to grade a server this script did not build. */
async function assertServerIsOurs() {
	if (process.env.VNSC_ALLOW_ANY_SERVER === "1") return;
	const target = new URL(WATCH_URL);
	const res = await fetch(target.origin, { signal: AbortSignal.timeout(6000) }).catch(() => null);
	if (!res || !res.ok) {
		console.error(
			`verify-capability-gate: no dev server at ${target.origin}.\n` +
				"  Start one: npm run build:css && npm run watch  (watch runs `clean`, so a cold\n" +
				"  worktree without generated CSS will not compile.)\n" +
				"  This suite grades whatever is on the URL, so it refuses to run rather than\n" +
				"  report a result for code it did not build.",
		);
		process.exit(1);
	}
}

async function open(page) {
	await page.goto(WATCH_URL, { waitUntil: "domcontentloaded", timeout: 90000 });
	await page.waitForSelector('[data-testid="vninvest-charts"]', { timeout: 60000 }).catch(() => {});
	await page.waitForTimeout(3000);
}

async function main() {
	await assertServerIsOurs();

	const browser = await chromium.launch();
	const page = await browser.newPage();
	page.on("pageerror", (e) => errors.push(e.message));

	// Right shape, worthless signature — the fixture verify-license-persist.cjs:33 uses.
	const b64url = (s) =>
		Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
	const STRUCTURAL_KEY = `vni1.${b64url(JSON.stringify({ t: "pro", e: 9999999999 }))}.${b64url("sig")}`;

	try {
		await open(page);
		const mounted = (await page.locator('[data-testid="vninvest-charts"]').count()) > 0;
		step("GATE-00 widget mounted", mounted);
		if (!mounted) throw new Error("precondition failed: widget did not mount, remaining steps blocked");

		// Snapshot the pre-seed state so the forged-license comparison is a DIFF, not two
		// independent reads that could drift between them.
		const before = {};
		for (const g of GATES) before[g.cap] = (await observe(page, g)).ok;
		step(
			"GATE-00b baseline is a genuinely locked tier",
			Object.values(before).every(Boolean),
			`${GATES.length} gates, ${Object.values(before).filter(Boolean).length} blocked`,
		);

		for (const g of GATES) {
			const res = await observe(page, g);
			if (res.missing) {
				blocked(`${g.id} ${g.cap} blocked`, `${res.detail} — ${g.src}: ${g.why}`);
				continue;
			}
			step(`${g.id} ${g.cap} blocked at free`, res.ok, `${res.detail} [${g.src}]`);
		}

		// Vietnamese copy, read off the RENDERED badges, not off the source table. If a
		// translation is deleted or corrupted the browser stops rendering the shipped string
		// and this is what catches it. The two bottom-panel badges share one panel, so each
		// tab is reopened before its badge is read.
		for (const up of Object.values(upgrades)) {
			await openUpgradeTab(page, up, 1000);
			const info = await readBadge(page, up.cap);
			if (info === null) {
				blocked(`I18N-${up.cap}`, `no LockedFeature for ${up.cap} on screen to read copy from`);
				continue;
			}
			for (const c of i18nChecks(info, up.cap)) step(c.name, c.ok, c.detail);
		}

		// The tier gate itself, at the only tier a browser harness can reach.
		await page.evaluate(([k]) => {
			localStorage.setItem("vni_license_key", k);
			localStorage.setItem("vni_pat", k);
			localStorage.removeItem("vni_pat_cleared_v1");
		}, [STRUCTURAL_KEY]);
		await page.reload({ waitUntil: "domcontentloaded" });
		await page.waitForTimeout(4000);

		const after = {};
		for (const g of GATES) after[g.cap] = (await observe(page, g)).ok;
		const lifted = GATES.filter((g) => before[g.cap] && !after[g.cap]).map((g) => g.cap);
		step("GATE-08 forged vni1.* license lifts NO gate", noGateLifted(before, after),
			lifted.length === 0 ? "all still blocked" : `lifted: ${lifted.join(",")}`);

		// --- dock_pro, on a page where the dock gate is actually live. ---
		//
		// `?dock=1` cannot grade this: StandaloneEmbedDemo passes dockTierGate={false}
		// for it, and dockAccess.ts:26-28 returns `full` for EVERY tier when that host
		// opt-out is set. Grading there would report a gate bypass that is actually a
		// documented escape hatch.
		//
		// Simply dropping `dock=1` does not work either: showDock becomes false, the dock
		// slot never mounts, and an absent dock on a page that never mounted one is
		// vacuous. So use `?dockgate=1`, which mounts the dock (showDock) AND turns the
		// gate ON explicitly (dockTierGate={true}) — resolveDockAccess then must take the
		// nudge branch at free, and the full branch at pro+.
		const gateLive = new URL(WATCH_URL);
		gateLive.searchParams.delete("dock");
		gateLive.searchParams.set("dockgate", "1");
		const dockPage = await browser.newPage();
		await dockPage.goto(gateLive.toString(), { waitUntil: "domcontentloaded", timeout: 90000 });
		await dockPage.waitForTimeout(3500);
		const nudge = await dockPage.locator('[data-testid="dock-upgrade-nudge"]').count();
		const proTabs = await dockPage.locator('[data-testid^="dock-tab-"]').count();
		await dockPage.close();
		if (nudge === 0 && proTabs === 0) {
			gap("dock_pro gate at free",
				"ungradeable in this harness: neither `?dock=1` (dockTierGate={false} " +
				"bypasses the gate for every tier, dockAccess.ts:26-28) nor `?dockgate=1` " +
				"(gate ON) put a dock on screen at free, so an absent dock proves nothing");
		} else {
			step("GATE-09 dock_pro blocked at free", proTabs === 0 && nudge > 0,
				`nudge=${nudge} proTabButtons=${proTabs} [WorkspaceRightDockSlot.tsx:125, ` +
				`resolveDockAccess(free, true) -> nudge]`);
		}

		// Tabs that exist as rails but whose Pro content must stay withheld at free.
		// Rail presence is NOT enforcement: AdvisoryPanel/WhalePanel have no tier check, so
		// the only thing that can withhold them is the tab not being reachable. Click each
		// and assert the Pro panel itself never renders. `visible` exists so that a silent
		// no-op (rail found, click swallowed) is reported as a check rather than skipped.
		const PRO_PLUGIN_RAILS = [
			{ tab: "advisory", panel: '[data-testid="advisory-panel"]' },
			{ tab: "objects", panel: '[data-testid="whale-panel"]' },
		];
		const pluginPage = await browser.newPage();
		await pluginPage.goto(gateLive.toString(), { waitUntil: "domcontentloaded", timeout: 90000 });
		await pluginPage.waitForTimeout(3500);
		let pluginChecked = 0;
		for (const { tab, panel } of PRO_PLUGIN_RAILS) {
			const rail = pluginPage.locator(`[data-testid="dock-tab-${tab}"]`).first();
			if ((await rail.count()) === 0) continue; // rail absent => nothing reachable => safe
			pluginChecked++;
			await rail.click({ timeout: 5000 }).catch(() => {});
			await pluginPage.waitForTimeout(1200);
			const leaked = await pluginPage.locator(panel).count();
			step(`GATE-09b pro_plugin '${tab}' withheld at free`, leaked === 0,
				`panelMatches=${leaked} [panel has no internal tier check; only reachableTabs can withhold it]`);
			await pluginPage.keyboard.press("Escape");
			await pluginPage.waitForTimeout(400);
		}
		if (pluginChecked === 0) {
			step("GATE-09b pro_plugin withheld at free (rails absent at free)", true,
				"no pro rail rendered, so no pro panel was reachable");
		}
		await pluginPage.close();

		// --- whale overlay, with DATA actually present. ---
		//
		// `?whale=1` supplies synthetic whale orders to the demo. Without data the overlay
		// cannot render at ANY tier, so "no whale overlay at free" would be vacuous —
		// indistinguishable from "the feature is simply dead". The lever injects DATA
		// only; the tier is still decided by the license, because the repo deliberately has
		// no `?tier=` (see verify-alerts.cjs: minting is the only way in).
		//
		// Non-vacuity is proven two ways: the same page must show that whale is configured
		// (the demo passed enableWhale + orders), and the positive control lives in
		// VNInvestCharts.runtimeMounts.contract.test.tsx (pro + flag => overlay mounts).
		const whaleUrl = new URL(gateLive.toString());
		whaleUrl.searchParams.set("whale", "1");
		const whalePage = await browser.newPage();
		await whalePage.addInitScript(() => {
			try { localStorage.setItem("vnsc_debug_features", "1"); } catch { /* ignore */ }
		});
		await whalePage.goto(whaleUrl.toString(), { waitUntil: "domcontentloaded", timeout: 90000 });
		await whalePage.waitForTimeout(3500);
		const whaleOverlay = await whalePage.locator(
			'[data-vnsc-whale-overlay], [data-rsc-fork-overlay="whale"]',
		).count();
		step("GATE-09c pro_plugin whale overlay withheld at free", whaleOverlay === 0,
			`overlays=${whaleOverlay} [VNInvestCharts.tsx: canUseWhale = allows('pro_plugin') AND ` +
			`flag; data injected via ?whale=1 so absence is not vacuous]`);
		await whalePage.close();

		gap("pro branch of every gate ('it opens at pro')",
			"retired as stale: this harness has no lever, but verify-alerts.cjs does — it " +
			"arms a real P-256-signed vni1.* license through the widget dev hook and grades " +
			"the pro branch (ALERT-02..12). Do not re-raise this without first reproducing " +
			"the failure in verify-alerts.cjs");
		gap("paper_advanced / pro_plugin / whale_campaign enforcement",
			"NARROWED after S1 (2026-09-30). paper_advanced: the two sources of truth are now " +
			"merged — the order form takes tierGated.allows('paper_advanced'), not " +
			"toSeriesTier(tier), so a license that narrows `caps` is no longer ignored at the UI " +
			"(that was the real defect: hasCapability(tier) cannot see license caps). " +
			"pro_plugin/whale: the chart overlays were gated by flags.isWhalePanelEnabled alone " +
			"(pattern F5) and are now `allows('pro_plugin') AND flag`. " +
			"STILL OPEN: whale_campaign (enterprise, backend-gated) is a different capability and " +
			"is not graded here. See GATE-09c for the pro_plugin whale overlay, which IS graded " +
			"at free tier with data injected via ?whale=1");
		// S2: CapabilityProvider must actually be mounted around the chart, otherwise
		// useResolvedCapabilities falls back to tier=null and every useCapabilityGate read
		// is locked at every tier. A dead gate is fail-closed but can only deny.
		//
		// This cannot be graded in the browser: `server_workspace` has no rendered surface
		// (WorkspaceScopeBadge is never mounted), so there is nothing to observe. The
		// assertion is therefore structural — the provider must appear in the chart source —
		// and the behavioural half lives in capabilityProviderMount.test.tsx. Both halves are
		// needed: the test cannot see the tree, and this cannot see the states.
		const chartSrc = readFileSync(
			path.join(REPO_ROOT, "src", "widget", "VNInvestCharts.tsx"),
			"utf8",
		);
		const providerMounted = /<CapabilityProvider\b[^>]*\btier=/.test(chartSrc);
		const gateScope = readFileSync(
			path.join(REPO_ROOT, "src", "widget", "capabilities", "capabilityProviderMount.test.tsx"),
			"utf8",
		);
		const behaviouralLock = /readState\("enterprise", "server_workspace"\)\)\.toBe\("granted"\)/.test(gateScope);
		step("GATE-11 CapabilityProvider mounted with the real tier", providerMounted && behaviouralLock,
			`mountedInSource=${providerMounted} behaviouralLock=${behaviouralLock} ` +
			`[VNInvestCharts.tsx -> CapabilityProvider; pre-S2 this read locked at every tier]`);
		if (!providerMounted || !behaviouralLock) {
			gap("server_workspace lock at pro",
				"either the provider is not mounted in the chart tree, or the behavioural " +
				"lock is missing, so nothing proves the gate can grant (only deny)");
		}
		gap("ui.bottomTab.paperTrade Vietnamese copy",
			"NARROWED after S3 (2026-09-30). The gap text pointed at ONE key, but grep found " +
			"ELEVEN vi strings still carrying 'Paper Trading'/'paper trading'. All eleven now use " +
			"the term already present in the file ('Giao dịch mô phỏng'). Locked by " +
			"paperTradingTranslations.test.ts (mutation-checked: reverting one string turns 2 " +
			"tests red). NOTE the key the gap names, ui.bottomTab.paperTrade, has ZERO consumers " +
			"— the live key is ui.bottomTab.paperTrading (ChartFooter.tsx:77). The orphan " +
			"duplicates are still translated rather than deleted, to keep the key set aligned");

		step("GATE-10 zero page errors", errors.length === 0, `${errors.length} errors`);

		const ok = results.filter((r) => r.ok).length;
		const wasBlocked = results.filter((r) => r.blocked).length;
		console.log(
			`RESULT: ${ok}/${results.length} ${ok === results.length ? "PASS" : "FAIL"}` +
				(wasBlocked ? ` (${wasBlocked} blocked by an unmet precondition)` : "") +
				` | ${gaps.length} recorded gap(s)`,
		);
		process.exitCode = ok === results.length ? 0 : 1;
	} finally {
		await browser.close();
	}
}

/**
 * --self-test: prove the suite can fail. Each expectFail body IS a real predicate applied
 * to BAD input, so it must throw. A body written with the polarity flipped would report
 * green while proving nothing — which is how a self-test becomes decoration.
 */
function selfTest() {
	const checks = [];
	/**
	 * A negative case is proven by feeding BAD input to the REAL predicate and confirming it
	 * comes back false — because `false` is what makes the run call `step(..., ok=false)`.
	 * Written with a throw/catch and the polarity reads backwards, and the whole self-test
	 * reports green forever while proving nothing; that is the trap this shape avoids.
	 */
	const expectFail = (name, predicateResult, why) =>
		checks.push(
			predicateResult === false
				? { name, ok: true }
				: { name, ok: false, why: `passed on bad input — vacuous: ${why}` },
		);
	const expectPass = (name, fn) => {
		try {
			fn();
			checks.push({ name, ok: true });
		} catch (e) {
			checks.push({ name, ok: false, why: e.message });
		}
	};
	const mustBe = (cond, why) => {
		if (!cond) throw new Error(why);
	};

	const badge = {
		requiredTier: "pro",
		label: VI.pine_editor.title,
		aria: "Tính năng bị khóa",
		title: `${VI.pine_editor.title} — ${VI.pine_editor.benefit}`,
	};
	const allBlocked = Object.fromEntries(GATES.map((g) => [g.cap, true]));

	expectPass("selftest: a good locked badge is accepted", () =>
		mustBe(badgeLocked(badge), "rejected a valid badge"));
	expectPass("selftest: a clean redirect with no download is accepted", () =>
		mustBe(redirectClean(true, 0), "rejected the correct free path"));
	expectPass("selftest: an unchanged gate set is accepted", () =>
		mustBe(noGateLifted(allBlocked, allBlocked), "rejected an unchanged gate set"));

	expectFail("selftest: a raw i18n key in the badge is rejected",
		badgeLocked({ ...badge, label: "capability.upsell.pine_editor.title" }),
		"a missing translation would ship as a passing gate check");
	expectFail("selftest: an English title is rejected",
		viLabelOk("Pine editor and custom scripts", "pine_editor"),
		"the Vietnamese-label requirement would be unenforced");
	expectFail("selftest: a title with no benefit half is rejected",
		viBenefitOk(VI.pine_editor.title, "pine_editor"),
		"only half the upsell copy needs to be localised");
	expectFail("selftest: the wrong required tier is rejected",
		badgeLocked({ ...badge, requiredTier: "starter" }),
		"the declared unlock tier is unchecked");
	expectFail("selftest: a free-tier CSV download is rejected",
		redirectClean(true, 1),
		"a download alongside the redirect is a gate bypass");
	expectFail("selftest: a silent no-op click is rejected",
		redirectClean(false, 0),
		"a click that did nothing would count as blocked");
	expectFail("selftest: a mounted free-tier alert host is rejected",
		absent(1),
		"a Community alert toast is free revenue given away");
	expectFail("selftest: a visible pro dock tab is rejected",
		absent(1),
		"the pro dock surface rendered at free tier");
	expectFail("selftest: one lifted gate fails the whole set",
		noGateLifted(allBlocked, { ...allBlocked, export_png: false }),
		"a forged license lifting a gate would go unnoticed");

	const failed = checks.filter((c) => !c.ok);
	for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"} ${c.name}${c.why ? ` (${c.why})` : ""}`);
	console.log(`RESULT: ${checks.length - failed.length}/${checks.length} ${failed.length ? "FAIL" : "PASS"}`);
	process.exitCode = failed.length ? 1 : 0;
}

if (process.argv.includes("--self-test")) {
	selfTest();
} else {
	main().catch((e) => {
		console.error(`FATAL: ${e.message}`);
		process.exitCode = 1;
	});
}
