import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
	useWorkspacePaperVisibility,
	WorkspacePaperVisibilityProvider,
	useOptionalWorkspacePaperVisibility,
} from "../WorkspacePaperVisibilityContext";

// Task M4: workspace visibility — master/perChart/clear + persist + optional null.

function Harness(props: { workspaceId?: string }) {
	const visibility = useWorkspacePaperVisibility({
		workspaceId: props.workspaceId,
		charts: [
			{ id: "chart-a", symbol: "FPT" },
			{ id: "chart-b", symbol: "VNM" },
		],
	});
	return (
		<WorkspacePaperVisibilityProvider value={visibility}>
			<div data-testid="master">{String(visibility.master)}</div>
			<div data-testid="perchart">{JSON.stringify(visibility.perChart)}</div>
			<button data-testid="set-master-off" onClick={() => visibility.setMaster(false)} />
			<button data-testid="hide-a" onClick={() => visibility.setChart("chart-a", false)} />
			<button data-testid="clear-a" onClick={() => visibility.clearChart("chart-a")} />
		</WorkspacePaperVisibilityProvider>
	);
}

function OptionalProbe() {
	const visibility = useOptionalWorkspacePaperVisibility();
	return <div data-testid="optional">{visibility === null ? "null" : "present"}</div>;
}

describe("WorkspacePaperVisibility", () => {
	it("không provider -> optional null (single-chart legacy)", () => {
		render(<OptionalProbe />);
		expect(screen.getByTestId("optional").textContent).toBe("null");
	});

	it("mặc định master bật, perChart rỗng", () => {
		window.localStorage.removeItem("vnsc_paper_visibility_ws-test");
		render(<Harness workspaceId="ws-test" />);
		expect(screen.getByTestId("master").textContent).toBe("true");
		expect(screen.getByTestId("perchart").textContent).toBe("{}");
	});

	it("setChart + clearChart (prune khi gỡ chart)", () => {
		window.localStorage.removeItem("vnsc_paper_visibility_ws-test");
		render(<Harness workspaceId="ws-test" />);
		fireEvent.click(screen.getByTestId("hide-a"));
		expect(screen.getByTestId("perchart").textContent).toBe('{"chart-a":false}');
		fireEvent.click(screen.getByTestId("clear-a"));
		expect(screen.getByTestId("perchart").textContent).toBe("{}");
	});

	it("persist workspace-scoped, reload đọc lại", () => {
		window.localStorage.removeItem("vnsc_paper_visibility_ws-test");
		const first = render(<Harness workspaceId="ws-test" />);
		fireEvent.click(screen.getByTestId("set-master-off"));
		fireEvent.click(screen.getByTestId("hide-a"));
		first.unmount();
		render(<Harness workspaceId="ws-test" />);
		expect(screen.getByTestId("master").textContent).toBe("false");
		expect(screen.getByTestId("perchart").textContent).toBe('{"chart-a":false}');
		window.localStorage.removeItem("vnsc_paper_visibility_ws-test");
	});

	it("charts list đi kèm để tab settings render theo symbol", () => {
		window.localStorage.removeItem("vnsc_paper_visibility_ws-test");
		function ChartsProbe() {
			const visibility = useWorkspacePaperVisibility({
				workspaceId: "ws-test",
				charts: [{ id: "chart-a", symbol: "FPT" }],
			});
			return <div data-testid="charts">{JSON.stringify(visibility.charts)}</div>;
		}
		render(<ChartsProbe />);
		expect(screen.getByTestId("charts").textContent).toBe('[{"id":"chart-a","symbol":"FPT"}]');
		window.localStorage.removeItem("vnsc_paper_visibility_ws-test");
	});
});
