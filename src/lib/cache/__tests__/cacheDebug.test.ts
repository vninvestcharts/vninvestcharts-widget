import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isCacheDisabled, getCacheTTL, enforceMaxSize } from "../cacheDebug";

describe("cacheDebug", () => {
	describe("enforceMaxSize", () => {
		it("does nothing when map is under limit", () => {
			const map = new Map<string, number>([
				["a", 1],
				["b", 2],
			]);
			enforceMaxSize(map, 5);
			expect(map.size).toBe(2);
			expect(map.get("a")).toBe(1);
		});

		it("does nothing when map is at limit", () => {
			const map = new Map<string, number>([
				["a", 1],
				["b", 2],
			]);
			enforceMaxSize(map, 2);
			expect(map.size).toBe(2);
		});

		it("evicts oldest entries (FIFO) when map exceeds limit", () => {
			const map = new Map<string, number>();
			map.set("a", 1);
			map.set("b", 2);
			map.set("c", 3);
			enforceMaxSize(map, 2);
			expect(map.size).toBe(2);
			expect(map.has("a")).toBe(false);
			expect(map.get("b")).toBe(2);
			expect(map.get("c")).toBe(3);
		});

		it("evicts multiple entries when well over limit", () => {
			const map = new Map<string, number>();
			for (let i = 0; i < 10; i++) map.set(String(i), i);
			enforceMaxSize(map, 3);
			expect(map.size).toBe(3);
			expect([...map.keys()]).toEqual(["7", "8", "9"]);
		});

		it("handles empty map gracefully", () => {
			const map = new Map<string, number>();
			enforceMaxSize(map, 5);
			expect(map.size).toBe(0);
		});
	});

	describe("getCacheTTL", () => {
		const originalLocation = window.location;

		afterEach(() => {
			vi.stubGlobal("location", originalLocation);
		});

		it("returns default TTL when no URL override", () => {
			vi.stubGlobal("location", { ...originalLocation, search: "" });
			expect(getCacheTTL(1000)).toBe(1000);
		});

		it("returns override from ?bars-ttl= URL param", () => {
			vi.stubGlobal("location", { ...originalLocation, search: "?bars-ttl=5000" });
			expect(getCacheTTL(1000)).toBe(5000);
		});

		it("returns default when override is non-numeric", () => {
			vi.stubGlobal("location", { ...originalLocation, search: "?bars-ttl=abc" });
			expect(getCacheTTL(1000)).toBe(1000);
		});

		it("returns default when override is zero or negative", () => {
			vi.stubGlobal("location", { ...originalLocation, search: "?bars-ttl=0" });
			expect(getCacheTTL(1000)).toBe(1000);

			vi.stubGlobal("location", { ...originalLocation, search: "?bars-ttl=-100" });
			expect(getCacheTTL(1000)).toBe(1000);
		});
	});

	describe("isCacheDisabled", () => {
		const originalLocation = window.location;

		afterEach(() => {
			vi.stubGlobal("location", originalLocation);
			vi.unstubAllGlobals();
		});

		it("returns false when no cache=off param", () => {
			vi.stubGlobal("location", { ...originalLocation, search: "" });
			expect(isCacheDisabled()).toBe(false);
		});

		it("returns true when ?cache=off is present", () => {
			vi.stubGlobal("location", { ...originalLocation, search: "?cache=off" });
			expect(isCacheDisabled()).toBe(true);
		});
	});
});
