// Symbol-local drawings (Slice E1 — SY-06, Q2, spec §2.3).
// TradingView parity: a drawing belongs to its symbol; sync only carries it
// between charts viewing the SAME symbol. Pure helpers, unit-tested.
import { resolvePointAnchor } from "@vninvestcharts/engine-drawing";

/** Stamp the origin symbol on an outgoing op (emit side). */
export function withDrawingSourceSymbol<T extends object>(op: T, symbol: string | undefined): T {
	return symbol ? { ...op, symbol } : op;
}

/**
 * Receive-side gate: apply only same-symbol ops.
 * Legacy ops without a symbol pass through (backward compatible).
 */
export function shouldApplyRemoteDrawing(opSymbol: unknown, localSymbol: unknown): boolean {
	if (typeof opSymbol !== "string" || opSymbol === "") return true;
	return opSymbol === localSymbol;
}

export interface SyncPointInput {
	timeMsHint?: unknown;
	xIndexFloat?: unknown;
}

/**
 * P2/D-SYNC-23: resolve a sync timestamp without `Date.now()` garbage. Anchor
 * hints win; indexed plotData second; deterministic 0 when unanchorable
 * (renders off-chart) instead of a fake "now" that collides with live bars.
 */
export function drawingPointToSyncTimestamp(
	point: SyncPointInput,
	plotData?: ReadonlyArray<{ date?: unknown }>,
): number {
	if (typeof point.timeMsHint === "number" && Number.isFinite(point.timeMsHint)) {
		return point.timeMsHint;
	}
	if (typeof point.xIndexFloat === "number" && Number.isFinite(point.xIndexFloat) && plotData) {
		const datum = plotData[Math.round(point.xIndexFloat)];
		const time = datum?.date instanceof Date ? datum.date.getTime() : undefined;
		if (typeof time === "number" && Number.isFinite(time)) return time;
	}
	return 0;
}

export interface DrawingConflictInfo {
	drawingId: string;
	winner: unknown;
	localOp?: { symbol?: unknown } | null;
	remoteOp?: { symbol?: unknown } | null;
}

// E2: notify only when the REMOTE op won (the local drawing visibly changed)
// on a slot viewing the same symbol. Legacy conflicts without a symbol notify
// on the active chart only (avoids N-slot noise for unscoped conflicts).
export function shouldNotifyDrawingConflict(
	info: DrawingConflictInfo | null | undefined,
	slotSymbol: unknown,
	isActiveSlot: boolean,
): boolean {
	if (!info || info.winner !== "remote") return false;
	const opSymbol = info.remoteOp?.symbol ?? info.localOp?.symbol ?? null;
	if (typeof opSymbol === "string" && opSymbol !== "") return opSymbol === slotSymbol;
	return isActiveSlot;
}

// E2-fix: hybrid-logical-clock stamp for outgoing ops. The engine fires its
// conflict callback on every version TIE for a known drawingId, so emitting
// `version: {}` (as done historically) turns each sequential local op
// (drag-update, delete-after-create) into a bogus "remote won" conflict —
// notified even on the chart that drew last. A strictly monotonic
// per-writer timestamp keeps sequential ops comparable (no tie, no notice)
// while true concurrent edits from different writers still tie/diverge and
// notify legitimately. Remount-safe (wall-clock based, no in-memory counter
// that could restart and silently drop ops).
export function nextDrawingOpTimestamp(lastTimestamp: number, now: number = Date.now()): number {
	if (!Number.isFinite(lastTimestamp)) return Number.isFinite(now) ? now : 0;
	if (!Number.isFinite(now)) return lastTimestamp + 1;
	return Math.max(now, lastTimestamp + 1);
}

export interface SyncDrawingPointInput {
	x?: unknown;
	y?: unknown;
	timeMsHint?: unknown;
	xIndexFloat?: unknown;
	yPrice?: unknown;
}

