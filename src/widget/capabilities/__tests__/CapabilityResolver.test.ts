import { describe, expect, it } from "vitest";
import {
	UNKNOWN_AVAILABILITY,
	isBackendMissing,
	isLocked,
	isUsable,
	resolveCapabilities,
	type BackendAvailability,
} from "../CapabilityResolver";
import { detectDeviceCaps, probeBackend, resetProbeCache } from "../capabilityProbe";

const BACKEND_OK: BackendAvailability = { healthOk: true, whaleFeedOk: true, probed: true, probedAt: 1 };
const BACKEND_DEAD: BackendAvailability = { healthOk: false, whaleFeedOk: false, probed: true, probedAt: 1 };

describe("resolveCapabilities: fail-closed khi chưa xác minh tier", () => {
	it("tier null ⇒ Track A và Track B đều khoá", () => {
		const caps = resolveCapabilities({ tier: null });
		expect(caps.indicator_full.state).toBe("locked");
		expect(caps.export_png.state).toBe("locked");
		expect(caps.cloud_alert.state).toBe("locked");
	});

	it("tier undefined giống null", () => {
		const caps = resolveCapabilities({ tier: undefined });
		expect(caps.indicator_full.state).toBe("locked");
	});

	it("tier none chỉ mở Community", () => {
		const caps = resolveCapabilities({ tier: "none" });
		expect(caps.basic_chart.state).toBe("granted");
		expect(caps.indicator_full.state).toBe("locked");
		expect(caps.multi_chart.state).toBe("locked");
	});

	it("locked luôn kèm đúng tier yêu cầu", () => {
		const free = resolveCapabilities({ tier: "free" });
		const pro = resolveCapabilities({ tier: "pro" });
		if (free.indicator_full.state === "locked") expect(free.indicator_full.requires).toBe("pro");
		if (pro.cloud_alert.state === "locked") expect(pro.cloud_alert.requires).toBe("enterprise");
	});
});

describe("resolveCapabilities: Track A chạy offline, không cần backend", () => {
	const TRACK_A = [
		"indicator_full", "indicator_histogram", "indicator_advanced", "chart_baseline",
		"chart_exotic", "volume_profile", "pine_editor", "strategy_tester", "replay",
		"alert_local", "alert_drawing", "export_png", "export_csv", "auto_pattern",
		"measure_pane", "shortcut_map", "scale_sync", "layout_user", "session_hours",
	] as const;

	it("pro + backend CHẾT vẫn granted cho toàn bộ Track A", () => {
		const caps = resolveCapabilities({ tier: "pro", backend: BACKEND_DEAD });
		for (const cap of TRACK_A) {
			expect(caps[cap].state, `${cap} phải chạy được offline`).toBe("granted");
		}
	});

	it("pro + CHƯA probe (chưa biết) vẫn granted — không chặn nhầm", () => {
		const caps = resolveCapabilities({ tier: "pro", backend: UNKNOWN_AVAILABILITY });
		for (const cap of TRACK_A) {
			expect(caps[cap].state, `${cap}`).toBe("granted");
		}
	});
});

describe("resolveCapabilities: Track B degrade khi backend chưa sẵn sàng", () => {
	it("enterprise + backend chết ⇒ degraded(backend_missing), KHÔNG phải locked", () => {
		const caps = resolveCapabilities({ tier: "enterprise", backend: BACKEND_DEAD });
		expect(caps.cloud_alert.state).toBe("degraded");
		expect(isBackendMissing(caps.cloud_alert)).toBe(true);
		// Quan trọng: đã trả tiền nên KHÔNG hiện upsell.
		expect(isLocked(caps.cloud_alert)).toBe(false);
	});

	it("enterprise + backend sống ⇒ granted", () => {
		const caps = resolveCapabilities({ tier: "enterprise", backend: BACKEND_OK });
		expect(isUsable(caps.cloud_alert)).toBe(true);
		expect(isUsable(caps.server_workspace)).toBe(true);
		expect(isUsable(caps.orderbook_dom)).toBe(true);
	});

	it("pro KHÔNG được Track B dù backend sống (chưa tới tier)", () => {
		const caps = resolveCapabilities({ tier: "pro", backend: BACKEND_OK });
		expect(caps.cloud_alert.state).toBe("locked");
		expect(caps.orderbook_dom.state).toBe("locked");
	});
});

