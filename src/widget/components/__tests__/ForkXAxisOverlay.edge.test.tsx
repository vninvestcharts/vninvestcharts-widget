import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ForkXAxisOverlay } from "../ForkXAxisOverlay";

describe("ForkXAxisOverlay edge clamp (V-01)", () => {
	it("left-edge tick uses LeftEdge class instead of being cut", () => {
		render(
			<ForkXAxisOverlay
				ticks={[{ key: "t0", x: 10, label: "25/05" }]}
				top={0}
				isDark={true}
				width={400}
			/>,
		);
		const label = screen.getByText("25/05");
		// Hashed CSS-module names keep the original substring; the tick wrapper
		// is the label's direct parent.
		const tick = label.parentElement;
		expect(tick?.className).toMatch(/LeftEdge/);
	});

	it("right edge clamps against container width, not window", () => {
		render(
			<ForkXAxisOverlay
				ticks={[{ key: "t0", x: 370, label: "26/05" }]}
				top={0}
				isDark={true}
				width={400}
			/>,
		);
		const label = screen.getByText("26/05");
		const tick = label.parentElement;
		expect(tick?.className).toMatch(/RightEdge/);
	});
});
