import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDrawingAlerts } from "../useDrawingAlerts";
import type { DrawingObject } from "@vninvestcharts/engine-drawing";

/**
 * Regression lock W1.1 — đường nghiệp vụ của alert.
 *
 * Audit G.4 nêu rõ: trước W1.1 chỉ có test cho hàm thuần
 * `evaluateDrawingAlerts`; **không** có test cho `useDrawingAlertEvaluator` hay
 * `AlertNotificationToast` ⇒ toàn bộ đường chạy thật không được bảo vệ. Đây là
 * test cho đường đó.
 *
 * Trọng tâm: alert phải bắn **đúng một lần** mỗi lần cắt. Bài học hotkey
 * `8173eec` (một phím vật lý → hai lần gọi) cho thấy double-fire là lỗi có
 * thật trong codebase này, nên phải khoá.
 */

const T0 = 1_700_000_000_000;

function hLine(price: number, extra: Partial<DrawingObject> = {}): DrawingObject {
	return {
		id: "d1",
		type: "hLine",
		points: [{ x: 100, y: 500, yPrice: price }],
		style: { stroke: "#333", strokeWidth: 1 },
		createdAt: T0,
		updatedAt: T0,
		alertCondition: { enabled: true, direction: "either" },
		...extra,
	} as unknown as DrawingObject;
}

const bars = (closes: number[]) => closes.map((c) => ({ close: c }));

describe("useDrawingAlerts: bắn đúng một lần mỗi lần cắt", () => {
	it("giá cắt qua hLine ⇒ sinh đúng 1 toast", () => {
		const updateDrawing = vi.fn();
		const drawing = hLine(100);
		const { result } = renderHook(() =>
			useDrawingAlerts({
				enabled: true,
				drawings: [drawing],
				plotData: bars([99, 101]),
				updateDrawing,
			}),
		);
		expect(result.current.items).toHaveLength(1);
		expect(result.current.items[0].direction).toBe("crossAbove");
		expect(result.current.items[0].price).toBe(101);
		expect(result.current.items[0].drawingType).toBe("hLine");
	});

	it("KHÔNG bắn khi giá không cắt qua mức", () => {
		const { result } = renderHook(() =>
			useDrawingAlerts({
				enabled: true,
				drawings: [hLine(100)],
				plotData: bars([99, 99.5, 99.9]),
				updateDrawing: vi.fn(),
			}),
		);
		expect(result.current.items).toHaveLength(0);
	});

	it("giá không đổi qua nhiều render ⇒ KHÔNG bắn lại (chống double-fire)", () => {
		const updateDrawing = vi.fn();
		const plotData = bars([99, 101]);
		const drawing = hLine(100);
		const { result, rerender } = renderHook(() =>
			useDrawingAlerts({ enabled: true, drawings: [drawing], plotData, updateDrawing }),
		);
		expect(result.current.items).toHaveLength(1);
		// Re-render nhiều lần với CÙNG dữ liệu (giá không đổi) ⇒ không bắn thêm.
		rerender();
		rerender();
		rerender();
		expect(result.current.items).toHaveLength(1);
	});

	it("persist triggeredAt để cooldown sống qua re-render", () => {
		const updateDrawing = vi.fn();
		renderHook(() =>
			useDrawingAlerts({
				enabled: true,
				drawings: [hLine(100)],
				plotData: bars([99, 101]),
				updateDrawing,
			}),
		);
		expect(updateDrawing).toHaveBeenCalled();
		const patch = updateDrawing.mock.calls[0][1] as { alertCondition: { triggeredAt: number } };
		expect(patch.alertCondition.triggeredAt).toBeGreaterThan(0);
	});

	it("nhiều alert cùng lúc ⇒ tối đa 3 toast, không chắn màn hình", () => {
		const drawings = [
			hLine(100, { id: "a" }),
			hLine(102, { id: "b" }),
			hLine(104, { id: "c" }),
			hLine(106, { id: "d" }),
		];
		const { result } = renderHook(() =>
			useDrawingAlerts({
				enabled: true,
				drawings,
				plotData: bars([99, 110]),
				updateDrawing: vi.fn(),
			}),
		);
		expect(result.current.items.length).toBeLessThanOrEqual(3);
	});
});

describe("useDrawingAlerts: gate", () => {
	it("enabled=false ⇒ không bắn (Community)", () => {
		const { result } = renderHook(() =>
			useDrawingAlerts({
				enabled: false,
				drawings: [hLine(100)],
				plotData: bars([99, 101]),
				updateDrawing: vi.fn(),
			}),
		);
		expect(result.current.items).toHaveLength(0);
	});

	it("muted=true ⇒ không bắn và dọn toast đang treo", () => {
		const plotData = bars([99, 101]);
		const { result, rerender } = renderHook(
			({ muted }: { muted: boolean }) =>
				useDrawingAlerts({
					enabled: true,
					muted,
					drawings: [hLine(100)],
					plotData,
					updateDrawing: vi.fn(),
				}),
			{ initialProps: { muted: false } },
		);
		expect(result.current.items).toHaveLength(1);
		act(() => rerender({ muted: true }));
		expect(result.current.items).toHaveLength(0);
	});
});

describe("useDrawingAlerts: dữ liệu thiếu", () => {
	it("close null ⇒ không bắn, không crash", () => {
		const { result } = renderHook(() =>
			useDrawingAlerts({
				enabled: true,
				drawings: [hLine(100)],
				plotData: [{ close: null }, { close: 101 }],
				updateDrawing: vi.fn(),
			}),
		);
		expect(result.current.items).toHaveLength(0);
	});

	it("chỉ 1 nến ⇒ không đủ để xác định cắt", () => {
		const { result } = renderHook(() =>
			useDrawingAlerts({
				enabled: true,
				drawings: [hLine(100)],
				plotData: bars([101]),
				updateDrawing: vi.fn(),
			}),
		);
		expect(result.current.items).toHaveLength(0);
	});

	it("drawing không có điểm ⇒ không bắn", () => {
		const { result } = renderHook(() =>
			useDrawingAlerts({
				enabled: true,
				drawings: [hLine(100, { points: [] })],
				plotData: bars([99, 101]),
				updateDrawing: vi.fn(),
			}),
		);
		expect(result.current.items).toHaveLength(0);
	});
});

describe("useDrawingAlerts: dismiss", () => {
	it("dismiss xoá đúng toast được chọn", () => {
		const plotData = bars([99, 101]);
		const { result } = renderHook(() =>
			useDrawingAlerts({
				enabled: true,
				drawings: [hLine(100)],
				plotData,
				updateDrawing: vi.fn(),
			}),
		);
		const id = result.current.items[0].id;
		act(() => result.current.dismiss(id));
		expect(result.current.items).toHaveLength(0);
	});

	it("dismiss id không tồn tại ⇒ không nổ", () => {
		const { result } = renderHook(() =>
			useDrawingAlerts({
				enabled: true,
				drawings: [hLine(100)],
				plotData: bars([99, 101]),
				updateDrawing: vi.fn(),
			}),
		);
		act(() => result.current.dismiss("khong-ton-tai"));
		expect(result.current.items).toHaveLength(1);
	});

	it("isLocalOnly đúng khi alert đang chạy (EP-2 chưa có cloud)", () => {
		const { result } = renderHook(() =>
			useDrawingAlerts({
				enabled: true,
				drawings: [hLine(100)],
				plotData: bars([99, 101]),
				updateDrawing: vi.fn(),
			}),
		);
		expect(result.current.isLocalOnly).toBe(true);
	});
});
