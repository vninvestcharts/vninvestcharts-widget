import { useEffect, useRef, useState } from "react";
import { computeTextBoxLayout } from "@vninvestcharts/engine-core";
import type { DrawingObject } from "@vninvestcharts/engine-drawing";
import type { WidgetPaneRuntimeSnapshot } from "../../utils/widgetHelpers";
import type { EnrichedDatum } from "../../../lib/core/calculators/types";

const HANDLE_SIZE = 12;
const MIN_WIDTH = 120;
const MIN_HEIGHT = 40;
const TOOLBAR_HEIGHT = 32;

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function computePixelPosition(
	drawing: DrawingObject,
	paneSnapshots: readonly WidgetPaneRuntimeSnapshot[],
	plotData: readonly EnrichedDatum[],
	visibleDomainRef: React.MutableRefObject<[Date, Date] | null>,
): { left: number; top: number } | null {
	if (drawing.points.length === 0) return null;

	const snapshot = paneSnapshots.find((p) => p.paneId === drawing.paneId);
	if (!snapshot) return null;

	const visibleDomain = visibleDomainRef?.current;
	const timeBounds = visibleDomain
		? ([visibleDomain[0].getTime(), visibleDomain[1].getTime()] as const)
		: plotData.length > 0
			? ([plotData[0]!.date.getTime(), plotData[plotData.length - 1]!.date.getTime()] as const)
			: null;
	if (!timeBounds) {
		return { left: snapshot.plotBounds.left + 20, top: snapshot.bounds.top + 20 };
	}

	const point = drawing.points[0]!;
	const [timeStart, timeEnd] = timeBounds;
	const timeSpan = Math.max(1, timeEnd - timeStart);

	const scaleSlotId = drawing.yScaleId ?? Object.keys(snapshot.scaleSlotStates)[0];
	const scaleState = scaleSlotId ? snapshot.scaleSlotStates[scaleSlotId] : null;
	const domain = scaleState?.domain;
	if (!domain || !Number.isFinite(domain[0]) || !Number.isFinite(domain[1])) {
		return { left: snapshot.plotBounds.left + 20, top: snapshot.bounds.top + 20 };
	}

	const [minValue, maxValue] = domain;
	const valueSpan = Math.max(1e-9, maxValue - minValue);

	const visiblePlotData = visibleDomain
		? plotData.filter((d) => {
			const t = d.date.getTime();
			return t >= timeStart && t <= timeEnd;
		})
		: plotData;

	let nearestIndex = 0;
	let nearestDist = Infinity;
	for (let i = 0; i < visiblePlotData.length; i++) {
		const dist = Math.abs(visiblePlotData[i]!.date.getTime() - point.x);
		if (dist < nearestDist) { nearestDist = dist; nearestIndex = i; }
	}

	const indexSpan = Math.max(1, visiblePlotData.length - 1);
	const indexRatio = clamp(nearestIndex / indexSpan, 0, 1);
	const timeRatio = clamp((point.x - timeStart) / timeSpan, 0, 1);
	const xRatio = visiblePlotData.length > 1 ? indexRatio : timeRatio;
	const yRatio = clamp((maxValue - point.y) / valueSpan, 0, 1);

	const left = snapshot.plotBounds.left + snapshot.plotBounds.width * xRatio;
	const top = snapshot.plotBounds.top + snapshot.plotBounds.height * yRatio;

	if (!Number.isFinite(left) || !Number.isFinite(top)) {
		return { left: snapshot.plotBounds.left + 20, top: snapshot.bounds.top + 20 };
	}
	return { left, top };
}

export interface InlineTextEditorProps {
	selectedDrawing: DrawingObject | null;
	paneSnapshots: readonly WidgetPaneRuntimeSnapshot[];
	isEditingText: boolean;
	drawingTextDraft: string;
	setDrawingTextDraft: (value: string) => void;
	handleCommitTextEdit: (commitCallback: (draft: string) => void) => void;
	handleCancelTextEdit: () => void;
	handleUpdateDrawing: (id: string, patch: any) => void;
	plotData: readonly EnrichedDatum[];
	visibleDomainRef: React.MutableRefObject<[Date, Date] | null>;
	shellSize: { width: number; height: number };
}