/**
 * Emit-side point normalization (eraser/brush/ABCD stretch fix).
 * Freehand and multi-step drafts carry bare `{x, y}` points (unix ms + price)
 * until render-path enrichment runs — but sync emit reads the raw workspace
 * points, so `drawingPointToSyncTimestamp(p, ...)` saw no `timeMsHint` and
 * emitted `timestamp: 0` for real points. Receivers then built
 * `{x: 0, timeMsHint: 0}` → `chartPointToPixel` NaN → the clip helper replaced
 * the NaN endpoint with the viewport edge: a full-width stretched line.
 * Normalizing through `resolvePointAnchor` first (which falls back to
 * `p.x > 10000` as the time hint, mirroring the local render path) keeps the
 * wire timestamp real. Genuinely unanchorable points still emit `0`
 * (off-chart by design, P2/D-SYNC-23).
 */
export function drawingPointToSyncFields(
	point: SyncDrawingPointInput,
	plotData?: ReadonlyArray<{ date?: unknown }>,
): { timestamp: number; price: number; xIndexFloat?: number; yPrice?: number } {
	const anchor = resolvePointAnchor(point as any);
	const timestamp = drawingPointToSyncTimestamp(
		{ timeMsHint: anchor.timeMsHint, xIndexFloat: anchor.xIndexFloat },
		plotData,
	);
	return {
		timestamp,
		price: anchor.yPrice ?? 0,
		xIndexFloat: anchor.xIndexFloat,
		yPrice: anchor.yPrice,
	};
}

/**
 * Receive-side point mapping (defense for the same stretch bug).
 * A `timestamp: 0` (or missing/non-finite) timestamp must stay absent —
 * fabricating `timeMsHint: 0` creates a NaN projection that the clip helper
 * stretches to the viewport edge. `xIndexFloat` passes through untouched
 * (receiver resolves it in its own index space).
 */
export function syncPointToDrawingPoint(p: {
	timestamp?: unknown;
	price?: unknown;
	xIndexFloat?: unknown;
}): { x?: number; y?: unknown; timeMsHint?: number; yPrice?: unknown; xIndexFloat?: unknown } {
	const ts = typeof p?.timestamp === "number" && Number.isFinite(p.timestamp) && p.timestamp > 0
		? p.timestamp
		: undefined;
	return { x: ts, y: p?.price, timeMsHint: ts, yPrice: p?.price, xIndexFloat: p?.xIndexFloat };
}

/* ===================================================================
 * EMIT-SIDE SERIALISATION — one mapping, one answer.
 *
 * Why this block exists: a divergence that was in the code, not a hypothetical.
 *
 * `VNInvestCharts.tsx` built THREE separate `{...}` literals from the same
 * `DrawingObject`: one for `onDrawingChange` (DrawingData[]), one for `create`
 * ops, one for `update` ops. They had already drifted. Measured 2026-10-08 in the
 * component, before this extraction:
 *
 *   | field                                                 | onDrawingChange | create | update |
 *   |---|:--:|:--:|:--:|
 *   | color/lineWidth/lineStyle/fillColor/fontSize/fontFamily | yes | yes | yes |
 *   | **opacity**                                           | **no** | **no** | **yes** |
 *
 * Visible consequence on a synced pair of charts: a drawing created at 40% opacity
 * reaches the peer at full opacity, then the FIRST edit that produces an `update`
 * op carries `opacity` — so the peer's drawing visibly changes the moment the user
 * touches it on the origin chart. No error, no warning; it reads as a render bug on
 * the peer.
 *
 * The quieter cost: every new style field had to be added in three places, and
 * omitting one drops it from sync with no signal at all. Hence one function.
 *
 * WHAT IS DELIBERATELY NOT UNIFIED
 *
 * `type` is kebab-cased for `onDrawingChange` (`TrendLine` -> `trend-line`) but
 * passed raw for create/update ops. That asymmetry predates this file and is NOT
 * touched here: ops are consumed by the engine's `syncDrawing`, and changing what
 * it receives is a behaviour change with no evidence behind it. It is now NAMED
 * (`toDrawingDataType` vs the caller's `opType`) rather than being an accident
 * inside three literals. Recorded in `13.02-technical-debt-register.md`.
 * =================================================================== */

