/**
 * BLACKSCREEN-DIAG: snapshot builder for the ?vnsc_diag=1 overlay.
 *
 * BL-03B S3: moved VERBATIM out of `VNInvestCharts.tsx` (block 1586-1672) so the
 * god component stops carrying debug-only code. Behavior unchanged: same body,
 * same `useCallback` dependency list; only the source tokens were renamed to
 * hook parameters (`dataResult.X` -> param, `settings.visiblePanes` -> param).
 * `diagDocument` is injected by the caller because `no-restricted-globals`
 * forbids direct `document` access here ("Use injected adapters instead").
 */
import { useCallback, type RefObject } from "react";
import type { EngineInstance } from "@vninvestcharts/engine-core";
import type { PaneDescriptor } from "../../lib/core";
import type { ChartDiagSnapshot } from "../components/ChartDiagOverlay";

export interface UseChartDiagSnapshotParams {
	engineInstanceRef: RefObject<EngineInstance | null>;
	forkEngineInstance: EngineInstance | null;
	isForkRuntime: boolean;
	bars: readonly unknown[];
	enrichedData: readonly unknown[];
	plotData: readonly unknown[];
	dataError: unknown;
	visiblePanes: readonly PaneDescriptor[];
	chartType: string;
	effectiveToolbarTier: unknown;
	diagDocument: Document | null;
}

export function useChartDiagSnapshot({
	engineInstanceRef,
	forkEngineInstance,
	isForkRuntime,
	bars,
	enrichedData,
	plotData,
	dataError,
	visiblePanes,
	chartType,
	effectiveToolbarTier,
	diagDocument,
}: UseChartDiagSnapshotParams): () => ChartDiagSnapshot {
	return useCallback((): ChartDiagSnapshot => {
		const engine: any = engineInstanceRef.current;
		let engineRange = "n/a";
		try {
			const r = engine?.getVisibleRange?.();
			if (r) engineRange = `from=${r.from} to=${r.to}`;
		} catch {
			engineRange = "threw";
		}
		let canvases = "n/a";
		try {
			if (diagDocument) {
				const list = Array.from(diagDocument.querySelectorAll("canvas"));
				canvases = `${list.length}:` + list.map((c) => `${c.width}x${c.height}`).join(",");
			}
		} catch {
			canvases = "threw";
		}
		// DIAG-v2: engine-side domains + NaN scan (render killers invisible to React state).
		// DIAG-v3: engine paneSpecs ids (empty = specs feed never fired).
		let specs = "n/a";
		try {
			const list = ((engine as any)?.paneSpecs ?? []) as ArrayLike<any>;
			const n = (list as any)?.length ?? 0;
			const ids: string[] = [];
			for (let i = 0; i < n; i++) {
				const s = (list as any)[i];
				ids.push(`${s?.id ?? "?"}(${(s?.series ?? []).length})`);
			}
			specs = n === 0 ? "EMPTY" : ids.join(" | ");
		} catch {
			specs = "threw";
		}
		let domains = "n/a";
		let nanScan = "n/a";
		let lastBar = "n/a";
		try {
			const snapshots = engine?.getPaneSnapshots?.() ?? [];
			domains = snapshots.map((s: any) => {
				const states = s?.scaleSlotStates ?? {};
				const parts = Object.entries(states).map(([id, st]: [string, any]) => {
					const d = st?.domain;
					return `${id}=[${Array.isArray(d) ? d.map((v: any) => (typeof v === "number" ? (Number.isFinite(v) ? v.toFixed(1) : String(v)) : "?")).join(",") : "?"}]`;
				});
				return `${s?.paneId ?? "?"}:${parts.join(";")}`;
			}).join(" | ") || "empty";
		} catch {
			domains = "threw";
		}
		try {
			const ed = (engine?.enrichedData ?? engine?.dataSource?.bars ?? []) as ArrayLike<any>;
			const n = (ed as any)?.length ?? 0;
			let bad = -1;
			for (let i = 0; i < n; i++) {
				const d = (ed as any)[i];
				const o = d?.open, h = d?.high, l = d?.low, c = d?.close;
				if (!(o > -Infinity && o < Infinity && h > -Infinity && h < Infinity && l > -Infinity && l < Infinity && c > -Infinity && c < Infinity)) {
					bad = i;
					break;
				}
			}
			nanScan = bad >= 0 ? `BAD@${bad}/${n}` : `clean/${n}`;
			const last = n > 0 ? (ed as any)[n - 1] : null;
			lastBar = last ? `c=${last.close} t=${last.date instanceof Date ? last.date.toISOString() : String(last.date)}` : "empty";
		} catch {
			nanScan = "threw";
		}
		return {
			enginePresent: !!engine,
			forkEngineSet: !!forkEngineInstance,
			isForkRuntime,
			bars: bars.length,
			enriched: enrichedData.length,
			plot: plotData.length,
			panes: visiblePanes.map((p) => `${p.id}(${p.visible ? "v" : "h"}):${(p.series ?? []).map((s) => s.type).join("+")}`).join(" | "),
			chartType,
			tier: String(effectiveToolbarTier ?? "unknown"),
			dataError: String((dataError as any)?.message ?? dataError ?? "none").slice(0, 120),
			engineRange,
			canvases,
			domains,
			specs,
			nanScan,
			lastBar,
		};
	}, [bars, enrichedData, plotData, dataError, visiblePanes, chartType, effectiveToolbarTier, isForkRuntime, forkEngineInstance]);
}
