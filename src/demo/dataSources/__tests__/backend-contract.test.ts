/**
 * BE-01…BE-04b — Backend contract regression tests (widget-side).
 *
 * Fixtures use the EXACT response shapes verified live against the dev backend
 * (127.0.0.1:8001, 2026-09-21, PAT dev). Values are synthetic; keys are real.
 * Each test is tagged with its finding ID from
 * docs/planning/BACKEND_INTEGRATION_DRAFT_2026-09-21.md.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	BARS_LIMIT_MAX,
	VNInvestClient,
} from "../../../widget/adapters/VNInvestClient";
import { unwrapWsEnvelope } from "../../../widget/adapters/VNInvestWebSocketClient";
import { VNInvestDataAdapter } from "../../../widget/adapters/VNInvestDataAdapter";

function stubFetchOnce(payload: unknown, status = 200, ok = true) {
	const fetchMock = vi.fn().mockResolvedValue({
		status,
		ok,
		json: vi.fn().mockResolvedValue(payload),
	});
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

describe("BE-01 bars limit", () => {
	let client: VNInvestClient;

	beforeEach(() => {
		vi.stubGlobal("localStorage", {
			getItem: vi.fn().mockReturnValue(null),
			setItem: vi.fn(),
			removeItem: vi.fn(),
		});
		VNInvestClient.__resetBarsHotWindowCacheForTests();
		client = new VNInvestClient();
		client.setPAT("test-token");
	});

	afterEach(() => {
		VNInvestClient.__resetBarsHotWindowCacheForTests();
		vi.unstubAllGlobals();
	});

	it("BARS_LIMIT_MAX khớp backend _OHLCV_BAR_LIMIT_MAX=1000", () => {
		expect(BARS_LIMIT_MAX).toBe(1000);
	});

	it("getBarsPage backward clamp limit 5000 → 1000 trong URL", async () => {
		const fetchMock = stubFetchOnce({ bars: [], has_more_before: false, has_more_after: false, next_before: null, snapshot_id: null });
		await client.getBarsPage({ type: "backward", symbol: "VCB", timeframe: "D", before: 1704067200000, limit: 5000 });
		const url = String(fetchMock.mock.calls[0][0]);
		expect(url).toContain("limit=1000");
		expect(url).not.toContain("limit=5000");
	});

	it("getBarsPage init clamp limit 5000 → 1000 trong URL", async () => {
		const fetchMock = stubFetchOnce({ bars: [], has_more_before: false, has_more_after: false, next_before: null, snapshot_id: null });
		await client.getBarsPage({ type: "init", symbol: "VCB", timeframe: "D", from: 1703808000000, to: 1704412800000, limit: 5000 });
		const url = String(fetchMock.mock.calls[0][0]);
		expect(url).toContain("limit=1000");
	});

	it("getBarsPage parse đúng shape bars thật {timestamp,open,high,low,close,volume}", async () => {
		stubFetchOnce({
			symbol: "VCB",
			timeframe: "D",
			bars: [{ timestamp: 1789516800000, open: 60100, high: 60300, low: 59300, close: 59300, volume: 2880800 }],
			has_more_before: true,
			has_more_after: false,
			next_before: 1789516800000,
			next_after: 1789516800000,
			snapshot_id: "snap-1",
		});
		const page = await client.getBarsPage({ type: "backward", symbol: "VCB", timeframe: "D", before: 1789600000000, limit: 100 });
		expect(page.bars).toHaveLength(1);
		expect(page.bars[0]).toMatchObject({ open: 60100, high: 60300, low: 59300, close: 59300, volume: 2880800 });
		expect(page.hasMoreBefore).toBe(true);
		expect(page.nextBefore).toBe(1789516800000);
		expect(page.snapshotId).toBe("snap-1");
	});
});

describe("BE-02b WS envelope unwrap", () => {
	// Fixture shape thật từ signal_intelligence/broadcasting.py::_envelope + realtime_prefetch.
	const serverEnvelope = {
		contract_version: "1.0",
		event_type: "ticker_update",
		symbol: "VCB",
		ts: "2026-09-21T07:45:28+00:00",
		seq: 556,
		source: "channels-gateway",
		data: {
			price: 59900,
			current_price: 59900,
			prev_price: 59800,
			change_value: 100,
			change_pct: 0.17,
			open_price: 59600,
			high_price: 60100,
			low_price: 59400,
			volume: 3047400,
		},
	};

	it("unwrap envelope → body có tick fields + ts/seq/symbol backfill", () => {
		const body = unwrapWsEnvelope(serverEnvelope as unknown as Record<string, unknown>);
		expect(body["price"]).toBe(59900);
		expect(body["open_price"]).toBe(59600);
		expect(body["ts"]).toBe("2026-09-21T07:45:28+00:00");
		expect(body["seq"]).toBe(556);
		expect(body["symbol"]).toBe("VCB");
		expect(body["event_type"]).toBe("ticker_update");
	});

	it("payload phẳng (legacy) đi qua không đổi", () => {
		const flat = { event_type: "ticker_update", symbol: "VCB", price: 1, current_price: 1, volume: 10, ts: "x" };
		expect(unwrapWsEnvelope(flat as unknown as Record<string, unknown>)).toBe(flat);
	});

	it("data không phải object → passthrough", () => {
		const weird = { event_type: "ping", data: 42 };
		expect(unwrapWsEnvelope(weird as unknown as Record<string, unknown>)).toBe(weird);
	});
});

describe("BE-02b ticker → OHLCV mapping", () => {
	it("map đúng *_price keys, stale skip, NaN không emit", () => {
		const adapter = new VNInvestDataAdapter({ patToken: "x" });
		const seen: Array<{ close: number; open: number; high: number; low: number; volume: number }> = [];
		(adapter as unknown as { barSubscribers: Map<string, Set<(b: never) => void>> }).barSubscribers.set(
			"VCB:D",
			new Set([(b: never) => { seen.push(b as unknown as { close: number; open: number; high: number; low: number; volume: number }); }]),
		);
		const handle = (adapter as unknown as { handleTickerUpdate: (e: unknown) => void }).handleTickerUpdate.bind(adapter);

		handle({ event_type: "ticker_update", symbol: "VCB", price: 59900, current_price: 59950, open_price: 59600, high_price: 60100, low_price: 59400, volume: 100, ts: "2026-09-21T07:45:28+00:00", seq: 7 });
		expect(seen).toHaveLength(1);
		expect(seen[0]).toMatchObject({ open: 59600, high: 60100, low: 59400, close: 59950, volume: 100 });

		handle({ event_type: "ticker_update", symbol: "VCB", price: 1, current_price: 1, volume: 1, ts: "x", stale: true });
		expect(seen).toHaveLength(1);

		handle({ event_type: "ticker_update", symbol: "VCB", price: Number.NaN, current_price: Number.NaN, volume: 1, ts: "x" });
		expect(seen).toHaveLength(1);
		adapter.destroy();
	});
});

describe("BE-03 tape + BE-04b order-flow native shapes", () => {
	let client: VNInvestClient;

	beforeEach(() => {
		vi.stubGlobal("localStorage", {
			getItem: vi.fn().mockReturnValue(null),
			setItem: vi.fn(),
			removeItem: vi.fn(),
		});
		client = new VNInvestClient();
		client.setPAT("test-token");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("getTapeEntries gọi path-param + map trades → entries", async () => {
		const fetchMock = stubFetchOnce({
			symbol: "VCB",
			trades: [
				{ time: "14:45:28", ts: "2026-09-18T07:45:28+00:00", price: 59900, volume: 1000, side: "BUY", match_type: "ato" },
				{ time: "14:45:29", ts: "2026-09-18T07:45:29+00:00", price: 59800, volume: 500, side: "UNKNOWN", match_type: "atc" },
			],
			total: 2,
		});
		const tape = await client.getTapeEntries("VCB");
		const url = String(fetchMock.mock.calls[0][0]);
		expect(url).toContain("/market-data/intraday-tape/VCB/");
		expect(url).not.toContain("?symbol=");
		expect(tape).not.toBeNull();
		expect(tape!.symbol).toBe("VCB");
		expect(tape!.entries).toHaveLength(2);
		expect(tape!.entries[0]).toMatchObject({ price: 59900, volume: 1000, value: 59900 * 1000, side: "buy" });
		expect(tape!.entries[1].side).toBe("unknown");
	});

	it("getTapeEntries giữ tương thích envelope ok-wrapped cũ", async () => {
		stubFetchOnce({ ok: true, symbol: "VCB", entries: [] });
		const tape = await client.getTapeEntries("VCB");
		expect(tape).not.toBeNull();
		expect(tape!.entries).toEqual([]);
	});

	it("getOrderFlow map native shape (không ok) → dark_flow + signals", async () => {
		stubFetchOnce({
			symbol: "VCB",
			window: "30m",
			dark_flow: { signal_type: "absorption", strength: 72.5, confidence: 0.8, direction: "buy", components: {} },
			latest_signal: null,
			signals: [
				{ id: "742791d7-1e7a-4a9d-914c-3abf46b5b4c2", symbol: "VCB", signal_type: "absorption", strength: 70, confidence: 0.7, tick_rate: 12.5, small_order_ratio: 0.3, created_at: "2026-09-21T05:08:57+00:00" },
			],
			tick_rate: { tick_rate_per_min: 12.5 },
			size_distribution: { small_ratio: 0.3 },
			order_flow: [],
		});
		const flow = await client.getOrderFlow("VCB", "30m");
		expect(flow).not.toBeNull();
		expect(flow!.dark_flow.signal_type).toBe("absorption");
		expect(flow!.window_minutes).toBe(30);
		expect(flow!.signals).toHaveLength(1);
		expect(flow!.signals[0].id).toBe("742791d7-1e7a-4a9d-914c-3abf46b5b4c2");
	});

	it("getOrderFlow trả null khi shape lạ", async () => {
		stubFetchOnce({ foo: 1 });
		await expect(client.getOrderFlow("VCB")).resolves.toBeNull();
	});
});

describe("BE-07 auth/me profile shape", () => {
	it("validateMe parse được profile không có token fields", async () => {
		vi.stubGlobal("localStorage", {
			getItem: vi.fn().mockReturnValue(null),
			setItem: vi.fn(),
			removeItem: vi.fn(),
		});
		const client = new VNInvestClient();
		client.setPAT("test-token");
		stubFetchOnce({
			plan: "pro",
			active_pat_count: 1,
			abilities: ["market:read"],
			entitlements: {},
			user: { id: 1, username: "u", email: "e", first_name: "", last_name: "", is_staff: false },
			tenant: { tenant_id: "t", tenant_code: "c", display_name: "d", plan: "pro", max_active_pats: -1, status: "active" },
		});
		const me = await client.validateMe();
		expect(me.plan).toBe("pro");
		expect(me.access).toBeUndefined();
		vi.unstubAllGlobals();
	});
});

describe("504-guard intraday chunking", () => {
	let client: VNInvestClient;

	beforeEach(() => {
		vi.stubGlobal("localStorage", {
			getItem: vi.fn().mockReturnValue(null),
			setItem: vi.fn(),
			removeItem: vi.fn(),
		});
		VNInvestClient.__resetBarsHotWindowCacheForTests();
		client = new VNInvestClient();
		client.setPAT("test-token");
	});

	afterEach(() => {
		VNInvestClient.__resetBarsHotWindowCacheForTests();
		vi.unstubAllGlobals();
	});

	const emptyPage = { bars: [], has_more_before: false, has_more_after: false, next_before: null, snapshot_id: null };
	const DAY_MS = 86_400_000;

	it("fetchBarsInRange 90d/1H caps the first request to ≤30d", async () => {
		const fetchMock = stubFetchOnce(emptyPage);
		const adapter = new VNInvestDataAdapter({ patToken: "test-token", apiBase: "http://127.0.0.1" });
		const to = Date.now();
		const from = to - 90 * DAY_MS;
		await adapter.fetchBarsInRange("VCB", "1H", new Date(from), new Date(to));
		const url = new URL(String(fetchMock.mock.calls[0][0]));
		const reqTo = Number(url.searchParams.get("to"));
		expect(reqTo - from).toBeLessThanOrEqual(30 * DAY_MS);
		adapter.destroy();
	});

	it("fetchBarsInRange 90d/D keeps the full window in one request", async () => {
		const fetchMock = stubFetchOnce(emptyPage);
		const adapter = new VNInvestDataAdapter({ patToken: "test-token", apiBase: "http://127.0.0.1" });
		const to = Date.now();
		const from = to - 90 * DAY_MS;
		await adapter.fetchBarsInRange("VCB", "D", new Date(from), new Date(to));
		const url = new URL(String(fetchMock.mock.calls[0][0]));
		expect(Number(url.searchParams.get("from"))).toBe(from);
		expect(Number(url.searchParams.get("to"))).toBe(to);
		adapter.destroy();
	});
});

describe("Follow-up whale alerts (native {symbol, alerts[]})", () => {
	let client: VNInvestClient;

	beforeEach(() => {
		vi.stubGlobal("localStorage", {
			getItem: vi.fn().mockReturnValue(null),
			setItem: vi.fn(),
			removeItem: vi.fn(),
		});
		client = new VNInvestClient();
		client.setPAT("test-token");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	// Shape thật: GET /realtime/whale-feed/VCB/ 2026-09-21 (26 alerts).
	const nativeFeed = {
		symbol: "VCB",
		alerts: [
			{ id: "742791d7-1e7a-4a9d-914c-3abf46b5b4c2", alert_type: "signal", severity: "low", title: "Bien dong bat thuong VCB", value: "2.32", direction: "sell", triggered_at: "2026-09-21T05:08:57.759973+00:00" },
		],
	};

	it("getWhaleFeed map native alerts (không bịa whale_orders)", async () => {
		stubFetchOnce(nativeFeed);
		const feed = await client.getWhaleFeed("VCB");
		expect(feed).not.toBeNull();
		expect(feed!.symbol).toBe("VCB");
		expect(feed!.whale_orders).toEqual([]);
		expect(feed!.alerts).toHaveLength(1);
		expect(feed!.alerts![0]).toMatchObject({ severity: "low", direction: "sell", value: "2.32" });
	});

	it("getWhaleFeed giữ tương thích legacy {summary, whale_orders}", async () => {
		stubFetchOnce({ symbol: "VCB", whale_orders: [], summary: { buy_value: 1, sell_value: 0, shark_buy: 0, shark_sell: 0, whale_buy: 0, whale_sell: 0, small_buy: 0, small_sell: 0 } });
		const feed = await client.getWhaleFeed("VCB");
		expect(feed).not.toBeNull();
		expect(feed!.alerts).toBeUndefined();
	});

	it("getWhaleFeed trả null khi shape lạ", async () => {
		stubFetchOnce({ foo: 1 });
		await expect(client.getWhaleFeed("VCB")).resolves.toBeNull();
	});
});

describe("Follow-up advisory V2 (native session)", () => {
	let client: VNInvestClient;

	beforeEach(() => {
		vi.stubGlobal("localStorage", {
			getItem: vi.fn().mockReturnValue(null),
			setItem: vi.fn(),
			removeItem: vi.fn(),
		});
		client = new VNInvestClient();
		client.setPAT("test-token");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("getAdvisorySessionV2 parse empty state (no_advisory_data)", async () => {
		stubFetchOnce({
			queued: false, symbol: "VCB", contract: "v1", contract_version: "v1",
			reason: "no_advisory_data", message: "Chua co du lieu.",
			advisory: null, aggregate: null, components: [], deleted_components: [],
			executive_summary: null, executive_summaries: [],
		});
		const session = await client.getAdvisorySessionV2("VCB");
		expect(session).not.toBeNull();
		expect(session!.queued).toBe(false);
		expect(session!.reason).toBe("no_advisory_data");
		expect(session!.aggregate).toBeNull();
	});

	it("getAdvisorySessionV2 parse record state (decision + summary)", async () => {
		stubFetchOnce({
			queued: false, symbol: "VCB", contract_version: "v1", status: "generated",
			advisory: { advisory_id: "x", status: "generated", advisory_text: "t", ai_model: "m" },
			aggregate: { advisory_id: "x", session_date: "2026-09-21", selected_trade_date: "2026-09-21", contract_version: "v1", decision: { action: "hold", risk: "medium", score_band: "medium", score: 0.55 } },
			components: [{ id: 1, symbol: "VCB", component_type: "indicator", indicator_name: "RSI", status: "neutral", confidence_score: 7, suggested_action: "watch", rationale_text: "r", timeframe: "30m", include_in_summary: true, is_deleted: false, created_at: "t", updated_at: "t" }],
			deleted_components: [],
			executive_summary: { symbol: "VCB", session_date: "2026-09-21", strategy_action: "hold", risk_level: "medium", overall_confidence: 6.5, score_band: "medium", summary_text: "s", component_ids: [1], active_components_count: 1, source: "native" },
			executive_summaries: [],
		});
		const session = await client.getAdvisorySessionV2("VCB");
		expect(session!.aggregate!.decision).toMatchObject({ action: "hold", risk: "medium" });
		expect(session!.executive_summary!.strategy_action).toBe("hold");
		expect(session!.components).toHaveLength(1);
	});

	it("getAdvisorySessionV2 trả null khi transport lỗi", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
		await expect(client.getAdvisorySessionV2("VCB")).resolves.toBeNull();
	});

	it("refreshAdvisorySession POST đúng endpoint mới", async () => {
		const fetchMock = stubFetchOnce({ queued: true, symbol: "VCB", contract_version: "v1", advisory: null, aggregate: null, components: [], deleted_components: [], executive_summary: null, executive_summaries: [] });
		const session = await client.refreshAdvisorySession("VCB");
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/stock-management/stocks/VCB/ai-advisory-session/");
		expect((init as RequestInit).method).toBe("POST");
		expect(session!.queued).toBe(true);
	});
});

