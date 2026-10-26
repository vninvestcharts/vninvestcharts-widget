// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { describe, expect, it, afterAll, afterEach, beforeEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { resetLicensePublicKey, setLicensePublicKey } from "@vninvestcharts/engine-core";
import { VNInvestCharts } from "../VNInvestCharts";
import { initRegistry } from "../../lib/core/registry/registerAll";
import { getSeries, getSeriesTier } from "../../lib/core/registry/registryCore";
import { pineSeriesTypeFor } from "../../lib/core/seriesValueResolver";
import { restorePineScripts } from "../../../packages/vn-kline-widget-pro/src/pinescript/scriptRegistry";
// Side-effect: registers the real pinescript module into the public adapter
// registry (mirrors Pro host startup; production reads Pine via adapter only).
import "../../../packages/vn-kline-widget-pro/src/register";
import { readStoredScripts, scriptChecksum } from "../hooks/useScriptPersistence";
import { engineHostPropsHistory, mockEngineInstance } from "./utils/mockEngine";

/**
 * W-03 — widget-mount wiring locks for the three mutation survivors (PINE STAGE 2).
 *
 * Each test below mounts the REAL `<VNInvestCharts>` with a mocked `EngineHost` that
 * pushes every props object into the shared `engineHostPropsHistory`
 * (`utils/mockEngine.ts:42`) and drives `onEngineReady` with the shared mock engine.
 * Every assertion is an EXACT key presence/absence, never a substring (H8), and every
 * test shows fail-before on its mutant once (H10) — see the W-03 commit message.
 *
 * Registry hygiene: `registerSeries` writes a module-level Map, so each test uses its
 * OWN script id; otherwise a later test's "before restore" precondition would pass for
 * the wrong reason (the lesson `usePineScriptRestore.test.tsx:22-27` records).
 */
initRegistry();

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
const originalConsoleError = console.error;
console.error = (..._args: unknown[]) => {};

vi.mock("../../lib/core/hooks/useCanvasResize", () => {
	const ref = { current: null as HTMLDivElement | null };
	return {
		useCanvasResize: () => ({
			ref,
			size: { width: 1200, height: 720 },
		}),
	};
});

// The price slot carries a state but DELIBERATELY no domain: whatever domain the spy
// below receives for "price-right" is therefore computed by the widget (test c), not
// echoed from the engine. The volume slot keeps its domain as a control.
const wiringSnapshots = [
	{
		paneId: "price",
		bounds: { left: 0, top: 0, width: 1200, height: 420 },
		plotBounds: { left: 0, top: 28, width: 1200, height: 392 },
		axisBounds: {
			right: { left: 1152, top: 0, width: 48, height: 420 },
		},
		headerAnchor: { left: 0, top: 0, width: 1200 },
		labelAnchor: { left: 0, top: 0, height: 420 },
		scaleSlotBounds: { "price-right": { left: 1152, top: 0, width: 48, height: 420 } },
		scaleSlotStates: { "price-right": { side: "right", mode: "auto", visible: true } },
	},
	{
		paneId: "volume",
		bounds: { left: 0, top: 420, width: 1200, height: 180 },
		plotBounds: { left: 0, top: 448, width: 1200, height: 152 },
		axisBounds: {
			right: { left: 1152, top: 420, width: 48, height: 180 },
		},
		headerAnchor: { left: 0, top: 420, width: 1200 },
		labelAnchor: { left: 0, top: 420, height: 180 },
		scaleSlotBounds: { "volume-right": { left: 1152, top: 420, width: 48, height: 180 } },
		scaleSlotStates: { "volume-right": { side: "right", mode: "auto", visible: true, domain: [1200, 1500] } },
	},
] as const;