describe("resolveCapabilities: giới hạn thiết bị", () => {
	it("màn hình hẹp ⇒ degrade các tính năng nặng, không khoá", () => {
		const caps = resolveCapabilities({
			tier: "pro",
			device: { narrow: true, concurrency: 4 },
		});
		expect(caps.auto_pattern.state).toBe("degraded");
		expect(caps.volume_footprint.state).toBe("degraded");
		if (caps.auto_pattern.state === "degraded") expect(caps.auto_pattern.reason).toBe("device_limited");
		// Tính năng nhẹ vẫn chạy.
		expect(caps.indicator_full.state).toBe("granted");
		expect(caps.export_png.state).toBe("granted");
	});

	it("desktop ⇒ không degrade vì thiết bị", () => {
		const caps = resolveCapabilities({ tier: "pro", device: { narrow: false, concurrency: 8 } });
		expect(caps.auto_pattern.state).toBe("granted");
	});
});

describe("resolveCapabilities: forcedReason ưu tiên cao", () => {
	it("quota đo được ⇒ degrade kể cả khi backend sống", () => {
		const caps = resolveCapabilities({
			tier: "pro",
			backend: BACKEND_OK,
			forcedReason: { export_csv: "quota_local" },
		});
		expect(caps.export_csv.state).toBe("degraded");
		if (caps.export_csv.state === "degraded") expect(caps.export_csv.reason).toBe("quota_local");
	});

	it("forcedReason KHÔNG thể vượt quyền (tier thấp vẫn locked)", () => {
		// Lock kiểm TRƯỚC forcedReason: forcedReason chỉ giảm quyền, không cấp quyền.
		const caps = resolveCapabilities({
			tier: "free",
			forcedReason: { export_png: "quota_local" },
		});
		expect(caps.export_png.state).toBe("locked");
		// `deep_history` là enterprise: pro vẫn locked dù có forcedReason.
		const pro = resolveCapabilities({
			tier: "pro",
			backend: BACKEND_OK,
			forcedReason: { deep_history: "quota_local" },
		});
		expect(pro.deep_history.state).toBe("locked");
	});
});

describe("capabilityProbe: không bao giờ ném lỗi, luôn trả trạng thái", () => {
	it("không có baseUrl ⇒ chưa biết (không chặn Track A)", async () => {
		resetProbeCache();
		const r = await probeBackend({ baseUrl: null });
		expect(r.probed).toBe(false);
		expect(r.healthOk).toBe(false);
	});

	it("health fail ⇒ probed=true, healthOk=false", async () => {
		resetProbeCache();
		const r = await probeBackend({
			baseUrl: "http://x",
			fetchImpl: (async () => new Response("{}", { status: 503 })) as typeof fetch,
		});
		expect(r.probed).toBe(true);
		expect(r.healthOk).toBe(false);
	});

	it("health ok + quotes 401 ⇒ healthOk=true, whaleFeedOk=false", async () => {
		resetProbeCache();
		const r = await probeBackend({
			baseUrl: "http://x",
			fetchImpl: (async (url: string) =>
				new Response("{}", { status: String(url).includes("health") ? 200 : 401 })) as unknown as typeof fetch,
		});
		expect(r.healthOk).toBe(true);
		expect(r.whaleFeedOk).toBe(false);
	});

	it("network throw ⇒ chưa biết, không crash", async () => {
		resetProbeCache();
		const r = await probeBackend({
			baseUrl: "http://x",
			fetchImpl: (async () => {
				throw new Error("offline");
			}) as typeof fetch,
		});
		expect(r.probed).toBe(false);
	});

	it("cache 5 phút: gọi 2 lần chỉ fetch 1 lần", async () => {
		resetProbeCache();
		let calls = 0;
		const fetchImpl = (async () => {
			calls += 1;
			return new Response("{}", { status: 200 });
		}) as unknown as typeof fetch;
		await probeBackend({ baseUrl: "http://cache-test", fetchImpl });
		await probeBackend({ baseUrl: "http://cache-test", fetchImpl });
		expect(calls).toBe(2); // health + quotes, chỉ 1 vòng probe
		resetProbeCache();
	});
});

describe("detectDeviceCaps: thiếu API ⇒ coi như desktop, không đoán bật tắt", () => {
	it("môi trường không có window.matchMedia ⇒ narrow=false", () => {
		const caps = detectDeviceCaps();
		expect(typeof caps.narrow).toBe("boolean");
	});
});
