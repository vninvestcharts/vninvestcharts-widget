import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkspaceToolbar } from "../WorkspaceToolbar";

/**
 * P0 regression lock — `WorkspaceToolbar` không được là code chết.
 *
 * Trước P0: component 340L được `import` ở `VNInvestMultiCharts.tsx:38` nhưng **không
 * bao giờ render**. `showWorkspaceToolbar` thực ra điều khiển `MultiChartTopbar`, còn
 * `SystemMenu` chỉ có save/load/export/delete — thiếu autosave và lưu theo tên.
 *
 * Test này khoá hành vi của chính component: nó phải render được nút thật. Gate cấp
 * cao hơn (component cha có render nó không) nằm ở test của `VNInvestMultiCharts`.
 */
describe("P0: WorkspaceToolbar render được nút thật", () => {
	it("render nút Save workspace", () => {
		render(
			<WorkspaceToolbar
				workspaces={[]}
				onSave={async () => {}}
				onLoad={async () => {}}
			/>,
		);
		expect(screen.getByRole("button", { name: /save workspace/i })).toBeDefined();
	});

	it("render nút Load workspace", () => {
		render(
			<WorkspaceToolbar
				workspaces={[]}
				onSave={async () => {}}
				onLoad={async () => {}}
			/>,
		);
		expect(screen.getByRole("button", { name: /load workspace/i })).toBeDefined();
	});

	it("bật autoSaveEnabled thì hiện toggle Auto-save (tính năng mà SystemMenu không có)", () => {
		render(
			<WorkspaceToolbar
				workspaces={[]}
				onSave={async () => {}}
				onLoad={async () => {}}
				autoSaveEnabled={false}
				onAutoSaveToggle={() => {}}
			/>,
		);
		expect(screen.getByText(/auto-save/i)).toBeDefined();
	});
});