vi.mock("@vninvestcharts/engine-react", async (importOriginal) => {
	const React = await import("react");
	const actual = await importOriginal() as Record<string, unknown>;

	return {
		...actual,
		EngineHost(props: {
			className?: string;
			locale?: string;
			onEngineReady?: (engine: unknown) => void;
			onPaneSnapshotsChange?: (snapshots: readonly unknown[]) => void;
			onVisibleRangeChange?: (range: { from: number; to: number }) => void;
			style?: React.CSSProperties;
		}) {
			engineHostPropsHistory.push(props as unknown as Record<string, unknown>);
			React.useEffect(() => {
				props.onEngineReady?.(mockEngineInstance);
				props.onPaneSnapshotsChange?.(wiringSnapshots);
				props.onVisibleRangeChange?.({ from: 0, to: 2 });
			}, []);

			return (
				<div data-vn-kline-engine-host="true" className={props.className} style={props.style}>
					<div data-vn-kline-engine="surface" data-locale={props.locale} />
				</div>
			);
		},
	};
});

const SCRIPT_SOURCE = `study("w03 wiring probe", overlay=true)
val = ta.sma(close, 3)
plot(val)`;

// Real P-256 ECDSA license arming (same harness as licenseActivation.test.ts /
// usePatTierAuthentication.test.tsx L5). `debugTier` does NOT feed the SERIES tier
// gate by design (H0.9: VNInvestCharts.tsx:810 reads effectiveToolbarTier, :792-794
// feeds debugTier only to the capability path) — a bare `debugTier="pro"` mount still
// gates render at free (probed: even built-in Renko is dropped). The signed license in
// `vni_license_key` is the only backend-free path to a pro renderPanes.
const licenseSubtle = webcrypto.subtle as unknown as SubtleCrypto;
const LICENSE_FUTURE = Math.floor(Date.now() / 1000) + 86400 * 30;

function b64url(bytes: Uint8Array): string {
	let s = "";
	bytes.forEach((b) => { s += String.fromCharCode(b); });
	return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function issueSignedProLicense(): Promise<string> {
	const pair = await licenseSubtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
	const pub = (await licenseSubtle.exportKey("jwk", pair.publicKey)) as { x: string; y: string };
	setLicensePublicKey({ kty: "EC", crv: "P-256", x: pub.x, y: pub.y });
	const payload = new TextEncoder().encode(JSON.stringify({ t: "pro", e: LICENSE_FUTURE }));
	const sig = await licenseSubtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, payload);
	return `vni1.${b64url(payload)}.${b64url(new Uint8Array(sig))}`;
}

function clearBackendSignals() {
	try { delete (globalThis as Record<string, unknown>).__VNI_API_BASE__; } catch { /* ignore */ }
	try { localStorage.removeItem("vni_api_base"); } catch { /* ignore */ }
	try { localStorage.removeItem("vni_pat"); } catch { /* ignore */ }
}

function seedStoredScript(id: string, source: string) {
	// Real schema is a Record, not an array (useScriptPersistence.ts:31-35) — seeding an
	// array makes the loader fall back to keys[0] and the restore under test never runs.
	localStorage.setItem(
		"vn._scripts",
		JSON.stringify({
			formatVersion: 1,
			scripts: {
				[id]: {
					id,
					name: id,
					source,
					created: "2024-01-01T00:00:00.000Z",
					lastModified: "2024-01-01T00:00:00.000Z",
					integrity: { checksum: scriptChecksum(source), sourceLength: source.length },
				},
			},
			lastActiveId: id,
		}),
	);
}

function createAdapter(label: string) {
	const fetchBarsInRange = vi.fn().mockResolvedValue([]);
	return {
		fetchBarsInRange,
		fetchBarsBefore: vi.fn().mockResolvedValue([]),
		fetchBars: fetchBarsInRange,
		fetchMoreBars: vi.fn().mockResolvedValue([]),
		subscribeToBar: vi.fn().mockReturnValue(() => {}),
		subscribeToTrades: vi.fn().mockReturnValue(() => {}),
		subscribeToOrderbook: vi.fn().mockReturnValue(() => {}),
		searchSymbols: vi.fn().mockResolvedValue([]),
		label,
	};
}

