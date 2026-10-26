import { useCallback, useEffect, useMemo, type RefObject } from "react";
import type {
	DrawingData,
	SymbolLinkGroupId,
	ChartLayout,
	SyncGroupState,
	Timeframe,
} from "@vninvestcharts/engine-react";
import type { StorageAdapter } from "@vninvestcharts/engine-react";
import type { GridLayout } from "../grid/types";
import { WorkspaceData } from "../workspace/types";
import type { MultiChartConfig, VNInvestMultiChartsProps } from "../VNInvestMultiCharts";
import type { WidgetChartHandle } from "../utils/widgetHelpers";
import { gridLayoutToChartLayout } from "../VNInvestMultiCharts";
import {
	allowsCloudWorkspace,
	resolveWorkspaceStore,
	type WorkspaceIndexEntry,
	type WorkspaceScope,
} from "../workspace/WorkspaceStore";
import type { PatTier } from "@vninvestcharts/engine-core";

/** Cấu hình phạm vi lưu trữ do host hoặc test truyền vào. */
export interface WorkspaceScopeInput {
	/** Tier hiện tại để suy ra capability `server_workspace`. */
	tier?: PatTier | null;
	/** Allowlist `caps` của license (W0.6) — cũng có thể chặn `server_workspace`. */
	licenseNarrowing?: readonly string[];
	/** Ép dùng remote (chỉ test; EP-8 chưa tới nên sẽ ném 501). */
	forceRemote?: boolean;
	/** Probe backend đã sẵn sàng chưa (W0.4 `capabilityProbe`). */
	backendReady?: boolean;
}

export interface MultiWorkspacePersistenceDeps {
	layout: ChartLayout;
	charts: MultiChartConfig[];
	currentWorkspaceId: string | null;
	currentWorkspaceName: string;
	activeChartId: string | null;
	storageAdapter: VNInvestMultiChartsProps["storageAdapter"];
	/**
	 * W0.7 — cấu hình phạm vi lưu trữ. `null`/bỏ qua = suy ra từ `tier` + `licenseNarrowing`.
	 * Xem `resolveWorkspaceStore`; chỉ sửa factory đó khi EP-8 tới.
	 */
	workspaceScope?: WorkspaceScopeInput;
	onWorkspaceSave?: (workspaceId: string) => void;
	onWorkspaceLoad?: (workspaceId: string) => void;
	chartHandles: RefObject<Map<string, WidgetChartHandle>>;
	setLayoutState: (layout: ChartLayout) => void;
	setChartsState: (charts: MultiChartConfig[]) => void;
	setCurrentWorkspaceId: (id: string | null) => void;
	setCurrentWorkspaceName: (name: string) => void;
	setActiveChartId: (id: string | null) => void;
}

