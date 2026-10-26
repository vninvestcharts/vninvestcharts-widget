import React from "react";

export interface EventMarkerIconProps {
	type: "D" | "E" | "N" | "S";
	size?: number;
}

export const EventMarkerIcon: React.FC<EventMarkerIconProps> = ({
	type,
	size = 16,
}) => {
	const getEventColor = (evtType: typeof type) => {
		switch (evtType) {
			case "D": return "#10b981"; // Emerald green
			case "S": return "#3b82f6"; // Blue
			case "E": return "#f59e0b"; // Amber/orange
			case "N": return "#ec4899"; // Pink
			default: return "#9ca3af";
		}
	};

	const color = getEventColor(type);

	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 20 20"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			style={{ cursor: "pointer", transition: "transform 0.15s ease" }}
		>
			<circle cx="10" cy="10" r="9" fill={color} stroke="#ffffff" strokeWidth="2" />
			<text
				x="10"
				y="13.5"
				textAnchor="middle"
				fill="#ffffff"
				fontSize="10"
				fontWeight="bold"
				fontFamily="sans-serif"
			>
				{type}
			</text>
		</svg>
	);
};