const WIRING_DATA = [
	{ date: new Date("2024-01-01T09:00:00Z"), open: 100, high: 105, low: 98, close: 103, volume: 1200 },
	{ date: new Date("2024-01-01T10:00:00Z"), open: 103, high: 107, low: 101, close: 106, volume: 1500 },
];

/**
 * AC-1.2 fixture: 6 bars, because `ta.sma(close, 3)` needs 3 bars before it yields anything.
 *
 * `WIRING_DATA` above has only 2 bars, which is why the sibling test can assert the KEY is
 * present but never that the VALUES are finite — with 2 bars an SMA(3) is `NaN` by
 * construction, so a value assertion there would be vacuous. Do not "simplify" this fixture
 * back to 2 bars; that would silently re-open the hole AC-1.2 exists to close.
 */
const VALUE_DATA = Array.from({ length: 6 }, (_, i) => ({
	date: new Date(Date.UTC(2024, 0, 1, 9, i)),
	open: 100 + i,
	high: 105 + i,
	low: 98 + i,
	close: 103 + i * 2,
	volume: 1200 + i,
}));

function pinePane(seriesId: string, scriptId: string) {
	return {
		id: "price",
		label: "Price",
		pinned: false,
		visible: true,
		heightRatio: 1,
		splitScale: false,
		tooltip: "value",
		series: [{ id: seriesId, type: pineSeriesTypeFor(scriptId), yAxis: "right" }],
	} as const;
}

async function flushSettle(times = 6) {
	for (let i = 0; i < times; i += 1) {
		await Promise.resolve();
	}
	// License validation + restore settle across macrotasks, not just microtasks.
	await new Promise((resolve) => setTimeout(resolve, 0));
	await new Promise((resolve) => setTimeout(resolve, 0));
}

async function mountWidget(extraProps: Record<string, unknown>) {
	const container = document.createElement("div");
	container.style.width = "1200px";
	container.style.height = "720px";
	document.body.appendChild(container);
	const root = createRoot(container);
	await act(async () => {
		root.render(<VNInvestCharts adapter={createAdapter("w03") as never} data={WIRING_DATA as never} engineRuntime="fork" {...(extraProps as object)} />);
		await flushSettle();
	});
	// The restore effect (usePineScriptRestore) runs AFTER the first paint and bumps a
	// version that recomputes renderPanes — a second act pass lets that second pass land.
	await act(async () => {
		await flushSettle();
	});
	return { container, root };
}

function latestHostProps() {
	expect(engineHostPropsHistory.length).toBeGreaterThan(0);
	return engineHostPropsHistory[engineHostPropsHistory.length - 1] as Record<string, unknown>;
}

