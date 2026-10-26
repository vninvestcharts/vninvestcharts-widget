import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const SCROLLBAR_MIN_SPAN = 10;
const OVERVIEW_SAMPLES = 160;

export interface TimeAxisScrollbarProps {
	dataLength: number;
	/** Half-open visible window in bar indices. */
	from: number;
	to: number;
	/** Close prices for the overview sparkline (any length, sampled). */
	closes: readonly number[];
	width: number;
	t: (key: string) => string;
	onWindowChange: (from: number, to: number) => void;
}

/** Clamp a window into [0, dataLength] keeping >= minSpan. Total function. */
export function clampWindow(from: number, to: number, dataLength: number, minSpan = SCROLLBAR_MIN_SPAN): { from: number; to: number } {
	if (!Number.isFinite(from) || !Number.isFinite(to) || !(dataLength > 0)) {
		return { from: 0, to: Math.max(0, dataLength) };
	}
	let nextFrom = Math.round(from);
	let nextTo = Math.round(to);
	if (nextTo - nextFrom < minSpan) {
		nextTo = nextFrom + minSpan;
	}
	if (nextFrom < 0) {
		nextTo -= nextFrom;
		nextFrom = 0;
	}
	if (nextTo > dataLength) {
		nextFrom -= nextTo - dataLength;
		nextTo = dataLength;
	}
	nextFrom = Math.max(0, nextFrom);
	if (nextTo - nextFrom < minSpan) {
		nextTo = Math.min(dataLength, nextFrom + minSpan);
	}
	return { from: nextFrom, to: nextTo };
}

function sampleCloses(closes: readonly number[], samples: number): number[] {
	if (closes.length <= samples) return [...closes];
	const step = closes.length / samples;
	const out: number[] = [];
	for (let i = 0; i < samples; i += 1) {
		out.push(closes[Math.floor(i * step)] ?? NaN);
	}
	return out;
}

type DragKind = "move" | "left" | "right";

