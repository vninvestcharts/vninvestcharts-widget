// @vitest-environment jsdom
// S3 (P5 parity F2): shared builders single+multi dùng chung — callbacks đấu
// đúng workspace API; empty states giữ nguyên.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { useWorkspaceDockPanels } from "../../../hooks/useWorkspaceDockPanels";
import {
	buildDockObjectsContent,
	buildDockPropertiesContent,
	buildDockTemplatesContent,
	type DrawingDockContentDeps,
} from "../drawingDockContentBuilders";

const t = (key: string) => key;

function makeDeps(drawings: Record<string, unknown>[] = [], selectedId: string | null = null) {
	const rows = drawings.length > 0 ? drawings : [
		{ id: "d1", type: "trendline", label: "L1", visible: true, locked: false, zIndex: 1 },
		{ id: "d2", type: "rect", label: "R1", visible: true, locked: false, zIndex: 2 },
	];
	const interaction = {
		allDrawings: rows,
		updateDrawing: vi.fn(),
		replaceDrawings: vi.fn(),
	};
	const textEdit = {
		isEditingText: false,
		drawingTextDraft: "",
		setDrawingTextDraft: vi.fn(),
		onStartTextEdit: vi.fn(),
		onCommitTextEdit: vi.fn(),
		onCancelTextEdit: vi.fn(),
	};
	const actions = {
		onDeleteDrawing: vi.fn(),
		onCloneSelected: vi.fn(),
		onToggleSelectedLock: vi.fn(),
		onToggleSelectedVisibility: vi.fn(),
		onBringSelectedToFront: vi.fn(),
		onSendSelectedToBack: vi.fn(),
	};
	const selected = selectedId ? (rows.find((d) => d.id === selectedId) ?? null) : null;
	const workspace = {
		state: {
			drawings: rows,
			selectedDrawing: selected,
			dock: { isOpen: false, activeTab: "objects", position: null, sizeDelta: { w: 0, h: 0 } },
		},
		selectDrawing: vi.fn(),
		setDockTab: vi.fn(),
		closeDock: vi.fn(),
		setDockLayout: vi.fn(),
		interaction,
	};
	return { deps: { workspace, selected, t, textEdit, actions } as unknown as DrawingDockContentDeps, workspace, interaction, rows };
}

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

beforeEach(() => {
	window.localStorage.clear();
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	if (root) act(() => { root?.unmount(); });
	root = null;
	container?.remove();
	container = null;
});

function renderNode(node: ReactNode) {
	act(() => { root?.render(<div>{node}</div>); });
}

describe("shared drawing dock builders (S3 SSOT)", () => {
	it("objects: null workspace -> null", () => {
		const { deps } = makeDeps();
		expect(buildDockObjectsContent({ ...deps, workspace: null })).toBeNull();
	});

	it("objects: renders one row per drawing; delete routes correctly", () => {
		const { deps, interaction } = makeDeps();
		renderNode(buildDockObjectsContent(deps));
		const deletes = container?.querySelectorAll('button[title="drawing.list.delete"]') ?? [];
		expect(deletes.length).toBe(2);
		act(() => { (deletes[0] as HTMLButtonElement)?.click(); });
		expect(interaction.replaceDrawings).toHaveBeenCalledTimes(1);
	});

	it("objects: lock toggle routes to updateDrawing", () => {
		const { deps, interaction } = makeDeps();
		renderNode(buildDockObjectsContent(deps));
		const lockBtn = container?.querySelector('button[title="drawing.list.locked"], button[title="drawing.list.unlocked"]') as HTMLButtonElement | null;
		expect(lockBtn).not.toBeNull();
		act(() => { lockBtn?.click(); });
		expect(interaction.updateDrawing).toHaveBeenCalledWith(expect.any(String), { locked: true });
	});

	it("properties: no selection -> empty state (single parity)", () => {
		const { deps } = makeDeps();
		renderNode(buildDockPropertiesContent(deps));
		expect(container?.textContent).toContain("drawing.dock.emptyProperties");
	});

	it("properties: selected drawing renders inspector", () => {
		const { deps } = makeDeps([], "d1");
		renderNode(buildDockPropertiesContent(deps));
		// Inspector label + clone/lock/delete actions có mặt (mirror single).
		expect(container?.textContent).toContain("drawing.dockProperties");
	});

	it("templates: no selection -> empty state; selected -> manager", () => {
		const { deps } = makeDeps();
		renderNode(buildDockTemplatesContent(deps));
		expect(container?.textContent).toContain("drawing.dock.emptyTemplates");
		const sel = makeDeps([], "d2");
		renderNode(buildDockTemplatesContent(sel.deps));
		expect(container?.textContent).toContain("drawing.templatesLoad");
	});
});

describe("useWorkspaceDockPanels composite (S3 full node)", () => {
	function renderBridge(chartId: string | null, workspace: unknown, revision = 0) {
		let node: ReactNode = <div data-testid="sentinel" />;
		const chartRefs = {
			current: new Map(chartId ? [[chartId, { current: { getDrawingWorkspace: () => workspace } }]] : []),
		};
		function Harness() {
			const panels = useWorkspaceDockPanels({ activeChartId: chartId, chartRefs: chartRefs as never, revision });
			node = panels.drawingDockNode;
			return <div>{panels.drawingDockNode}</div>;
		}
		act(() => { root?.render(<Harness />); });
		return node;
	}

	it("empty drawings -> null (host disables tab, W2 semantics kept)", () => {
		const { workspace } = makeDeps();
		(workspace.state as { drawings: unknown[] }).drawings = [];
		expect(renderBridge("c1", workspace)).toBeNull();
	});

	it("drawings exist -> full DrawingDock node (objects + properties + templates tabs)", () => {
		const { workspace } = makeDeps([], "d1");
		const node = renderBridge("c1", workspace);
		expect(node).not.toBeNull();
		// Tab switcher của DrawingDock (y hệt single, labels vi thật qua i18n
		// default) + list hiện drawings (labels L1/R1 từ fake workspace).
		expect(container?.textContent).toContain("Đối tượng");
		expect(container?.textContent).toContain("Thuộc tính");
		expect(container?.textContent).toContain("Mẫu");
		expect(container?.textContent).toContain("L1");
		expect(container?.textContent).toContain("R1");
	});

	it("no active chart -> null", () => {
		const { workspace } = makeDeps([], "d1");
		expect(renderBridge(null, workspace)).toBeNull();
	});
});
