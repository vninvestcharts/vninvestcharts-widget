import { useEffect, useRef, useState } from "react";
import {
	emitReplayEvent,
	onAnyReplayEvent,
	parseReplayTimeframeToMinutes,
	type ReplayBusEvent,
	type ReplaySeekEvent,
} from "../../lib/core/replay/ReplayEventBus";
import type { WidgetChartHandle } from "../utils/widgetHelpers";

export interface MultiChartReplaySyncOptions {
  chartHandles: ReadonlyMap<string, WidgetChartHandle>;
  charts: ReadonlyArray<{ id: string; timeframe: string }>;
  instanceId?: string;
  enabled?: boolean;
  /** R1-a: 'all' (default) = slaves follow; 'single' = each chart replays alone. */
  mode?: "single" | "all";
  /** F-11: called exactly once per actual master change (not per heartbeat), incl. reset to null. */
  onMasterChange?: (masterId: string | null) => void;
}

export interface MultiChartReplaySyncResult {
  masterChartId: string | null;
  slaveChartIds: string[];
  heartbeat: number;
}

const HEARTBEAT_MS = 300;
// R3.1 NOTE: per-bar seeks broadcast directly from each chart's controller tick
// (useReplayState onTick) — slaves follow in the same frame. The 300ms heartbeat
// remains only for master election + header state refresh.

export function electMaster(
	activeStates: Map<string, { tfMinutes: number; currentBar: number; totalBars: number; barTimestamp?: number }>,
): string | null {
	let bestId: string | null = null;
	let bestMinutes = Infinity;
	let bestBar = -1;
	for (const [id, { tfMinutes, currentBar }] of activeStates) {
		// Ưu tiên tf nhỏ nhất; cùng tf thì ưu tiên currentBar THẤP NHẤT
		// (chart bắt đầu replay từ đầu là master, tránh chart ở cuối kéo ngược).
		if (tfMinutes < bestMinutes || (tfMinutes === bestMinutes && currentBar < bestBar)) {
			bestMinutes = tfMinutes;
			bestBar = currentBar;
			bestId = id;
		}
	}
	return bestId;
}

export function replayActive(state: { currentBar: number; totalBars: number; playing: boolean; sessionActive?: boolean }): boolean {
	if (state.sessionActive !== undefined) return state.sessionActive;
	return state.playing || state.currentBar < state.totalBars - 1;
}

function getTfMinutesMap(charts: ReadonlyArray<{ id: string; timeframe: string }>): Map<string, number> {
	const map = new Map<string, number>();
	for (const c of charts) {
		map.set(c.id, parseReplayTimeframeToMinutes(c.timeframe));
	}
	return map;
}

