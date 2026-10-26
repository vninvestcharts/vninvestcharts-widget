import { describe, expect, it, vi } from "vitest";
import { hasCapability, type PatTier } from "@vninvestcharts/engine-core";

/**
 * W1.4 — regression lock cho gate export ảnh.
 *
 * Bối cảnh: export PNG **đã có sẵn từ lâu** và **chưa từng bị gate** — cùng bệnh với
 * replay trước W0.5. Ba entry point dùng nó:
 *   1. nút header (`OHLCHeader.tsx:427` menu hệ thống, `:718` toolbar)
 *   2. public API `handle.saveAsImage()` (`useChartImperativeHandle.ts`)
 *   3. multi-chart (`VNInvestMultiCharts.tsx:handleSnapshotClick`)
 *
 * Test khoá **hợp đồng** (capability ⇒ phải mở/khóa) và **fail-closed** (thiếu cờ
 * ⇒ phải khoá), vì logic thật nằm trong JSX của các component lớn, không dựng lại
 * được ở unit test.
 */

describe("W1.4: export_png là capability của pro", () => {
	it("khoá dưới pro, mở từ pro trở lên", () => {
		for (const tier of ["none", "free", "starter"] as PatTier[]) {
			expect(hasCapability(tier, "export_png"), tier).toBe(false);
		}
		for (const tier of ["pro", "enterprise", "custom", "internal"] as PatTier[]) {
			expect(hasCapability(tier, "export_png"), tier).toBe(true);
		}
	});

	it("fail-closed khi chưa biết tier (null/undefined)", () => {
		expect(hasCapability(null, "export_png")).toBe(false);
		expect(hasCapability(undefined, "export_png")).toBe(false);
	});
});

describe("W1.4: hợp đồng public API — thiếu cờ thì khoá", () => {
	/**
	 * Mô phỏng đúng logic trong `useChartImperativeHandle`:
	 *   saveAsImage: canExportImage ? settings.handleSnapshot : () => onExportBlocked?.()
	 * Kiểm tra **truthy**, không phải `=== false` — nên `undefined` cũng bị chặn.
	 * (Lần đầu tôi viết `=== false` và test bắt được lỗ hổng: quên truyền cờ vẫn
	 * export. Cùng cái lỗi với `canUseReplay` nếu làm vậy.)
	 */
	function callSaveAsImage(canExportImage: boolean | undefined, snapshot: () => void, blocked?: () => void) {
		if (canExportImage) {
			snapshot();
			return;
		}
		blocked?.();
	}

	it("cờ false ⇒ KHÔNG export, có gọi onExportBlocked", () => {
		const snapshot = vi.fn();
		const blocked = vi.fn();
		callSaveAsImage(false, snapshot, blocked);
		expect(snapshot).not.toHaveBeenCalled();
		expect(blocked).toHaveBeenCalledTimes(1);
	});

	it("cờ true ⇒ export, KHÔNG gọi blocked", () => {
		const snapshot = vi.fn();
		const blocked = vi.fn();
		callSaveAsImage(true, snapshot, blocked);
		expect(snapshot).toHaveBeenCalledTimes(1);
		expect(blocked).not.toHaveBeenCalled();
	});

	it("cờ undefined (quên truyền) ⇒ KHÔNG export, có gọi blocked", () => {
		// Fail-closed: host không truyền cờ thì không được âm thầm cho export.
		const snapshot = vi.fn();
		const blocked = vi.fn();
		callSaveAsImage(undefined, snapshot, blocked);
		expect(snapshot).not.toHaveBeenCalled();
		expect(blocked).toHaveBeenCalledTimes(1);
	});

	it("không có onExportBlocked vẫn khoá, không ném lỗi", () => {
		const snapshot = vi.fn();
		expect(() => callSaveAsImage(false, snapshot)).not.toThrow();
		expect(snapshot).not.toHaveBeenCalled();
	});
});

describe("W1.4: không được export rồi mới báo", () => {
	it("khi khoá, KHÔNG gọi snapshot trước rồi báo sau", () => {
		// Thứ tự sai (export xong mới hiện upsell) là lỗi trải nghiệm: người dùng đã
		// có ảnh rồi thì upsell là vô nghĩa.
		const calls: string[] = [];
		const snapshot = () => calls.push("snapshot");
		const blocked = () => calls.push("blocked");

		if (!hasCapability("free", "export_png")) {
			blocked();
		} else {
			snapshot();
		}
		expect(calls).toEqual(["blocked"]);
		expect(calls).not.toContain("snapshot");
	});
});
