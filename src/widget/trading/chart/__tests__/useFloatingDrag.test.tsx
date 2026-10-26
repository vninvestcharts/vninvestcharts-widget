import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useFloatingDrag } from "../useFloatingDrag";

// Task TVP-A0: kéo grip đổi vị trí, clamp biên, dblclick reset, persist.
const KEY = "test.paperHeader.pos";
const BOUNDS = () => ({ width: 800, height: 600 });

function Harness({ storageKey = KEY }: { storageKey?: string }) {
	const drag = useFloatingDrag({ storageKey, defaultPos: { x: 8, y: 46 }, getBounds: BOUNDS });
	return (
		<div data-testid="box" style={{ position: "absolute", left: drag.pos.x, top: drag.pos.y }}>
			<span
				data-testid="grip"
				onPointerDown={drag.onGripPointerDown}
				onDoubleClick={drag.onGripDoubleClick}
			>
				⠿
			</span>
			<span data-testid="pos">{`${drag.pos.x},${drag.pos.y}`}</span>
		</div>
	);
}

function dragBy(grip: HTMLElement, fromX: number, fromY: number, toX: number, toY: number) {
	fireEvent.pointerDown(grip, { pointerId: 1, button: 0, clientX: fromX, clientY: fromY });
	fireEvent.pointerMove(window, { pointerId: 1, clientX: toX, clientY: toY });
	fireEvent.pointerUp(window, { pointerId: 1, clientX: toX, clientY: toY });
}

describe("useFloatingDrag", () => {
	beforeEach(() => {
		window.localStorage.removeItem(KEY);
	});

	it("khởi tạo từ default khi chưa có storage", () => {
		render(<Harness />);
		expect(screen.getByTestId("pos").textContent).toBe("8,46");
	});

	it("đọc vị trí đã persist, bỏ qua JSON hỏng", () => {
		window.localStorage.setItem(KEY, JSON.stringify({ x: 100, y: 200 }));
		const { unmount } = render(<Harness />);
		expect(screen.getByTestId("pos").textContent).toBe("100,200");
		unmount();
		window.localStorage.setItem(KEY, "not-json{{{");
		render(<Harness />);
		expect(screen.getByTestId("pos").textContent).toBe("8,46");
	});

	it("kéo đổi vị trí theo delta + persist khi thả", () => {
		render(<Harness />);
		const grip = screen.getByTestId("grip");
		act(() => {
			dragBy(grip, 100, 100, 150, 180);
		});
		expect(screen.getByTestId("pos").textContent).toBe("58,126");
		expect(JSON.parse(window.localStorage.getItem(KEY) ?? "")).toEqual({ x: 58, y: 126 });
	});

	it("clamp ở biên 0 và biên container", () => {
		render(<Harness />);
		const grip = screen.getByTestId("grip");
		act(() => {
			dragBy(grip, 100, 100, -500, -500);
		});
		expect(screen.getByTestId("pos").textContent).toBe("0,0");
		act(() => {
			dragBy(grip, 0, 0, 5000, 5000);
		});
		expect(screen.getByTestId("pos").textContent).toBe("800,600");
	});

	it("double-click reset về default", () => {
		render(<Harness />);
		const grip = screen.getByTestId("grip");
		act(() => {
			dragBy(grip, 100, 100, 300, 300);
		});
		expect(screen.getByTestId("pos").textContent).not.toBe("8,46");
		fireEvent.doubleClick(grip);
		expect(screen.getByTestId("pos").textContent).toBe("8,46");
	});

	it("UI-AUDIT: negative x stays right-anchored while dragging (no jump)", () => {
		window.localStorage.setItem(KEY, JSON.stringify({ x: -72, y: 96 }));
		render(<Harness />);
		const grip = screen.getByTestId("grip");
		expect(screen.getByTestId("pos").textContent).toBe("-72,96");
		act(() => {
			// Drag 50px to the right: right offset shrinks 72 -> 22.
			dragBy(grip, 700, 100, 750, 100);
		});
		expect(screen.getByTestId("pos").textContent).toBe("-22,96");
		act(() => {
			// Drag far left: clamps at the container edge, stays negative.
			dragBy(grip, 750, 100, -2000, 100);
		});
		const [x] = screen.getByTestId("pos").textContent!.split(",").map(Number);
		expect(x).toBeLessThanOrEqual(0);
	});

	// QUICKTRADE_PILLS R-01 (G-01): quadrant kép (x<0 ∧ y<0) — nhánh y<0 đặt sau
	// early-return của nhánh x<0 là dead code đúng cho quadrant này; đây là quadrant của
	// dock default mới {x:-72,y:-40}. jsdom bỏ clamp-mount (rect=0) nên bằng chứng ở drag.
	it("QUICKTRADE_PILLS: quadrant kép kéo đúng cả hai trục, clamp trần bottom đúng dấu", () => {
		window.localStorage.setItem(KEY, JSON.stringify({ x: -72, y: -40 }));
		render(<Harness />);
		const grip = screen.getByTestId("grip");
		expect(screen.getByTestId("pos").textContent).toBe("-72,-40");
		act(() => {
			// Kéo phải 50 + xuống 20 ⇒ right 72→22, bottom 40→20 (y giữ dấu âm).
			dragBy(grip, 700, 100, 750, 120);
		});
		expect(screen.getByTestId("pos").textContent).toBe("-22,-20");
		act(() => {
			// Kéo lên quá trần: clamp ở bottom = bounds.height (600), y = -600.
			dragBy(grip, 750, 120, 750, -2000);
		});
		expect(screen.getByTestId("pos").textContent).toBe("-22,-600");
	});
});
