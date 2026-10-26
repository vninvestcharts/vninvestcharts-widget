import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DraggableOrderHandles } from "../DraggableOrderHandles";

describe("DraggableOrderHandles", () => {
	it("handle di chuyển theo dragPrice trong lúc kéo", () => {
		const onCommit = vi.fn();
		render(
			<DraggableOrderHandles
				kind="SL"
				price={100}
				baseQuantity={100}
				accountEquity={100_000_000}
				toY={(price) => 400 - price * 2}
				toPrice={(pixelY) => (400 - pixelY) / 2}
				bounds={{ top: 0, bottom: 400 }}
				tickSize={1}
				onCommit={onCommit}
			/>,
		);
		const grip = screen.getByTestId("handle-grip-SL");
		expect(grip.style.top).toBe("200px");
		fireEvent.pointerDown(grip, { pointerId: 1, button: 0, clientX: 10, clientY: 200 });
		fireEvent.pointerMove(grip, { pointerId: 1, clientX: 10, clientY: 220 });
		expect(grip.style.top).toBe("220px");
		fireEvent.pointerUp(grip, { pointerId: 1, clientX: 10, clientY: 220 });
		expect(onCommit).toHaveBeenCalledWith(90);
	});
});