/** Minimal shape of a synced point source, so this file stays free of chart types. */
export type SyncPlotData = ReadonlyArray<{ date?: unknown }>;

/** Minimal shape of `DrawingObject` used here; keeps the engine type out of the import graph. */
interface SyncableDrawing {
	id: string;
	type: string;
	symbol?: string;
	timeframe?: string;
	points: ReadonlyArray<SyncDrawingPointInput>;
	style?: SyncableStyle;
	label?: string;
	locked?: boolean;
	zIndex?: number;
}

interface SyncableStyle {
	stroke?: string;
	strokeWidth?: number;
	strokeDasharray?: SyncableDash;
	fill?: string;
	opacity?: number;
	fontSize?: number;
	fontFamily?: string;
}

type SyncableDash = string | number[] | undefined;

export interface SyncStyleOut {
	color?: string;
	lineWidth?: number;
	lineStyle?: string;
	fillColor?: string;
	opacity?: number;
	fontSize?: number;
	fontFamily?: string;
}

/**
 * `DrawingObject.style` -> `DrawingStyle`. THE single mapping.
 *
 * `opacity` is included, which two of the three original literals omitted — see the
 * table above. Fixing it here rather than at the three call sites is deliberate: a
 * fix applied to two of three literals is the bug, restated.
 *
 * `zIndex` is deliberately NOT copied into the style. `DrawingData` and `DrawingStyle`
 * both declare it, but the drawings path already carries it as a top-level field, and
 * populating both would create a second source of truth for one value.
 */
export function toSyncStyle(style: SyncableStyle | undefined): SyncStyleOut | undefined {
	if (!style) return undefined;
	return {
		color: style.stroke,
		lineWidth: style.strokeWidth,
		lineStyle: style.strokeDasharray as string | undefined,
		fillColor: style.fill,
		opacity: style.opacity,
		fontSize: style.fontSize,
		fontFamily: style.fontFamily,
	};
}

/** `TrendLine` -> `trend-line`. Used by `onDrawingChange` only; ops keep the raw type. */
export function toDrawingDataType(type: string): string {
	return type.replace(/([A-Z])/g, "-$1").toLowerCase().replace(/^-/, "");
}

/** Anchor-normalised points -> `{timestamp, price}`, using the rule above. */
export function toSyncPoints(
	points: ReadonlyArray<SyncDrawingPointInput>,
	plotData: SyncPlotData | undefined,
): Array<{ timestamp: number; price: number }> {
	return points.map((p) => {
		const f = drawingPointToSyncFields(p, plotData);
		return { timestamp: f.timestamp, price: f.price };
	});
}

export interface ConvertScope {
	fallbackSymbol: string | undefined;
	fallbackTimeframe: string | undefined;
	plotData: SyncPlotData | undefined;
}

export interface SyncDrawingDataOut {
	id: string;
	type: string;
	symbol: string;
	timeframe: string;
	points: Array<{ timestamp: number; price: number }>;
	style: SyncStyleOut | undefined;
	label: string | undefined;
	locked: boolean | undefined;
	zIndex: number | undefined;
}

/**
 * `DrawingObject[]` -> `DrawingData[]` for `onDrawingChange` (workspace persistence).
 *
 * Fallbacks are explicit arguments rather than closure reads. The original read
 * `localSymbol`, `props.timeframe` and `dataResult.plotData` out of the component
 * scope, which is exactly why the literal could not be tested without mounting a
 * 2 900-line component.
 */
