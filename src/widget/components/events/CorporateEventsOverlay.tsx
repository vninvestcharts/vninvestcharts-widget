import { useContext, useState } from "react";
import { ChartRenderContext } from "../../../lib/core";
import { CHART_MARGIN } from "../../utils/widgetHelpers";
import { EventMarkerIcon } from "./EventMarkerIcon";

export interface CorporateEvent {
	id: string;
	type: "D" | "E" | "N" | "S";
	timeIndex: number;
	timestamp: number;
	date: string;
	label: string;
	title: string;
	description: string;
	data: Record<string, any>;
}

export interface CorporateEventsOverlayProps {
	events?: readonly CorporateEvent[];
	showEvents?: boolean;
	isMobile?: boolean;
	/**
	 * UI-B: clearance (px) above the X-axis strip so badges stay fully inside
	 * the plot area. Defaults to axis-strip height + 4px gap.
	 */
	axisClearancePx?: number;
	onEventClick?: (event: CorporateEvent) => void;
}

export function CorporateEventsOverlay({
	events = [],
	showEvents = true,
	isMobile = false,
	axisClearancePx = CHART_MARGIN.bottom + 4,
	onEventClick,
}: CorporateEventsOverlayProps) {
	const context = useContext(ChartRenderContext);
	const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);

	if (!showEvents || !context) return null;

	const { xScale, width } = context;

	// Filter events that are within the current visible viewport
	const visibleEvents = events.filter(e => {
		const x = xScale(new Date(e.timestamp));
		return x >= 0 && x <= width;
	});

	const getEventColor = (type: CorporateEvent["type"]) => {
		switch (type) {
			case "D": return "#10b981"; // Emerald green
			case "S": return "#3b82f6"; // Blue
			case "E": return "#f59e0b"; // Amber/orange
			case "N": return "#ec4899"; // Pink
			default: return "#9ca3af";
		}
	};

	return (
		<div
			style={{
				position: "absolute",
				inset: 0,
				pointerEvents: "none",
				zIndex: 20,
			}}
		>
			{visibleEvents.map(e => {
				const x = xScale(new Date(e.timestamp));
				const color = getEventColor(e.type);
				const isHovered = hoveredEventId === e.id;
				const markerSize = isMobile ? 20 : 16;

				return (
					<div
						key={e.id}
						data-event-badge={e.id}
						style={{
							position: "absolute",
							left: `${x}px`,
							bottom: `${axisClearancePx}px`,
							transform: "translateX(-50%)",
							pointerEvents: "auto",
						}}
					>
						<button
							type="button"
							onClick={() => onEventClick?.(e)}
							onMouseEnter={() => setHoveredEventId(e.id)}
							onMouseLeave={() => setHoveredEventId(null)}
							style={{
								background: "transparent",
								border: "none",
								padding: 0,
								cursor: "pointer",
								outline: "none",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								transition: "transform 0.15s ease",
								transform: isHovered ? "scale(1.25)" : "none",
							}}
						>
							<EventMarkerIcon type={e.type} size={markerSize} />
						</button>

						{isHovered && (
							<div
								style={{
									position: "absolute",
									bottom: `${markerSize + 6}px`,
									left: "50%",
									transform: "translateX(-50%)",
									backgroundColor: "rgba(20, 24, 33, 0.95)",
									backdropFilter: "blur(12px)",
									border: "1px solid rgba(255, 255, 255, 0.15)",
									borderRadius: "6px",
									padding: "8px 12px",
									boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
									minWidth: "180px",
									zIndex: 1000,
									display: "flex",
									flexDirection: "column",
									gap: "4px",
								}}
							>
								<div
									style={{
										fontSize: "12px",
										fontWeight: "bold",
										color: "#ffffff",
										borderBottom: `1px solid ${color}`,
										paddingBottom: "4px",
										marginBottom: "2px",
									}}
								>
									{e.title}
								</div>
								<div style={{ fontSize: "11px", color: "#d1d4dc", whiteSpace: "normal" }}>
									{e.description}
								</div>
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}
