import type { CSSProperties } from "react";
import { useState, useRef } from "react";
import type { DrawingObject } from "@vninvestcharts/engine-drawing";
import type { DrawingInspectorTextEditorProps } from "./DrawingInspector";
import DrawingInspector from "./DrawingInspector";

export interface FloatingDrawingInspectorProps {
	drawing: DrawingObject;
	isDark: boolean;
	t: (key: string) => string;
	textEditor?: DrawingInspectorTextEditorProps;
	onClose: () => void;
	onUpdate: (patch: any) => void;
	onDelete: () => void;
	onClone: () => void;
	onToggleLock: () => void;
	onToggleVisible: () => void;
	onBringToFront: () => void;
	onSendToBack: () => void;
	plotData?: readonly any[];
}

export default function FloatingDrawingInspector({
	drawing,
	isDark,
	t,
	textEditor,
	onClose,
	onUpdate,
	onDelete,
	onClone,
	onToggleLock,
	onToggleVisible,
	onBringToFront,
	onSendToBack,
	plotData = [],
}: FloatingDrawingInspectorProps) {
	// Initialize position: top-left quadrant of chart container, offsetting toolbar
	const [position, setPosition] = useState({ x: 80, y: 60 });
	const [isDragging, setIsDragging] = useState(false);
	const dragStartRef = useRef<{
		startX: number;
		startY: number;
		posX: number;
		posY: number;
		parentWidth: number;
		parentHeight: number;
		dialogWidth: number;
		dialogHeight: number;
	} | null>(null);

	const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		const dialogEl = e.currentTarget.parentElement;
		const parentEl = dialogEl?.parentElement;
		const parentRect = parentEl?.getBoundingClientRect();
		const dialogRect = dialogEl?.getBoundingClientRect();

		dragStartRef.current = {
			startX: e.clientX,
			startY: e.clientY,
			posX: position.x,
			posY: position.y,
			parentWidth: parentRect?.width || window.innerWidth,
			parentHeight: parentRect?.height || window.innerHeight,
			dialogWidth: dialogRect?.width || 320,
			dialogHeight: dialogRect?.height || 400,
		};
		e.currentTarget.setPointerCapture(e.pointerId);
		setIsDragging(true);
	};

	const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!dragStartRef.current) return;
		const { startX, startY, posX, posY, parentWidth, parentHeight, dialogWidth, dialogHeight } = dragStartRef.current;
		const dx = e.clientX - startX;
		const dy = e.clientY - startY;

		let nextX = posX + dx;
		let nextY = posY + dy;

		// Boundary clamping: keep panel inside chart container viewport
		nextX = Math.max(0, Math.min(parentWidth - dialogWidth, nextX));
		nextY = Math.max(0, Math.min(parentHeight - 40, nextY)); // keep header accessible

		setPosition({ x: nextX, y: nextY });
	};

	const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!dragStartRef.current) return;
		e.currentTarget.releasePointerCapture(e.pointerId);
		dragStartRef.current = null;
		setIsDragging(false);
	};

	const palette = isDark
		? {
			panelBg: "rgba(15, 23, 42, 0.82)", // Sleek dark slate glass
			border: "rgba(255, 255, 255, 0.12)",
			text: "#f8fafc",
			textMuted: "#94a3b8",
			headerBg: "linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95))",
			shadow: "0 12px 32px 0 rgba(0, 0, 0, 0.4)",
			closeHover: "rgba(255, 255, 255, 0.1)",
		}
		: {
			panelBg: "rgba(255, 255, 255, 0.9)", // Soft white glass
			border: "rgba(15, 23, 42, 0.1)",
			text: "#0f172a",
			textMuted: "#64748b",
			headerBg: "linear-gradient(135deg, rgba(248, 250, 252, 0.95), rgba(241, 245, 249, 0.95))",
			shadow: "0 12px 32px 0 rgba(15, 23, 42, 0.12)",
			closeHover: "rgba(15, 23, 42, 0.06)",
		};

	const dialogStyle: CSSProperties = {
		position: "absolute",
		left: position.x,
		top: position.y,
		width: 320,
		maxHeight: "calc(100% - 100px)",
		borderRadius: 12,
		border: `1px solid ${palette.border}`,
		background: palette.panelBg,
		boxShadow: palette.shadow,
		backdropFilter: "blur(16px) saturate(180%)",
		WebkitBackdropFilter: "blur(16px) saturate(180%)",
		display: "flex",
		flexDirection: "column",
		overflow: "hidden",
		// S5.1/F-13: SSOT token (was hardcoded 100).
		zIndex: "var(--vnsc-z-drawing-inspector, 75)",
		pointerEvents: "auto", // Allow direct click and drag interactions
		fontFamily: "Inter, Roboto, sans-serif",
	};

	const headerStyle: CSSProperties = {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		padding: "10px 14px",
		borderBottom: `1px solid ${palette.border}`,
		background: palette.headerBg,
		cursor: isDragging ? "grabbing" : "grab",
		userSelect: "none",
	};

	const titleStyle: CSSProperties = {
		fontSize: "13px",
		fontWeight: 600,
		color: palette.text,
	};

	const closeBtnStyle: CSSProperties = {
		border: "none",
		background: "transparent",
		width: 24,
		height: 24,
		borderRadius: 6,
		color: palette.textMuted,
		cursor: "pointer",
		display: "grid",
		placeItems: "center",
		padding: 0,
		transition: "background 150ms ease, color 150ms ease",
	};

	const bodyStyle: CSSProperties = {
		flex: 1,
		overflowY: "auto",
		padding: 12,
		minHeight: 0,
	};

	const toolName = t(`tool.${drawing.type}`);
	const resolvedToolName = toolName === `tool.${drawing.type}` ? drawing.type : toolName;
	const propertiesLabel = t("drawing.openProperties");
	const resolvedPropertiesLabel = propertiesLabel === "drawing.openProperties" ? "Properties" : propertiesLabel;
	const niceTitle = `${resolvedToolName} - ${resolvedPropertiesLabel}`;

	return (
		<div style={dialogStyle} className="vnsc-floating-inspector-dialog" data-testid="floating-inspector">
			<div
				style={headerStyle}
				className="vnsc-floating-inspector-header"
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
			>
				<span style={titleStyle}>{niceTitle}</span>
				<button
					type="button"
					aria-label={t("drawing.close")}
					data-testid="floating-inspector-close"
					onClick={onClose}
					onPointerDown={(e) => e.stopPropagation()}
					style={closeBtnStyle}
					onMouseEnter={(e) => {
						e.currentTarget.style.background = palette.closeHover;
						e.currentTarget.style.color = palette.text;
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.background = "transparent";
						e.currentTarget.style.color = palette.textMuted;
					}}
				>
					<svg width="12" height="12" viewBox="0 0 16 16" fill="none">
						<path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
					</svg>
				</button>
			</div>
			<div style={bodyStyle} className="vnsc-floating-inspector-body">
				<DrawingInspector
					drawing={drawing}
					textEditor={textEditor}
					embedded
					labels={{
						title: t("drawing.dockProperties"),
						stroke: t("drawing.stroke"),
						selectIcon: t("drawing.selectIcon"),
						iconSize: t("drawing.iconSize"),
						fill: t("drawing.fill"),
						strokeWidth: t("drawing.strokeWidth"),
						lineStyle: t("drawing.lineStyle"),
						opacity: t("drawing.opacity"),
						solid: t("drawing.solid"),
						dashed: t("drawing.dashed"),
						dotted: t("drawing.dotted"),
						lock: t("drawing.lock"),
						unlock: t("drawing.unlock"),
						clone: t("drawing.clone"),
						hide: t("drawing.hide"),
						show: t("drawing.show"),
						bringToFront: t("drawing.bringToFront"),
						sendToBack: t("drawing.sendToBack"),
						delete: t("drawing.delete"),
						close: t("drawing.close"),
						lineTypeLabel: t("drawing.lineType.label"),
						lineTypeTrendLine: t("drawing.lineType.trendLine"),
						lineTypeRay: t("drawing.lineType.ray"),
						lineTypeExtendedLine: t("drawing.lineType.extendedLine"),
						saveStyle: t("drawing.inspector.saveStyle"),
						templatesTitle: t("drawing.templatesTitle"),
						templatesSave: t("drawing.templatesSave"),
						templatesDelete: t("drawing.templatesDelete"),
						templatesLoad: t("drawing.templatesLoad"),
						templatesNamePlaceholder: t("drawing.templatesNamePlaceholder"),
						fibLevelsTitle: t("drawing.fibLevelsTitle"),
						fibAddLevel: t("drawing.fibAddLevel"),
						fibRemoveLevel: t("drawing.fibRemoveLevel"),
						rrTitle: t("drawing.inspector.rrTitle"),
						rrEntry: t("drawing.inspector.rrEntry"),
						rrStop: t("drawing.inspector.rrStop"),
						rrTarget: t("drawing.inspector.rrTarget"),
						segmentsTitle: t("drawing.inspector.segmentsTitle"),
						alertTitle: t("drawing.alert.title"),
						alertEnabled: t("drawing.alert.enabled"),
						alertDirection: t("drawing.alert.direction"),
						alertCooldown: t("drawing.alert.cooldown"),
						alertCrossAbove: t("drawing.alert.crossAbove"),
						alertCrossBelow: t("drawing.alert.crossBelow"),
						alertEither: t("drawing.alert.either"),
						alertCooldownSeconds: t("drawing.measure.barsLabel"),
						coordinatesTitle: t("drawing.coordinatesTitle"),
						priceLabel: t("drawing.priceLabel"),
						timeLabel: t("drawing.timeLabel"),
					}}
					onUpdate={onUpdate}
					onDelete={onDelete}
					onClone={onClone}
					onToggleLock={onToggleLock}
					onToggleVisible={onToggleVisible}
					onBringToFront={onBringToFront}
					onSendToBack={onSendToBack}
					onClose={onClose}
					plotData={plotData as any[]} // ARC-1-keep: legacy bridge
				/>
			</div>
		</div>
	);
}