export function useMultiChartReplaySync(
	options: MultiChartReplaySyncOptions,
): MultiChartReplaySyncResult {
	const { chartHandles, charts, instanceId = "mc-1", enabled = true, mode = "all", onMasterChange } = options;

	const chartsRef = useRef(charts);
	chartsRef.current = charts;

	const enabledRef = useRef(enabled);
	enabledRef.current = enabled;

	// R1-a: single mode — slaves never follow (not even forceBroadcast).
	const modeRef = useRef(mode);
	modeRef.current = mode;

	// F-12: keep instanceId in a ref so closures (interval + slave listener) always
	// namespace emits/subscribes with the current instance id.
	const instanceIdRef = useRef(instanceId);
	instanceIdRef.current = instanceId;

	const onMasterChangeRef = useRef(onMasterChange);
	onMasterChangeRef.current = onMasterChange;

	const [masterChartId, setMasterChartId] = useState<string | null>(null);
	const [heartbeat, setHeartbeat] = useState(0);

	const prevMasterRef = useRef<string | null>(null);
	// F-11: last master we notified via onMasterChange. Separate from prevMasterRef
	// (which is cleared by interval-effect cleanup on re-run) so we only fire on a
	// genuine master transition, never a spurious re-fire after effect re-mount.
	const notifiedMasterRef = useRef<string | null>(null);

	const notifyMasterChange = (masterId: string | null) => {
		if (notifiedMasterRef.current === masterId) return;
		notifiedMasterRef.current = masterId;
		onMasterChangeRef.current?.(masterId);
	};

	// Reset state when replay sync is toggled off.
	// No REPLAY_END emit here — no consumer in widget currently handles it; emit was dead code.
	useEffect(() => {
		if (enabled) return;
		const anySession = [...chartHandles].some(([, handle]) => {
			const state = handle.getReplayState?.();
			return state ? replayActive(state) : false;
		});
		if (anySession) return;
		const hadMaster = prevMasterRef.current !== null;
		prevMasterRef.current = null;
		setMasterChartId(null);
		setHeartbeat(h => h + 1);
		if (hadMaster) notifyMasterChange(null);
	}, [enabled, chartHandles]);

	useEffect(() => {
		const tfMinMap = getTfMinutesMap(charts);

		const id = setInterval(() => {
			// Always tick heartbeat so parent re-renders and picks up fresh
			// header replay state (playing, currentBar, awaitingStartBar) from
			// chart handles regardless of sync toggle.
			setHeartbeat(h => h + 1);
			if (!enabledRef.current) return;

			const activeStates = new Map<string, { tfMinutes: number; currentBar: number; totalBars: number; barTimestamp?: number; playing: boolean; sessionActive?: boolean }>();

			for (const [chartId, handle] of chartHandles) {
				const state = handle.getReplayState?.();
				if (!state) continue;
				if (state.totalBars === 0 && state.sessionActive !== true) continue;
				const tfMinutes = tfMinMap.get(chartId);
				if (tfMinutes == null) continue;
				activeStates.set(chartId, {
					tfMinutes,
					currentBar: state.currentBar,
					totalBars: state.totalBars,
					barTimestamp: state.currentBarTimestamp,
					playing: state.playing,
					sessionActive: state.sessionActive,
				});
			}

			const candidates = new Map([...activeStates].filter(([, state]) => replayActive(state)));
			const anyActive = candidates.size > 0;
			const awaitingStartBar = !anyActive && [...chartHandles].some(([, h]) => h.getReplayAwaitingStartBar?.());

			if (!anyActive) {
				if (prevMasterRef.current) {
					// F-S6: REPLAY_END emit removed — no consumer handles this event.
				}
				notifyMasterChange(null);
				prevMasterRef.current = null;
				setMasterChartId(null);
				if (awaitingStartBar) {
					setHeartbeat(h => h + 1);
				}
				return;
			}

			// Prefer playing chart as master: a chart being actively played should
			// be authoritative over any non-playing chart (which is at the end and
			// has highest currentBar, biasing electMaster away from the playing chart).
			let masterId = electMaster(
				new Map([...candidates].filter(([, s]) => s.playing)),
			);
			if (!masterId && prevMasterRef.current && candidates.get(prevMasterRef.current)?.sessionActive === true) {
				// A6: a paused-but-active session keeps its master instead of
				// re-electing by timeframe/currentBar on every heartbeat.
				masterId = prevMasterRef.current;
			}
			if (!masterId) {
				masterId = electMaster(candidates);
			}
			if (!masterId) {
				setMasterChartId(null);
				setHeartbeat(h => h + 1);
				return;
			}

			const masterInfo = activeStates.get(masterId)!;

			// Master changed
			if (prevMasterRef.current !== masterId) {
				prevMasterRef.current = masterId;
				notifyMasterChange(masterId);
				emitReplayEvent({
					type: "MASTER_ANNOUNCE",
					chartId: masterId,
					timestamp: Date.now(),
					tf: charts.find(c => c.id === masterId)?.timeframe ?? "1D",
					barIndex: masterInfo.currentBar,
				}, instanceIdRef.current);
			}

			// R3.1: per-bar seeks arrive via controller-tick broadcast
			// (useReplayState onTick) — the heartbeat no longer emits seeks.

			setMasterChartId(masterId);
			setHeartbeat(h => h + 1);
		}, HEARTBEAT_MS);

		return () => {
			clearInterval(id);
			const prev = prevMasterRef.current;
			const prevState = prev ? chartHandles.get(prev)?.getReplayState?.() : undefined;
			const anyPlaying = [...chartHandles].some(([, handle]) => handle.getReplayState?.()?.playing === true);
			const keepMaster =
				enabledRef.current &&
				prev != null &&
				prevState?.sessionActive === true &&
				!anyPlaying &&
				modeRef.current === mode;
			if (!keepMaster) prevMasterRef.current = null;
			// F-S5 intentionally does NOT clear notifiedMasterRef here. This prevents
			// onMasterChange from spuriously re-firing when the effect remounts with the
			// same master (e.g., charts prop shallow-equal change). The ref retains the
			// last notified master across re-runs so notifyMasterChange() short-circuits.
		};
	}, [enabled, chartHandles, charts, instanceId]);

	// Slaves: subscribe to master's seek events and sync
	useEffect(() => {
		const handleEvent = (event: ReplayBusEvent) => {
			if (!enabledRef.current) return;
			if (modeRef.current === "single") return;
			if (event.type !== "REPLAY_SEEK" && event.type !== "REPLAY_START") return;
			const forceBroadcast = event.forceBroadcast === true;
			// R1-c: REPLAY_START carries its own source (the chart that pressed
			// play); start-kind events also align cameras, ticks move cursors only.
			const isStartKind = event.type === "REPLAY_START" || forceBroadcast;
			const sourceId = event.type === "REPLAY_START" || forceBroadcast ? event.chartId : prevMasterRef.current;
			if (!sourceId) return;
			if (event.type === "REPLAY_SEEK" && !forceBroadcast && event.chartId !== prevMasterRef.current) return;

			const masterDate = event.type === "REPLAY_START"
				? event.startTimestamp
				: "currentBarDate" in event ? (event as ReplaySeekEvent).currentBarDate as number : undefined;
			const tfMinMap = getTfMinutesMap(chartsRef.current);

			for (const [chartId, handle] of chartHandles) {
				if (chartId === sourceId) continue;
				const state = handle.getReplayState?.();
				// F-S3: Slaves that are PLAYING are skipped — intentional to avoid interrupting
				// a user who manually started playback on a non-active chart. The side effect is
				// visual desync (diverges from master). No correctness risk: only the active chart
				// feeds the order book (VNInvestCharts.tsx:555), so no double-fill.
				if (!state || state.totalBars === 0 || state.playing) continue;

				const chartTf = tfMinMap.get(chartId) ?? Infinity;
				const masterTf = tfMinMap.get(sourceId) ?? Infinity;

				if (masterDate != null) {
					// Dùng timestamp cho mọi tf (chính xác, đồng bộ cross-timeframe).
					handle.replaySeekByTimestamp?.(masterDate);
				} else if (chartTf === masterTf && event.type === "REPLAY_SEEK" && "barIndex" in event) {
					handle.replaySeek?.((event as any).barIndex); // ARC-1-keep: legacy bridge
				} else {
					continue;
				}
				if (isStartKind && masterDate != null) {
					// Start-line camera alignment via the F1 anchor path
					// (time-gated there — Time off means cursor-only follow).
					handle.setTimeAnchor?.({ timestamp: masterDate }, sourceId);
				}
			}
		};

		const unsub = onAnyReplayEvent(handleEvent, instanceId);
		return unsub;
	}, [chartHandles, instanceId]);

	const slaveChartIds = masterChartId
		? charts.filter(c => c.id !== masterChartId).map(c => c.id)
		: [];

	return { masterChartId, slaveChartIds, heartbeat };
}