const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32];
const FONT_FAMILIES = ["sans-serif", "serif", "monospace", "Arial", "Verdana", "Tahoma", "Georgia", "Courier New"];
const COLOR_PRESETS = [
	"#f8fafc", "#e2e8f0", "#94a3b8", "#64748b", "#475569",
	"#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
	"#3b82f6", "#8b5cf6", "#ec4899", "#be185d", "#ffffff",
];

export default function InlineTextEditor({
	selectedDrawing,
	paneSnapshots,
	isEditingText,
	drawingTextDraft,
	setDrawingTextDraft,
	handleCommitTextEdit,
	handleCancelTextEdit,
	handleUpdateDrawing,
	plotData,
	visibleDomainRef,
	shellSize,
}: InlineTextEditorProps) {
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const toolbarRef = useRef<HTMLDivElement>(null);
	const toolbarInteractionRef = useRef(false);
	const [isComposing, setIsComposing] = useState(false);
	const undoStackRef = useRef<string[]>([]);
	const lastPushRef = useRef<number>(0);

	const currentStyle = selectedDrawing?.style;
	const fontSize = currentStyle?.fontSize ?? 14;

	const autoLayout = computeTextBoxLayout(drawingTextDraft, undefined, undefined, fontSize);
	const fallbackWidth = Math.min(autoLayout.boxWidth, 400);
	const defaultBoxWidth = currentStyle?.textBoxWidth ?? Math.max(fallbackWidth, 120);
	const defaultBoxHeight = currentStyle?.textBoxHeight ?? 100;

	const [localBoxWidth, setLocalBoxWidth] = useState(defaultBoxWidth);
	const [localBoxHeight, setLocalBoxHeight] = useState(defaultBoxHeight);

	const hasExplicitWidth = currentStyle?.textBoxWidth != null;
	const hasExplicitHeight = currentStyle?.textBoxHeight != null;

	const autoH = computeTextBoxLayout(drawingTextDraft, localBoxWidth, undefined, fontSize).bgHeight;
	const effectiveHeight = hasExplicitHeight ? localBoxHeight : Math.max(autoH, MIN_HEIGHT);

	const drawBoxWidth = localBoxWidth;
	const drawBoxHeight = effectiveHeight;

	useEffect(() => {
		if (!hasExplicitWidth) {
			const newAuto = computeTextBoxLayout(drawingTextDraft, undefined, undefined, fontSize);
			setLocalBoxWidth(Math.min(newAuto.boxWidth, 400));
		}
	}, [drawingTextDraft]);

	const pixelPos = selectedDrawing
		? computePixelPosition(selectedDrawing, paneSnapshots, plotData, visibleDomainRef)
		: null;

	let left = pixelPos ? clamp(pixelPos.left, 0, Math.max(0, shellSize.width - drawBoxWidth)) : 20;
	let top = pixelPos ? clamp(pixelPos.top, 0, Math.max(0, shellSize.height - drawBoxHeight - TOOLBAR_HEIGHT)) : 20;
	if (pixelPos && top + drawBoxHeight > shellSize.height - 16) {
		top = Math.max(0, pixelPos.top - drawBoxHeight - 24);
	}
	const toolbarTop = Math.max(0, top - TOOLBAR_HEIGHT - 24);

	useEffect(() => {
		if (isEditingText && textareaRef.current) {
			textareaRef.current.focus();
			textareaRef.current.select();
		}
	}, [isEditingText]);

	if (!isEditingText || !selectedDrawing) return null;

	const patchStyle = (patch: Record<string, unknown>) => {
		handleUpdateDrawing(selectedDrawing.id, {
			style: { ...currentStyle, ...patch },
		});
	};

	const handleBlur = () => {
		if (toolbarInteractionRef.current) {
			toolbarInteractionRef.current = false;
			return;
		}
		handleCommitTextEdit((draft: string) => {
			handleUpdateDrawing(selectedDrawing.id, {
				text: draft,
				style: {
					textBoxWidth: currentStyle?.textBoxWidth ?? localBoxWidth,
					textBoxHeight: currentStyle?.textBoxHeight ?? effectiveHeight,
				},
			});
		});
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		// P6.3: IME guard — don't commit/cancel while composing Vietnamese Telex/VNI
		if ((e.nativeEvent as KeyboardEvent).isComposing || isComposing) return;
		// Prevent parent drawing handlers (keyboardGuard) from stealing keys like Space while editing.
		// Space must be allowed to insert paragraph breaks — stop propagation so DrawingLayer's
		// global keydown (which checks isTypingTarget) never sees it via bubbling.
		// Use native stopImmediatePropagation so window-level listeners (DrawingLayer) don't see it either.
		e.stopPropagation();
		(e.nativeEvent as KeyboardEvent).stopPropagation?.();
		(e.nativeEvent as unknown as { stopImmediatePropagation?: () => void })?.stopImmediatePropagation?.();
		// Allow all typing keys (including Space) to reach textarea default — do not preventDefault for them.
		if (e.key === "Escape") {
			e.preventDefault();
			handleCancelTextEdit();
		}
		if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
			e.preventDefault();
			textareaRef.current?.blur();
		}
	};

	const handleResizePointerDown = (edge: string) => (e: React.PointerEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation();
		const startX = e.clientX;
		const startY = e.clientY;
		const startW = drawBoxWidth;
		const startH = drawBoxHeight;
		let currentW = startW;
		let currentH = startH;

		const handlePointerMove = (ev: PointerEvent) => {
			const dx = ev.clientX - startX;
			const dy = ev.clientY - startY;
			if (edge.includes("e")) currentW = Math.max(MIN_WIDTH, startW + dx);
			if (edge.includes("w")) currentW = Math.max(MIN_WIDTH, startW - dx);
			if (edge.includes("s")) currentH = Math.max(MIN_HEIGHT, startH + dy);
			if (edge.includes("n")) currentH = Math.max(MIN_HEIGHT, startH - dy);
			setLocalBoxWidth(currentW);
			setLocalBoxHeight(currentH);
		};

		const handlePointerUp = () => {
			document.removeEventListener("pointermove", handlePointerMove);
			document.removeEventListener("pointerup", handlePointerUp);
			patchStyle({ textBoxWidth: currentW, textBoxHeight: currentH });
		};

		document.addEventListener("pointermove", handlePointerMove);
		document.addEventListener("pointerup", handlePointerUp);
		(e.target as HTMLElement).setPointerCapture?.(e.pointerId);
	};

	const H_OFF = -(HANDLE_SIZE / 2) + 1;
	const handles = [
		{ edge: "nw", style: { top: H_OFF, left: H_OFF, cursor: "nwse-resize" } },
		{ edge: "n", style: { top: H_OFF, left: `calc(50% - ${HANDLE_SIZE / 2}px)`, cursor: "ns-resize" } },
		{ edge: "ne", style: { top: H_OFF, right: H_OFF, cursor: "nesw-resize" } },
		{ edge: "e", style: { top: `calc(50% - ${HANDLE_SIZE / 2}px)`, right: H_OFF, cursor: "ew-resize" } },
		{ edge: "se", style: { bottom: H_OFF, right: H_OFF, cursor: "nwse-resize" } },
		{ edge: "s", style: { bottom: H_OFF, left: `calc(50% - ${HANDLE_SIZE / 2}px)`, cursor: "ns-resize" } },
		{ edge: "sw", style: { bottom: H_OFF, left: H_OFF, cursor: "nesw-resize" } },
		{ edge: "w", style: { top: `calc(50% - ${HANDLE_SIZE / 2}px)`, left: H_OFF, cursor: "ew-resize" } },
	];

	return (
		<>
			<div
				ref={toolbarRef}
				onPointerDownCapture={() => {
					toolbarInteractionRef.current = true;
				}}
				style={{
					position: "absolute",
					left: clamp(left, 0, Math.max(0, shellSize.width - 300)),
					top: toolbarTop,
					zIndex: "var(--vnsc-z-drawing-inspector, 75)",
					display: "flex",
					alignItems: "center",
					gap: 6,
					padding: "4px 8px",
					background: "rgba(15, 23, 42, 0.95)",
					border: "1px solid #334155",
					borderRadius: 6,
					boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
					height: TOOLBAR_HEIGHT,
				}}
			>
				<div style={{ display: "flex", alignItems: "center", gap: 4 }}>
					<input
						type="range"
						min={8}
						max={72}
						value={currentStyle?.fontSize ?? 14}
						onChange={(e) => patchStyle({ fontSize: Number(e.target.value) })}
						onPointerDown={(e) => e.stopPropagation()}
						style={{ width: 80 }}
					/>
					<input
						type="number"
						min={8}
						max={72}
						value={currentStyle?.fontSize ?? 14}
						onChange={(e) => patchStyle({ fontSize: Number(e.target.value) })}
						onPointerDown={(e) => e.stopPropagation()}
						style={{ width: 48, background: "#1e293b", color: "#f8fafc", border: "1px solid #475569", borderRadius: 3, padding: "2px 4px", fontSize: 11 }}
					/>
				</div>
				<select
					value={currentStyle?.fontFamily ?? "sans-serif"}
					onChange={(e) => patchStyle({ fontFamily: e.target.value })}
					onPointerDown={(e) => e.stopPropagation()}
					style={{
						background: "#1e293b",
						color: "#f8fafc",
						border: "1px solid #475569",
						borderRadius: 3,
						padding: "2px 4px",
						fontSize: 11,
						cursor: "pointer",
						maxWidth: 90,
					}}
				>
					{FONT_FAMILIES.map((f) => (
						<option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
					))}
				</select>
				<div style={{ display: "flex", gap: 2 }}>
					<button type="button" onPointerDown={(e) => { e.stopPropagation(); patchStyle({ bold: !currentStyle?.bold }); }} style={{ background: currentStyle?.bold ? "#2962ff" : "#1e293b", color: "#f8fafc", border: "1px solid #475569", borderRadius: 3, padding: "2px 6px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>B</button>
					<button type="button" onPointerDown={(e) => { e.stopPropagation(); patchStyle({ italic: !currentStyle?.italic }); }} style={{ background: currentStyle?.italic ? "#2962ff" : "#1e293b", color: "#f8fafc", border: "1px solid #475569", borderRadius: 3, padding: "2px 6px", fontSize: 11, fontStyle: "italic", cursor: "pointer" }}>I</button>
				</div>
				<div style={{ display: "flex", gap: 2 }}>
					<button type="button" onPointerDown={(e) => { e.stopPropagation(); patchStyle({ textAlign: "left" }); }} style={{ background: currentStyle?.textAlign === "left" ? "#2962ff" : "#1e293b", color: "#f8fafc", border: "1px solid #475569", borderRadius: 3, padding: "2px 4px", fontSize: 11, cursor: "pointer" }}>⟸</button>
					<button type="button" onPointerDown={(e) => { e.stopPropagation(); patchStyle({ textAlign: "center" }); }} style={{ background: (currentStyle?.textAlign ?? "left") === "center" ? "#2962ff" : "#1e293b", color: "#f8fafc", border: "1px solid #475569", borderRadius: 3, padding: "2px 4px", fontSize: 11, cursor: "pointer" }}>≡</button>
					<button type="button" onPointerDown={(e) => { e.stopPropagation(); patchStyle({ textAlign: "right" }); }} style={{ background: currentStyle?.textAlign === "right" ? "#2962ff" : "#1e293b", color: "#f8fafc", border: "1px solid #475569", borderRadius: 3, padding: "2px 4px", fontSize: 11, cursor: "pointer" }}>⟹</button>
				</div>
				<div style={{ width: 1, height: 16, background: "#475569" }} />
				<div style={{ display: "flex", gap: 3, alignItems: "center" }}>
					{COLOR_PRESETS.map((c) => (
						<button
							key={c}
							type="button"
							onPointerDown={(e) => { e.stopPropagation(); patchStyle({ stroke: c }); }}
							style={{
								width: 16,
								height: 16,
								borderRadius: "50%",
								border: (currentStyle?.stroke ?? "#f8fafc") === c ? "2px solid white" : "1px solid #475569",
								background: c,
								cursor: "pointer",
								padding: 0,
							}}
						/>
					))}
				</div>
				<button type="button" title="Eyedropper" onPointerDown={async (e) => { e.stopPropagation(); const anyWin = window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }; if (anyWin.EyeDropper) { try { const eye = new anyWin.EyeDropper(); const res = await eye.open(); patchStyle({ stroke: res.sRGBHex }); } catch {} } }} style={{ width: 20, height: 20, borderRadius: 4, border: "1px solid #475569", background: "transparent", cursor: "pointer", fontSize: 12 }}>◉</button>
			</div>
			<div
				style={{
					position: "absolute",
					left,
					top,
					width: drawBoxWidth,
					height: drawBoxHeight,
					zIndex: "var(--vnsc-z-drawing-inspector, 75)",
				}}
			>
				<textarea
					ref={textareaRef}
					value={drawingTextDraft}
					onChange={(e) => { const v = e.target.value; const now = Date.now(); if (now - lastPushRef.current > 500) { undoStackRef.current.push(drawingTextDraft); if (undoStackRef.current.length > 50) undoStackRef.current.shift(); lastPushRef.current = now; } setDrawingTextDraft(v); }}
					onBlur={handleBlur}
					onKeyDown={handleKeyDown}
					onCompositionStart={() => setIsComposing(true)}
					onCompositionEnd={() => setIsComposing(false)}
					maxLength={2000}
					aria-label="Text drawing content"
					lang="vi"
					style={{
						width: "100%",
						height: "100%",
						boxSizing: "border-box",
						resize: "none",
						border: "2px solid #2962ff",
						background: "rgba(15, 23, 42, 0.92)",
						color: currentStyle?.stroke ?? "#f8fafc",
						fontSize: currentStyle?.fontSize ?? 14,
						fontFamily: currentStyle?.fontFamily ?? "sans-serif",
						padding: "16px",
						outline: "none",
						borderRadius: 6,
						boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
						lineHeight: 1.5,
					}}
				/>
				{drawingTextDraft.length > 400 && (
					<div style={{ position: "absolute", bottom: 4, right: 8, fontSize: 10, color: drawingTextDraft.length > 1800 ? "#ef4444" : "#94a3b8", background: "rgba(15,23,42,0.7)", padding: "1px 4px", borderRadius: 3 }}>
						{drawingTextDraft.length}/2000
					</div>
				)}
				{handles.map((h) => (
					<div
						key={h.edge}
						onPointerDown={handleResizePointerDown(h.edge)}
						style={{
							position: "absolute",
							width: HANDLE_SIZE,
							height: HANDLE_SIZE,
							boxSizing: "border-box",
							background: "white",
							border: "2px solid #2962ff",
							borderRadius: "50%",
							zIndex: "var(--vnsc-z-drawing-inspector, 75)",
							boxShadow: "0 0 0 1px rgba(0,0,0,0.3)",
							...h.style,
						}}
					/>
				))}
			</div>
		</>
	);
}