export function convertToDrawingData(
	drawings: readonly SyncableDrawing[],
	scope: ConvertScope,
): SyncDrawingDataOut[] {
	return drawings.map((drawing) => ({
		id: drawing.id,
		type: toDrawingDataType(drawing.type),
		symbol: drawing.symbol ?? scope.fallbackSymbol ?? "",
		timeframe: drawing.timeframe ?? scope.fallbackTimeframe ?? "1m",
		points: toSyncPoints(drawing.points, scope.plotData),
		style: toSyncStyle(drawing.style),
		label: drawing.label,
		locked: drawing.locked,
		zIndex: drawing.zIndex,
	}));
}

export interface DrawingOpOut {
	id: string;
	drawingId: string;
	type: "create" | "update" | "delete" | "move-point";
	version: Record<string, number>;
	timestamp: number;
	authorId: string;
	symbol: string;
	data?: SyncDrawingDataOut & { type: string };
}

export interface BuildOpsInput {
	prev: readonly SyncableDrawing[];
	next: readonly SyncableDrawing[];
	/** Chart id; also the writer key for the per-writer monotonic clock. */
	writerKey: string;
	symbol: string;
	timeframe: string;
	plotData: SyncPlotData | undefined;
	/** From `nextDrawingOpTimestamp(lastTs)`. Passed in so the clock stays in the component. */
	now: number;
	/** Raw type for ops — deliberately NOT kebab-cased. See the header note. */
	opType: (drawing: SyncableDrawing) => string;
}

/**
 * Diff two drawing sets into CRDT operations. Pure: same two arrays in, same
 * operations out.
 *
 * Ordering create -> delete -> update is load-bearing: a delete must never win over a
 * create for the same id, and an update must not be emitted for a drawing that only
 * just appeared in `next` (it has no `prev` to diff against).
 *
 * The per-writer clock is NOT applied here — it lives in the component, which owns the
 * ref, and this function is handed the timestamp to use. A pure diff is testable; a
 * closure that mutates a ref is not, and this rule set is where a real CRDT bug lived.
 */
export function buildDrawingOperations(input: BuildOpsInput): DrawingOpOut[] {
	const { prev, next, writerKey, symbol, timeframe, plotData, now, opType } = input;
	const operations: DrawingOpOut[] = [];
	const version = { [writerKey]: now };
	const base = { version, timestamp: now, authorId: writerKey, symbol };

	const dataOf = (d: SyncableDrawing): DrawingOpOut["data"] => ({
		id: d.id,
		type: opType(d),
		symbol,
		timeframe,
		points: toSyncPoints(d.points, plotData),
		style: toSyncStyle(d.style),
		label: d.label,
		locked: d.locked,
		zIndex: d.zIndex,
	});

	for (const d of next) {
		if (prev.some((p) => p.id === d.id)) continue;
		operations.push({ id: `op-create-${d.id}-${now}`, drawingId: d.id, type: "create", ...base, data: dataOf(d) });
	}

	for (const d of prev) {
		if (next.some((n) => n.id === d.id)) continue;
		// Deletes carry no data — the symbol stamp in `base` is the ONLY scope signal a
		// receiver gets for cross-symbol gating and tombstone scope (P2/D-SYNC-24).
		operations.push({ id: `op-delete-${d.id}-${now}`, drawingId: d.id, type: "delete", ...base });
	}

	for (const d of next) {
		const p = prev.find((x) => x.id === d.id);
		if (!p) continue;
		const pointsChanged = JSON.stringify(d.points) !== JSON.stringify(p.points);
		const styleChanged = JSON.stringify(d.style) !== JSON.stringify(p.style);
		const labelChanged = d.label !== p.label;
		const lockedChanged = d.locked !== p.locked;
		const zIndexChanged = d.zIndex !== p.zIndex;
		if (!(pointsChanged || styleChanged || labelChanged || lockedChanged || zIndexChanged)) continue;
		operations.push({
			id: `op-update-${d.id}-${now}`,
			drawingId: d.id,
			// A point move is a distinct op type: the receiver treats it as a drag, not
			// as a full replacement.
			type: pointsChanged ? "move-point" : "update",
			...base,
			data: dataOf(d),
		});
	}

	return operations;
}