export function useMultiWorkspacePersistence(deps: MultiWorkspacePersistenceDeps): {
	saveWorkspace: (wsId: string) => Promise<void>;
	loadWorkspace: (wsId: string) => Promise<void>;
	/** Đọc index workspace đã lưu (danh sách cho UI Load). Xem giải thích ở phần cài đặt. */
	listWorkspaces: () => Promise<readonly WorkspaceIndexEntry[]>;
	/**
	 * W0.7 — phạm vi lưu trữ đang hoạt động. UI dùng để hiện badge
	 * "Chỉ lưu trên thiết bị này" khi scope là "local" (EP-8 chưa tới).
	 */
	workspaceScope: WorkspaceScope;
} {
	const {
		layout, charts, currentWorkspaceName, activeChartId, storageAdapter,
		onWorkspaceSave, chartHandles, workspaceScope: scopeInput,
	} = deps;

	// W0.7: mọi lần đọc/ghi đi qua store, không gọi WorkspaceManager trực tiếp nữa.
	// Đổi local -> cloud khi EP-8 tới = sửa `resolveWorkspaceStore`, không sửa chỗ này.
	const scopeAllowsCloud = allowsCloudWorkspace(
		scopeInput?.tier ?? null,
		scopeInput?.licenseNarrowing,
	);
	const store = useMemo(
		() => resolveWorkspaceStore({
			allowsCloud: scopeAllowsCloud,
			// Không có capability + không có backend ⇒ local, KHÔNG ném 501 (xem
			// `resolveWorkspaceStore`: khách enterprise mất sạch tính năng lưu nếu throw).
			backendReady: scopeInput?.backendReady,
			storageAdapter: storageAdapter ?? null,
			forceRemote: scopeInput?.forceRemote,
		}),
		[scopeAllowsCloud, storageAdapter, scopeInput?.backendReady, scopeInput?.forceRemote],
	);

	const saveWorkspace = useCallback(async (wsId: string) => {
		// Collect drawings from all charts
		const allDrawings: DrawingData[] = [];
		const allSyncGroups: SyncGroupState[] = [];

		chartHandles.current.forEach((handle, chartId) => {
			const drawings = handle.getDrawings?.() || [];
			allDrawings.push(...drawings);

			const groupId = handle.getSymbolLinkGroup?.();
			if (groupId) {
				const existingGroup = allSyncGroups.find(g => g.groupId === groupId);
				if (existingGroup) {
					if (!existingGroup.chartIds.includes(chartId)) {
						existingGroup.chartIds.push(chartId);
					}
				} else {
					const chartConfig = charts.find(c => c.id === chartId);
					if (chartConfig) {
						allSyncGroups.push({
							groupId,
							chartIds: [chartId],
							symbol: chartConfig.symbol,
						});
					}
				}
			}
		});

		const gridLayout: GridLayout = {
			rows: layout.rows, cols: layout.cols,
			slots: (layout.slots ?? charts.map((c, i) => ({ id: c.id, rowStart: Math.floor(i / layout.cols) + 1, rowEnd: Math.floor(i / layout.cols) + 1, colStart: (i % layout.cols) + 1, colEnd: (i % layout.cols) + 1, symbol: c.symbol, timeframe: c.timeframe, symbolLinkGroup: c.symbolLinkGroup }))).map((s) => ({ ...s, symbolLinkGroup: s.symbolLinkGroup as SymbolLinkGroupId | null | undefined })),
			rowSizes: layout.rowSizes ?? Array(layout.rows).fill('1fr'), colSizes: layout.colSizes ?? Array(layout.cols).fill('1fr'),
			templateAreas: layout.templateAreas,
			areas: layout.areas ? Object.fromEntries(
				Object.entries(layout.areas).map(([key, value]) => [
					key,
					{
						...value,
						id: value.chartId,
						rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 1
					}
				])
			) : undefined,
		};

		const workspaceState: WorkspaceData = {
			id: wsId,
			name: currentWorkspaceName,
			layout: gridLayout,
			charts: charts.map((c) => ({
				id: c.id,
				symbol: c.symbol,
				timeframe: c.timeframe as Timeframe,
				visibleRange: c.visibleRange,
				symbolLinkGroup: c.symbolLinkGroup,
				engineState: c.engineState,
			})),
			drawings: allDrawings,
			syncGroups: allSyncGroups,
			activeChartId: activeChartId,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			version: 3,
		};

		// W0.7: `storageAdapter` đã được đưa vào store lúc tạo (useMemo ở trên),
		// nên không cần dựng adapter ở đây nữa.
		await store.save(workspaceState);
		onWorkspaceSave?.(wsId);
	}, [layout, charts, currentWorkspaceName, store, onWorkspaceSave, chartHandles, activeChartId]);

	const loadWorkspace = useCallback(async (wsId: string) => {
		const workspaceState = await store.load(wsId);
		if (!workspaceState) return;

		// Restore full GridLayout (backward compat: v1/v2 only had { rows, cols })
		const wl = workspaceState.layout;
		const chartLayout = (wl.templateAreas || wl.slots)
			? gridLayoutToChartLayout(wl)
			: { rows: wl.rows, cols: wl.cols } as ChartLayout;
		deps.setLayoutState(chartLayout);
		deps.setChartsState(workspaceState.charts.map(c => ({
			id: c.id,
			symbol: c.symbol,
			timeframe: c.timeframe,
			visibleRange: c.visibleRange ? {
				timeRange: { from: c.visibleRange.timeRange.from, to: c.visibleRange.timeRange.to },
				priceRange: { min: 0, max: 0 },
				timeframe: c.timeframe as Timeframe,
			} : undefined,
			symbolLinkGroup: c.symbolLinkGroup,
			engineState: c.engineState,
		})));

		// Restore drawings to charts
		deps.chartHandles.current.forEach((handle, chartId) => {
			const chartDrawings = workspaceState.drawings.filter(d => {
				const chartConfig = workspaceState.charts.find(c => c.id === chartId);
				return chartConfig && d.symbol === chartConfig.symbol && d.timeframe === chartConfig.timeframe;
			});
			if (chartDrawings.length > 0) {
				handle.importDrawings?.(chartDrawings);
			}
		});

		// Restore sync groups
		workspaceState.syncGroups.forEach(group => {
			group.chartIds.forEach(chartId => {
				const handle = deps.chartHandles.current.get(chartId);
				if (handle) {
					handle.setSymbolLinkGroup?.(group.groupId);
				}
			});
		});

		// Restore active chart
		if (workspaceState.activeChartId && deps.charts.some(c => c.id === workspaceState.activeChartId)) {
			deps.setActiveChartId(workspaceState.activeChartId);
		}

		deps.setCurrentWorkspaceId(wsId);
		deps.setCurrentWorkspaceName(workspaceState.name);
		deps.onWorkspaceLoad?.(wsId);
	}, [deps.storageAdapter, deps.onWorkspaceLoad, deps.chartHandles, deps.charts, deps.setLayoutState, deps.setChartsState, deps.setCurrentWorkspaceId, deps.setCurrentWorkspaceName, deps.setActiveChartId]);

	useEffect(() => {
		if (!deps.currentWorkspaceId) return;
		const t = setTimeout(() => saveWorkspace(deps.currentWorkspaceId as string), 2000);
		return () => clearTimeout(t);
	}, [layout, charts, deps.currentWorkspaceId, saveWorkspace]);

	/**
	 * Đọc index workspace đã lưu từ store.
	 *
	 * Trước đây component cha giữ state `useState([])` và **không bao giờ** đọc index từ
	 * storage ⇒ sau khi reload danh sách Load trống, dù storage còn tới 50 entry
	 * (`WorkspaceManager.ts:105`). Đây là lỗ "mất dữ liệu" theo cảm nhận người dùng dù
	 * dữ liệu vẫn còn. Store được tạo bên trong hook (`:76`) nên phải lộ ra từ đây thay vì
	 * tạo thêm store thứ hai ở component cha.
	 */
	const listWorkspaces = useCallback(async () => {
		try {
			return await store.list();
		} catch {
			// Storage hỏng / bị chặn => coi như chưa có workspace, KHÔNG crash chart.
			return [];
		}
	}, [store]);

	return { saveWorkspace, loadWorkspace, listWorkspaces, workspaceScope: store.scope };
}
