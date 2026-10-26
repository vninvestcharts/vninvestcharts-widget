/**
 * INT-04 — Unit tests for VNInvestClient
 * Tests via the vninvest/VNInvestClient re-export path.
 * 7 cases matching TASKBOARD INT-04 specification.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VNInvestClient } from "../../../widget/adapters/VNInvestClient";
import { clearSessionState } from "../../../lib/credentials/credentialStore";

describe("VNInvestClient (INT-04)", () => {
	beforeEach(() => {
		// CS-7: this file stubs localStorage globally, so credentialStore writes land
		// in REAL module session memory while reads hit the mock. Without a reset,
		// one test's setPAT leaks into the next test's hasPAT — order-dependent green.
		clearSessionState();
		vi.stubGlobal("localStorage", {
			getItem: vi.fn().mockReturnValue(null),
			setItem: vi.fn(),
			removeItem: vi.fn(),
		});
	});

	afterEach(() => {
		VNInvestClient.__resetBarsHotWindowCacheForTests();
		clearSessionState();
		vi.unstubAllGlobals();
	});

	it("setPAT thành công → PAT được lưu localStorage → hasPAT() = true", () => {
		const setItem = vi.fn();
		vi.stubGlobal("localStorage", {
			getItem: vi.fn().mockReturnValue(null),
			setItem,
			removeItem: vi.fn(),
		});
		const client = new VNInvestClient();
		client.setPAT("test-pat-token");
		expect(client.hasPAT()).toBe(true);
		expect(setItem).toHaveBeenCalledWith(expect.any(String), "test-pat-token");
	});

	it("getChart 401 → throw TOKEN_EXPIRED", async () => {
		const client = new VNInvestClient();
		client.setPAT("test-token");
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 401, ok: false }));
		await expect(client.getChart("VCB")).rejects.toThrow("TOKEN_EXPIRED");
	});

	it("getChart 200 → trả đúng RawOHLCVBar[] shape", async () => {
		const client = new VNInvestClient();
		client.setPAT("test-token");
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
			status: 200,
			ok: true,
			json: vi.fn().mockResolvedValue({
				points: [{ date: "2026-01-01", open: 100, high: 110, low: 90, close: 105, volume: 1000 }],
			}),
		}));
		const bars = await client.getChart("VCB");
		expect(bars).toHaveLength(1);
		expect(bars[0].date).toBeInstanceOf(Date);
		expect(bars[0].close).toBe(105);
	});

	it("getChart 404 → throw SYMBOL_NOT_FOUND", async () => {
		const client = new VNInvestClient();
		client.setPAT("test-token");
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 404, ok: false }));
		await expect(client.getChart("INVALID")).rejects.toThrow("SYMBOL_NOT_FOUND");
	});

	it("hasPAT() = false khi localStorage rỗng và chưa setPAT", () => {
		const client = new VNInvestClient();
		expect(client.hasPAT()).toBe(false);
	});

	it("hasPAT() = true sau setPAT với token hợp lệ", () => {
		const client = new VNInvestClient();
		client.setPAT("valid-token-123");
		expect(client.hasPAT()).toBe(true);
	});

	it("constructor picks up a memory-only PAT after storage quota failure (CS-7)", () => {
		// writePat holds the value in session memory even when the storage write
		// throws. A LATER constructor must see it; before the readSessionPat
		// fallback it saw nothing and the session token was silently dropped.
		const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("QuotaExceeded"); });
		try {
			const first = new VNInvestClient();
			first.setPAT("quota-token");
			expect(first.hasPAT()).toBe(true);
			const second = new VNInvestClient();
			expect(second.hasPAT()).toBe(true);
		} finally {
			spy.mockRestore();
		}
	});

	it("setPAT với whitespace-only → clearPAT → hasPAT() = false", () => {
		const client = new VNInvestClient();
		client.setPAT("existing-token");
		expect(client.hasPAT()).toBe(true);
		client.setPAT("   ");
		expect(client.hasPAT()).toBe(false);
	});

	it("syncTransportPat updates transport without touching storage", () => {
		// A host/tenant credential resolved by the context must ride on requests
		// without being persisted to the user storage. Before this method, the
		// only sync path was setPAT (which writes storage) or nothing at all.
		// "Nothing" is what shipped: pasted PATs never left the browser, and the
		// backend 401d with "credentials not provided".
		const setItem = vi.fn();
		vi.stubGlobal("localStorage", {
			getItem: vi.fn().mockReturnValue(null),
			setItem,
			removeItem: vi.fn(),
		});
		const client = new VNInvestClient();
		expect(client.hasPAT()).toBe(false);
		client.syncTransportPat("vni_host_token");
		expect(client.hasPAT()).toBe(true);
		expect(client.getPAT()).toBe("vni_host_token");
		expect(setItem).not.toHaveBeenCalled();
		client.syncTransportPat("vni_host_token");
		expect(client.getPAT()).toBe("vni_host_token");
	});
});

describe("VNInvestClient constructor PAT migration (LIC-ACTIVATION)", () => {
	// Structurally-valid signed license shape `vni1.<payload>.<sig>`.
	// parseLicenseKey only checks structure (payload {t, e} + non-empty sig);
	// real ECDSA verification happens later via verifyLicenseKey — a fake sig
	// here is intentionally fine because the constructor only preserves, never grants.
	const b64url = (s: string): string =>
		globalThis.btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
	const SIGNED_STRUCTURAL_KEY = `vni1.${b64url(JSON.stringify({ t: "pro", e: 9999999999 }))}.${b64url("sig")}`;

	function stubStorage(initial: Record<string, string>) {
		const map = new Map<string, string>(Object.entries(initial));
		vi.stubGlobal("localStorage", {
			getItem: vi.fn((k: string) => map.get(k) ?? null),
			setItem: vi.fn((k: string, v: string) => { map.set(k, v); }),
			removeItem: vi.fn((k: string) => { map.delete(k); }),
		});
		return map;
	}

	// CS-1 CONTRACT CHANGE (intentional, see PLAN_CREDENTIAL_SPLIT_O1 AC-1.9).
	// The old expectation was hasPAT() === true for a `vni1.*` blob, i.e. a license
	// was being loaded as a bearer token. That is the credential crossing this
	// slice exists to close, so the expectation is now inverted.
	it("blob license vni1.* - KHONG nap vao _pat (hasPAT=false), van giu trong storage", () => {
		const storage = stubStorage({ vni_pat: SIGNED_STRUCTURAL_KEY });
		const client = new VNInvestClient();
		expect(client.hasPAT()).toBe(false);
		expect(storage.get("vni_pat")).toBe(SIGNED_STRUCTURAL_KEY);
		expect(storage.has("vni_pat_cleared_v1")).toBe(false);
	});

	it("xóa token legacy 1 lần (DEFAULT_PAT empty) — set flag, không nạp _pat", () => {
		const storage = stubStorage({ vni_pat: "vni_pro_legacy_old" });
		const client = new VNInvestClient();
		expect(client.hasPAT()).toBe(false);
		expect(storage.has("vni_pat")).toBe(false);
		expect(storage.get("vni_pat_cleared_v1")).toBe("1");
	});

	it("token legacy + migration flag đã set → bỏ qua, không xóa thêm, không nạp _pat", () => {
		const storage = stubStorage({ vni_pat: "vni_pro_legacy_old", vni_pat_cleared_v1: "1" });
		const client = new VNInvestClient();
		expect(client.hasPAT()).toBe(false);
		expect(storage.get("vni_pat")).toBe("vni_pro_legacy_old");
	});

	afterEach(() => {
		VNInvestClient.__resetBarsHotWindowCacheForTests();
		clearSessionState();
		vi.unstubAllGlobals();
	});
});
