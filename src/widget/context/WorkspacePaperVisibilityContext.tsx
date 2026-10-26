// Task M4: workspace-level paper visibility (master + per-chart override).
// Mirror WorkspaceLiveTradingContext nhưng gộp hook+context 1 file (state nhỏ).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface PaperVisibilityChart {
	id: string;
	symbol: string;
}

export interface WorkspacePaperVisibility {
	master: boolean;
	perChart: Record<string, boolean>;
	charts: PaperVisibilityChart[];
	setMaster: (enabled: boolean) => void;
	setChart: (chartId: string, enabled: boolean) => void;
	clearChart: (chartId: string) => void;
}

const WorkspacePaperVisibilityContext = createContext<WorkspacePaperVisibility | null>(null);

/** Optional — single-chart (không provider) trả null, giữ hành vi legacy. */
export function useOptionalWorkspacePaperVisibility(): WorkspacePaperVisibility | null {
	return useContext(WorkspacePaperVisibilityContext);
}

function storageKey(workspaceId?: string): string {
	return `vnsc_paper_visibility_${workspaceId ?? "default"}`;
}

interface StoredVisibility {
	master?: boolean;
	perChart?: Record<string, boolean>;
}

function loadStored(workspaceId?: string): StoredVisibility {
	try {
		if (typeof window === "undefined" || !window.localStorage) return {};
		const raw = window.localStorage.getItem(storageKey(workspaceId));
		if (!raw) return {};
		const parsed = JSON.parse(raw) as StoredVisibility;
		return {
			master: typeof parsed.master === "boolean" ? parsed.master : undefined,
			perChart: parsed.perChart && typeof parsed.perChart === "object" ? parsed.perChart : undefined,
		};
	} catch {
		return {};
	}
}

export function useWorkspacePaperVisibility(options: {
	workspaceId?: string;
	charts: PaperVisibilityChart[];
}): WorkspacePaperVisibility {
	const { workspaceId, charts } = options;
	const [master, setMasterState] = useState<boolean>(() => loadStored(workspaceId).master ?? true);
	const [perChart, setPerChart] = useState<Record<string, boolean>>(() => loadStored(workspaceId).perChart ?? {});

	useEffect(() => {
		try {
			if (typeof window !== "undefined" && window.localStorage) {
				window.localStorage.setItem(storageKey(workspaceId), JSON.stringify({ master, perChart }));
			}
		} catch {
			// Bỏ qua khi storage bị chặn.
		}
	}, [workspaceId, master, perChart]);

	const setMaster = useCallback((enabled: boolean) => setMasterState(enabled), []);
	const setChart = useCallback((chartId: string, enabled: boolean) => {
		setPerChart((prev) => (prev[chartId] === enabled ? prev : { ...prev, [chartId]: enabled }));
	}, []);
	const clearChart = useCallback((chartId: string) => {
		setPerChart((prev) => {
			if (!(chartId in prev)) return prev;
			const next = { ...prev };
			delete next[chartId];
			return next;
		});
	}, []);

	return useMemo(
		() => ({ master, perChart, charts, setMaster, setChart, clearChart }),
		[master, perChart, charts, setMaster, setChart, clearChart],
	);
}

export function WorkspacePaperVisibilityProvider(props: {
	value: WorkspacePaperVisibility;
	children: ReactNode;
}) {
	return (
		<WorkspacePaperVisibilityContext.Provider value={props.value}>
			{props.children}
		</WorkspacePaperVisibilityContext.Provider>
	);
}
