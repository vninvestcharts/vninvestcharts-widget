import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useHoldDrag } from "../useFloatingDrag";

/**
 * Regression lock — kéo bằng BẤM GIỮ trên bất kỳ đâu, nhưng bấm vẫn phải là bấm.
 *
 * Vì sao có ngưỡng cử động: nếu `preventDefault()` + `setPointerCapture()` chạy ngay ở
 * pointerdown thì pointerdown của **nút con** bị nuốt và nút chết — đó chính là bug
 * 2026-09-30 (nút expand của bar thu gọn không bấm được). Nên: chỉ chiếm pointer SAU khi
 * chuột đi quá `moveThreshold`.
 *
 * Phần này jsdom BẮT ĐƯỢC (khác với việc kéo thật, cần Playwright).
 */

const KEY = "vnsc.test.holdDrag";
const DEFAULT = { x: -72, y: 96 };

function Harness({ defaultPos = DEFAULT }: { defaultPos?: { x: number; y: number } }) {
	const api = useHoldDrag({
		storageKey: KEY,
		defaultPos,
		getBounds: () => ({ width: 1000, height: 800 }),
		getElement: () => document.querySelector("[data-surface]") as HTMLElement | null,
	});
	// Phải gắn handler vào bề mặt — nếu quên thì test xanh/vỏng mà không kiểm gì.
	return (
		<div
			data-surface
			data-testid="surface"
			onPointerDown={api.onSurfacePointerDown}
			onDoubleClick={api.onSurfaceDoubleClick}
		>
			<button data-testid="inner-btn">Mua</button>
			<input data-testid="inner-input" defaultValue="" aria-label="giá" />
			<span data-testid="pos">{`${api.pos.x},${api.pos.y}`}</span>
		</div>
	);
}

/** Render + đếm số lần `setPointerCapture` được gọi trên bề mặt. */
function setup(defaultPos?: { x: number; y: number }) {
	window.localStorage.removeItem(KEY);
	const view = render(<Harness defaultPos={defaultPos} />);
	const surface = view.getByTestId("surface");
	let captures = 0;
	surface.setPointerCapture = vi.fn(() => {
		captures++;
	}) as never;
	return { view, surface, captured: () => captures };
}

describe("useHoldDrag: bấm-giữ để kéo, bấm vẫn là bấm", () => {
	it("bấm không di chuyển ⇒ KHÔNG capture pointer (nút con vẫn click được)", () => {
		const { surface, captured } = setup();
		fireEvent.pointerDown(surface, { button: 0, clientX: 50, clientY: 50 });
		fireEvent.pointerMove(window, { clientX: 51, clientY: 50 });
		expect(captured(), "1px < ngưỡng 5px nên chưa được coi là kéo").toBe(0);
		fireEvent.pointerUp(window);
	});

	it("đi chuột trên ngưỡng ⇒ capture (bắt đầu kéo)", () => {
		const { surface, captured } = setup();
		fireEvent.pointerDown(surface, { button: 0, clientX: 100, clientY: 100 });
		fireEvent.pointerMove(window, { clientX: 260, clientY: 210 });
		expect(captured()).toBeGreaterThan(0);
		fireEvent.pointerUp(window);
	});

	it("pointerdown trên NÚT vẫn kéo được (bấm-giữ ở bất kỳ đâu); bấm thì vẫn là click", () => {
		const { view, captured } = setup();
		const btn = view.getByTestId("inner-btn");
		fireEvent.pointerDown(btn, { button: 0, clientX: 10, clientY: 10 });
		// Chỉ 1px ⇒ chưa kéo, nút nhận click bình thường.
		fireEvent.pointerMove(window, { clientX: 11, clientY: 10 });
		expect(captured(), "bấm trên nút mà chưa di chuyển thì không kéo").toBe(0);
		// Vượt ngưỡng ⇒ thành kéo, kể cả khi bắt đầu từ nút.
		fireEvent.pointerMove(window, { clientX: 300, clientY: 300 });
		expect(captured(), "bấm-giữ trên nút thì kéo được").toBeGreaterThan(0);
		fireEvent.pointerUp(window);
	});

	it("pointerdown trong ô NHẬP LIỆU ⇒ không kéo (giữ chọn văn bản)", () => {
		const { view, captured } = setup();
		const input = view.container.querySelector("input") as HTMLElement;
		fireEvent.pointerDown(input, { button: 0, clientX: 10, clientY: 10 });
		fireEvent.pointerMove(window, { clientX: 300, clientY: 300 });
		expect(captured(), "kéo trong ô nhập phải là chọn text, không phải kéo panel").toBe(0);
		fireEvent.pointerUp(window);
	});

	it("vị trí sau khi kéo được ghi vào localStorage", () => {
		const { surface } = setup();
		fireEvent.pointerDown(surface, { button: 0, clientX: 100, clientY: 100 });
		fireEvent.pointerMove(window, { clientX: 260, clientY: 210 });
		fireEvent.pointerUp(window);
		const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "null");
		expect(saved).not.toBeNull();
		expect(typeof saved.x).toBe("number");
	});

	// QUICKTRADE_PILLS R-01: nhánh `y<0` đặt sau early-return của nhánh `x<0` là dead
	// code đúng cho quadrant kép — chính quadrant của dock default mới {x:-72,y:-40}.
	// jsdom không đo được clamp-mount (rect = 0 ⇒ skip), nên bằng chứng nằm ở đường DRAG.
	it("A6: quadrant kép (x<0 ∧ y<0) kéo đúng chiều CẢ HAI trục — y không bị kéo về 0", () => {
		const { surface, view } = setup({ x: -72, y: -40 });
		expect(view.getByTestId("pos").textContent).toBe("-72,-40");
		fireEvent.pointerDown(surface, { button: 0, clientX: 500, clientY: 500 });
		// Move #1 vượt ngưỡng chỉ NEO drag tại điểm hiện tại (delta của chính event = 0).
		fireEvent.pointerMove(window, { clientX: 510, clientY: 510 });
		// Move #2 là cú kéo thật: kéo phải 40 + xuống 20 ⇒ right 72→32, bottom 40→20.
		fireEvent.pointerMove(window, { clientX: 550, clientY: 530 });
		fireEvent.pointerUp(window);
		expect(view.getByTestId("pos").textContent).toBe("-32,-20");
	});

	it("A6: bottom-anchor ở nửa TRÁI (x≥0 ∧ y<0) cũng đúng — quadrant trước đây bất khả", () => {
		const { surface, view } = setup({ x: 100, y: -40 });
		fireEvent.pointerDown(surface, { button: 0, clientX: 500, clientY: 500 });
		fireEvent.pointerMove(window, { clientX: 510, clientY: 510 });
		fireEvent.pointerMove(window, { clientX: 550, clientY: 530 });
		fireEvent.pointerUp(window);
		expect(view.getByTestId("pos").textContent).toBe("140,-20");
	});
});