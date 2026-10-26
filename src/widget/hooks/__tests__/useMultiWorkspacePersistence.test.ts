import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMultiWorkspacePersistence, type MultiWorkspacePersistenceDeps } from "../useMultiWorkspacePersistence";

vi.mock("../../workspace/WorkspaceManager", () => ({
	WorkspaceManager: {
		save: vi.fn(async () => {}),
		addToIndex: vi.fn(async () => {}),
		load: vi.fn(async () => null),
	},
}));

import { WorkspaceManager } from "../../workspace/WorkspaceManager";

const saveMock = WorkspaceManager.save as unknown as ReturnType<typeof vi.fn>;
const loadMock = WorkspaceManager.load as unknown as ReturnType<typeof vi.fn>;

function makeDeps(overrides: Record<string, unknown> = {}) {
	const chartHandles = new Map<string, any>([
		["c1", {
			getDrawings: () => [{ id: "d1" }],
			getSymbolLinkGroup: () => "A",
			importDrawings: vi.fn(),
			setSymbolLinkGroup: vi.fn(),
		}],
	]);
	return {
		layout: { rows: 1, cols: 1 } as never,
		charts: [{ id: "c1", symbol: "HPG", timeframe: "1D" }] as never,
		currentWorkspaceId: null,
		currentWorkspaceName: "W",
		activeChartId: "c1",
		storageAdapter: undefined,
		chartHandles: { current: chartHandles } as never,
		setLayoutState: vi.fn(),
		setChartsState: vi.fn(),
		setCurrentWorkspaceId: vi.fn(),
		setCurrentWorkspaceName: vi.fn(),
		setActiveChartId: vi.fn(),
		...overrides,
	} as unknown as MultiWorkspacePersistenceDeps & {
		setLayoutState: ReturnType<typeof vi.fn>;
		setChartsState: ReturnType<typeof vi.fn>;
		setCurrentWorkspaceId: ReturnType<typeof vi.fn>;
		setCurrentWorkspaceName: ReturnType<typeof vi.fn>;
		setActiveChartId: ReturnType<typeof vi.fn>;
		chartHandles: { current: Map<string, any> };
	};
}

describe("useMultiWorkspacePersistence (D0 split)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		loadMock.mockResolvedValue(null);
	});

	it("saveWorkspace collects drawings + sync groups with version 3", async () => {
		const deps = makeDeps();
		const { result } = renderHook(() => useMultiWorkspacePersistence(deps));
		await act(async () => {
			await result.current.saveWorkspace("ws1");
		});
		expect(saveMock).toHaveBeenCalledTimes(1);
		const state = saveMock.mock.calls[0][0];
		expect(state.id).toBe("ws1");
		expect(state.version).toBe(3);
		expect(state.drawings).toHaveLength(1);
		expect(state.syncGroups).toEqual([{ groupId: "A", chartIds: ["c1"], symbol: "HPG" }]);
	});

	it("loadWorkspace restores layout/charts/drawings/groups/active chart", async () => {
		const deps = makeDeps();
		loadMock.mockResolvedValue({
			layout: { rows: 1, cols: 2 },
			charts: [{ id: "c1", symbol: "HPG", timeframe: "1D" }],
			drawings: [{ id: "d1", symbol: "HPG", timeframe: "1D" }],
			syncGroups: [{ groupId: "A", chartIds: ["c1"] }],
			activeChartId: "c1",
			name: "Restored",
		});
		const { result } = renderHook(() => useMultiWorkspacePersistence(deps));
		await act(async () => {
			await result.current.loadWorkspace("ws1");
		});
		expect(deps.setLayoutState).toHaveBeenCalledWith({ rows: 1, cols: 2 });
		expect(deps.setChartsState).toHaveBeenCalled();
		expect(deps.setCurrentWorkspaceId).toHaveBeenCalledWith("ws1");
		expect(deps.setCurrentWorkspaceName).toHaveBeenCalledWith("Restored");
		expect(deps.setActiveChartId).toHaveBeenCalledWith("c1");
		const handle = (deps.chartHandles as unknown as { current: Map<string, any> }).current.get("c1");
		expect(handle.importDrawings).toHaveBeenCalled();
		expect(handle.setSymbolLinkGroup).toHaveBeenCalledWith("A");
	});

	it("loadWorkspace no-ops when storage returns null", async () => {
		const deps = makeDeps();
		const { result } = renderHook(() => useMultiWorkspacePersistence(deps));
		await act(async () => {
			await result.current.loadWorkspace("missing");
		});
		expect(deps.setLayoutState).not.toHaveBeenCalled();
		expect(deps.setCurrentWorkspaceId).not.toHaveBeenCalled();
	});
});