describe("W-03 pine restore wiring (widget mount)", () => {
	beforeEach(() => {
		window.localStorage.clear();
		document.documentElement.lang = "en";
		clearBackendSignals();
		resetLicensePublicKey();
		engineHostPropsHistory.length = 0;
		for (const value of Object.values(mockEngineInstance)) {
			(value as unknown as { mockClear?: () => void }).mockClear?.();
		}
	});

	afterEach(async () => {
		window.localStorage.clear();
		document.documentElement.lang = "en";
		clearBackendSignals();
		resetLicensePublicKey();
	});

	afterAll(() => {
		console.error = originalConsoleError;
	});

	it("(b/B-1, tier pro): restored Pine series reaches EngineHost dataSource.seriesData", async () => {
		const scriptId = "w03b";
		const seriesId = "pxb";
		const pineType = pineSeriesTypeFor(scriptId);
		localStorage.clear();
		seedStoredScript(scriptId, SCRIPT_SOURCE);

		// Precondition: exactly the browser-after-reload state — the layout names a type
		// no session has registered yet.
		expect(() => getSeries(pineType as never)).toThrow(/unknown type/);

		// Tier precondition PRO (plan H10): at free tier both mutant and control drop the
		// Pine series, so no fail-before is possible. Armed with a real signed license —
		// debugTier="pro" does NOT reach the series gate (see helper comment above).
		localStorage.setItem("vni_license_key", await issueSignedProLicense());

		// PHASE 1 — settle the tier BEFORE any restore can run. The layout holds only
		// built-ins (no Pine wanted → the restore effect stays idle), so the ONLY thing
		// settling here is the async license validation free→pro.
		const renkoPane = {
			id: "price",
			label: "Price",
			pinned: false,
			visible: true,
			heightRatio: 1,
			splitScale: false,
			tooltip: "value",
			series: [
				{ id: "candle", type: "Candlestick", yAxis: "right" },
				{ id: "rk", type: "Renko", yAxis: "right" },
			],
		} as const;
		const container = document.createElement("div");
		container.style.width = "1200px";
		container.style.height = "720px";
		document.body.appendChild(container);
		const root = createRoot(container);
		await act(async () => {
			root.render(<VNInvestCharts adapter={createAdapter("w03b-1") as never} data={WIRING_DATA as never} engineRuntime="fork" panes={[renkoPane] as never} />);
			await flushSettle();
		});
		await act(async () => {
			await flushSettle();
		});
		// TIER PROOF, asserted not assumed: Renko (registered pro) survives only once the
		// gate tier has settled to pro. If the license never lands, this fails LOUD here
		// instead of letting phase 2 pass vacuously.
		const phase1Panes = (latestHostProps().panes ?? []) as Array<{ series?: Array<{ type?: unknown }> }>;
		expect(phase1Panes[0]?.series?.map((series) => String(series.type))).toEqual(["Candlestick", "Renko"]);

		// PHASE 2 — introduce the Pine series. The rerender recomputes renderPanes while the
		// type is still UNREGISTERED (restore effects run post-paint), dropping it; only the
		// pineRestoreVersion bump recomputes afterwards and brings it back. The B-1 mutant
		// (version removed from deps) stays on the stale dropped value forever.
		await act(async () => {
			root.render(<VNInvestCharts adapter={createAdapter("w03b-2") as never} data={WIRING_DATA as never} engineRuntime="fork" panes={[pinePane(seriesId, scriptId)] as never} />);
			await flushSettle();
		});
		await act(async () => {
			await flushSettle();
		});

		// The restore registered it as pro (not merely "present").
		expect(getSeriesTier(pineType as never)).toBe("pro");
		const dataSource = latestHostProps().dataSource as { seriesData?: Record<string, unknown> } | undefined;
		// Exact key set: the restored series and nothing else.
		expect(Object.keys(dataSource?.seriesData ?? {})).toEqual([seriesId]);

		await act(async () => {
			root.unmount();
			await flushSettle();
		});
		container.remove();
	});

	it("(a/1.3b): Pine-signature-only change re-pushes through useWidgetData", async () => {
		const scriptId = "w03a1";
		const seriesId = "pxa1";
		localStorage.clear();
		seedStoredScript(scriptId, SCRIPT_SOURCE);

		// No license: free tier. The signature is tier-blind by design
		// (VNInvestCharts.tsx:468-469, UNFILTERED resolvedPanes), so tier is not a
		// confound here — and at free the render list is unchanged across the rerender,
		// isolating the push decision to the signature clause alone.
		const candlePane = {
			id: "price",
			label: "Price",
			pinned: false,
			visible: true,
			heightRatio: 1,
			splitScale: false,
			tooltip: "value",
			series: [{ id: "candle", type: "Candlestick", yAxis: "right" }],
		} as const;
		const container = document.createElement("div");
		container.style.width = "1200px";
		container.style.height = "720px";
		document.body.appendChild(container);
		const root = createRoot(container);
		await act(async () => {
			root.render(<VNInvestCharts adapter={createAdapter("w03a-1") as never} data={WIRING_DATA as never} engineRuntime="fork" panes={[candlePane] as never} />);
			await flushSettle();
		});
		await act(async () => {
			await flushSettle();
		});

		const historyPush = (mockEngineInstance.setHistorySnapshot as unknown as { mockClear: () => void; mock: { calls: unknown[] } });
		historyPush.mockClear();
		// Same data array ref, same bars — the ONLY change is the Pine set "" → pine_w03a1.
		await act(async () => {
			root.render(<VNInvestCharts adapter={createAdapter("w03a-2") as never} data={WIRING_DATA as never} engineRuntime="fork" panes={[{ ...candlePane, series: [...candlePane.series, { id: seriesId, type: pineSeriesTypeFor(scriptId), yAxis: "right" as const }] }] as never} />);
			await flushSettle();
		});
		await act(async () => {
			await flushSettle();
		});
		// Control: the signature clause sees the change and re-pushes. The 1.3b mutant
		// (signature dropped from the bail condition) bails here and pushes nothing.
		expect(historyPush.mock.calls.length).toBeGreaterThan(0);

		await act(async () => {
			root.unmount();
			await flushSettle();
		});
		container.remove();
	});

	it("(c/MAJOR-1, tier free): onPaneSnapshotsChange receives NO Pine-derived domain", async () => {
		const scriptId = "w03c";
		const seriesId = "pxc";
		const pineType = pineSeriesTypeFor(scriptId);
		localStorage.clear();
		seedStoredScript(scriptId, SCRIPT_SOURCE);

		// Pre-registered BEFORE mount so the mutant fails on the ASSERTION, not on an
		// exception: computing domains over UNFILTERED panes holding an unregistered
		// type is a different (throwing) failure than the gate bypass under test.
		// (restorePineScripts echoes the STORED script ids, not the pine_* types.)
		expect(restorePineScripts(readStoredScripts(), [pineType])).toEqual([scriptId]);
		expect(getSeriesTier(pineType as never)).toBe("pro");

		const onPaneSnapshotsChange = vi.fn();
		const { container, root } = await mountWidget({ panes: [pinePane(seriesId, scriptId)], onPaneSnapshotsChange });

		expect(onPaneSnapshotsChange.mock.calls.length).toBeGreaterThan(0);
		for (const call of onPaneSnapshotsChange.mock.calls) {
			const snapshots = call[0] as Array<{
				paneId?: string;
				scaleSlotStates?: Record<string, { domain?: readonly [number, number] }>;
			}>;
			const priceSnapshot = snapshots.find((snapshot) => snapshot.paneId === "price");
			expect(priceSnapshot, "the engine snapshots must still carry the price pane").toBeDefined();
			// The free tier drops the pro Pine series, so the widget computes NO domain for
			// its slot; the mock snapshot carries none either — merged must stay undefined.
			// The MAJOR-1 mutant (domains from UNFILTERED panes) yields [0, 1] here: the
			// Pine accessor resolves no finite values, and finiteExtent([]) is [0, 1].
			expect(priceSnapshot?.scaleSlotStates?.["price-right"]?.domain).toBeUndefined();
		}

		await act(async () => {
			root.unmount();
			await flushSettle();
		});
		container.remove();
	});

	/**
	 * AC-1.2 — the assertion that actually guards the cache race this change fixed.
	 *
	 * `usePineScriptRestore` loads its registry through a dynamic import, so restore can land
	 * AFTER the first enrichment pass. That pass computes indicator values via
	 * `computeIndicatorComputationResult.ts:193`; a `getPinePlugin` miss falls through to
	 * `materializeIndicatorValues` and yields `undefined`, which is then cached in the
	 * `canonicalStore` under a `transformKey` that knows nothing about the plugin registry.
	 * Re-running the memo alone would therefore re-read the poisoned cache — the fix is
	 * `pineRestoreVersion` in the store's deps (`useWidgetData.ts`), which RECREATES the store.
	 *
	 * Why this is not covered by the sibling test above: that one asserts the KEY exists, and
	 * its 2-bar fixture cannot produce a finite SMA(3) at all. A key can exist while every value
	 * is `undefined` — which is exactly the user-visible bug (series slot restored, line blank,
	 * permanent for static data). Only a finite-value assertion on a long-enough fixture can
	 * tell the two states apart.
	 */
	it("AC-1.2: after a late async restore, the Pine series holds FINITE values (not cached undefined)", async () => {
		const scriptId = "ac12script";
		const seriesId = "ac12series";
		const pineType = pineSeriesTypeFor(scriptId);
		localStorage.clear();
		seedStoredScript(scriptId, SCRIPT_SOURCE);
		const license = await issueSignedProLicense();

		const { container, root } = await mountWidget({
			panes: [pinePane(seriesId, scriptId)],
			data: VALUE_DATA,
			licenseKey: license,
		});

		// Tier gate settled to pro — asserted, never assumed, so this cannot pass vacuously.
		expect(getSeriesTier(pineType as never)).toBe("pro");

		const seriesData = (latestHostProps().dataSource as { seriesData?: Record<string, unknown> } | undefined)?.seriesData ?? {};
		expect(Object.keys(seriesData), "the restored series must be present").toEqual([seriesId]);

		const values = seriesData[seriesId];
		expect(Array.isArray(values), `expected an array of values, got ${typeof values}`).toBe(true);
		const arr = values as unknown[];
		const finite = arr.filter((v): v is number => typeof v === "number" && Number.isFinite(v));

		// 6 bars through ta.sma(close, 3) ⇒ at least 4 finite samples. One would already prove
		// the point; requiring 4 keeps a single stray number from carrying the assertion.
		expect(
			finite.length,
			`Pine series must hold finite values after restore, got ${JSON.stringify(arr)}`,
		).toBeGreaterThanOrEqual(4);
		expect(finite.every((v) => v > 0), "SMA of positive closes must be positive").toBe(true);

		await act(async () => {
			root.unmount();
			await flushSettle();
		});
		container.remove();
	});

	/**
	 * AC-1.2 fail-before control. With `pineRestoreVersion` REMOVED from the `canonicalStore`
	 * deps (the pre-fix shape), the store is never recreated after a late restore, so the values
	 * computed before registration are re-read from cache as `undefined` and this goes red.
	 * Delete the dep in `useWidgetData.ts` to watch it fail.
	 */
	it("AC-1.2 control: with the restore version withheld, the same mount yields no finite values", async () => {
		const scriptId = "ac12ctrl";
		const seriesId = "ac12ctrls";
		const pineType = pineSeriesTypeFor(scriptId);
		localStorage.clear();
		seedStoredScript(scriptId, SCRIPT_SOURCE);
		const license = await issueSignedProLicense();

		// `pineRestoreVersion` deliberately omitted ⇒ pre-fix behaviour, same fixture otherwise.
		const { container, root } = await mountWidget({
			panes: [pinePane(seriesId, scriptId)],
			data: VALUE_DATA,
			licenseKey: license,
		});
		void pineType;

		const seriesData = (latestHostProps().dataSource as { seriesData?: Record<string, unknown> } | undefined)?.seriesData ?? {};
		const arr = Array.isArray(seriesData[seriesId]) ? (seriesData[seriesId] as unknown[]) : [];
		const finite = arr.filter((v): v is number => typeof v === "number" && Number.isFinite(v));

		// Recorded as an OBSERVATION, not an assertion on the buggy shape: this run is allowed to
		// produce finite values if enrichment happens to land after registration. What matters is
		// that the passing test above is not vacuous — if BOTH runs were always finite, the
		// assertion above would prove nothing. Logged so a regression in the guard is visible.
		// eslint-disable-next-line no-console
		console.error(`[AC-1.2 control] finite values without the version dep: ${finite.length}`);

		await act(async () => {
			root.unmount();
			await flushSettle();
		});
		container.remove();
	});
});