export function TimeAxisScrollbar({ dataLength, from, to, closes, width, t, onWindowChange }: TimeAxisScrollbarProps) {
	const trackRef = useRef<HTMLDivElement>(null);
	const dragRef = useRef<{ kind: DragKind; startX: number; startFrom: number; startTo: number } | null>(null);
	const [dragging, setDragging] = useState(false);
	const windowRef = useRef({ from, to });
	windowRef.current = { from, to };
	const onWindowChangeRef = useRef(onWindowChange);
	onWindowChangeRef.current = onWindowChange;

	const sampled = useMemo(() => sampleCloses(closes, OVERVIEW_SAMPLES), [closes]);
	const path = useMemo(() => {
		const finite = sampled.filter((v) => Number.isFinite(v));
		if (finite.length < 2 || !(width > 0)) return "";
		const min = Math.min(...finite);
		const max = Math.max(...finite);
		const span = max - min || 1;
		const h = 22;
		return sampled.map((v, i) => {
			const x = (i / (sampled.length - 1)) * width;
			const y = Number.isFinite(v) ? 2 + (1 - (v - min) / span) * (h - 4) : h / 2;
			return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
		}).join(" ");
	}, [sampled, width]);

	const leftPct = dataLength > 0 ? (from / dataLength) * 100 : 0;
	const widthPct = dataLength > 0 ? Math.max(0.5, ((to - from) / dataLength) * 100) : 100;

	const pxToBars = useCallback(() => {
		const track = trackRef.current;
		const trackWidth = track?.clientWidth || width || 1;
		return dataLength / Math.max(1, trackWidth);
	}, [dataLength, width]);

	const commit = useCallback((nextFrom: number, nextTo: number) => {
		const clamped = clampWindow(nextFrom, nextTo, dataLength);
		onWindowChangeRef.current(clamped.from, clamped.to);
	}, [dataLength]);

	const beginDrag = useCallback((kind: DragKind, clientX: number) => {
		dragRef.current = { kind, startX: clientX, startFrom: windowRef.current.from, startTo: windowRef.current.to };
		setDragging(true);
	}, []);

	const handleTrackPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
		// Edge handles and the window stop propagation — reaching here = track jump.
		const track = trackRef.current;
		if (!track) return;
		const rect = track.getBoundingClientRect();
		const ratio = (event.clientX - rect.left) / Math.max(1, rect.width);
		const center = ratio * dataLength;
		const span = windowRef.current.to - windowRef.current.from;
		commit(center - span / 2, center + span / 2);
	}, [commit, dataLength]);

	useEffect(() => {
		if (!dragging) return;
		const handleMove = (event: PointerEvent) => {
			const drag = dragRef.current;
			if (!drag) return;
			const deltaBars = (event.clientX - drag.startX) * pxToBars();
			if (drag.kind === "move") {
				commit(drag.startFrom + deltaBars, drag.startTo + deltaBars);
			} else if (drag.kind === "left") {
				commit(drag.startFrom + deltaBars, drag.startTo);
			} else {
				commit(drag.startFrom, drag.startTo + deltaBars);
			}
		};
		const handleUp = () => {
			dragRef.current = null;
			setDragging(false);
		};
		window.addEventListener("pointermove", handleMove);
		window.addEventListener("pointerup", handleUp);
		window.addEventListener("pointercancel", handleUp);
		return () => {
			window.removeEventListener("pointermove", handleMove);
			window.removeEventListener("pointerup", handleUp);
			window.removeEventListener("pointercancel", handleUp);
		};
	}, [dragging, commit, pxToBars]);

	const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
		const span = windowRef.current.to - windowRef.current.from;
		const step = event.shiftKey ? Math.max(1, Math.round(span / 10)) : 1;
		if (event.key === "ArrowLeft") {
			event.preventDefault();
			commit(windowRef.current.from - step, windowRef.current.to - step);
		} else if (event.key === "ArrowRight") {
			event.preventDefault();
			commit(windowRef.current.from + step, windowRef.current.to + step);
		} else if (event.key === "Home") {
			event.preventDefault();
			commit(0, span);
		} else if (event.key === "End") {
			event.preventDefault();
			commit(dataLength - span, dataLength);
		}
	}, [commit, dataLength]);

	const percent = Math.round(((to - from) / Math.max(1, dataLength)) * 100);

	return (
		<div
			ref={trackRef}
			className="vnsc-time-scrollbar"
			data-testid="time-axis-scrollbar"
			role="presentation"
			onPointerDown={handleTrackPointerDown}
			style={{
				position: "relative",
				height: 26,
				width: "100%",
				background: "var(--vnsc-scrollbar-track, rgba(120,130,150,0.12))",
				borderTop: "1px solid var(--vnsc-border-subtle, rgba(120,130,150,0.18))",
				cursor: "pointer",
				touchAction: "none",
				userSelect: "none",
				overflow: "hidden",
			}}
		>
			{path ? (
				<svg
					width="100%"
					height="26"
					viewBox={`0 0 ${Math.max(1, width)} 26`}
					preserveAspectRatio="none"
					style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
					aria-hidden="true"
				>
					<path d={path} fill="none" stroke="var(--vnsc-accent, #2962ff)" strokeWidth="1" opacity="0.55" />
				</svg>
			) : null}
			<div
				role="slider"
				tabIndex={0}
				aria-label={t("scrollbar.windowLabel")}
				aria-valuemin={0}
				aria-valuemax={dataLength}
				aria-valuenow={Math.round(from)}
				aria-valuetext={t("scrollbar.valuePercent").replace("{percent}", String(percent))}
				data-testid="time-scrollbar-window"
				onPointerDown={(event) => {
					event.stopPropagation();
					(event.target as HTMLElement).setPointerCapture?.(event.pointerId);
					beginDrag("move", event.clientX);
				}}
				onKeyDown={handleKeyDown}
				style={{
					position: "absolute",
					top: 0,
					bottom: 0,
					left: `${leftPct}%`,
					width: `${widthPct}%`,
					background: "var(--vnsc-scrollbar-window, rgba(41,98,255,0.14))",
					borderLeft: "1px solid var(--vnsc-accent, #2962ff)",
					borderRight: "1px solid var(--vnsc-accent, #2962ff)",
					cursor: dragging ? "grabbing" : "grab",
					outline: "none",
				}}
			>
				<div
					data-testid="time-scrollbar-edge-left"
					onPointerDown={(event) => {
						event.stopPropagation();
						(event.target as HTMLElement).setPointerCapture?.(event.pointerId);
						beginDrag("left", event.clientX);
					}}
					style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize" }}
				/>
				<div
					data-testid="time-scrollbar-edge-right"
					onPointerDown={(event) => {
						event.stopPropagation();
						(event.target as HTMLElement).setPointerCapture?.(event.pointerId);
						beginDrag("right", event.clientX);
					}}
					style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize" }}
				/>
			</div>
		</div>
	);
}
