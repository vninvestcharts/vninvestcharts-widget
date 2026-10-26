/**
 * P3 split: tool glyph renderer extracted from DrawingToolbar (pure move,
 * zero behavior change). Prefers the shared `drawingToolIcons` registry and
 * falls back to the legacy inline SVG set for ids the registry lacks.
 */

import { drawingToolIcons } from "@vninvestcharts/engine-react";

export interface DrawingToolIconProps {
	/** Drawing tool id (e.g. "trendLine", "fibonacci", "cursor"). */
	id: string;
}

export function DrawingToolIcon({ id }: DrawingToolIconProps) {
	const customIcon = drawingToolIcons[id];
	if (customIcon) {
		return <>{customIcon}</>;
	}
	switch (id) {
		case "cursor":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<path d="M3 2l10 6.8-5.5 1.2-2.8 5.3L3 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
				</svg>
			);
		case "crosshair":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" />
					<line x1="8" y1="1" x2="8" y2="4.5" stroke="currentColor" strokeWidth="1.4" />
					<line x1="8" y1="11.5" x2="8" y2="15" stroke="currentColor" strokeWidth="1.4" />
					<line x1="1" y1="8" x2="4.5" y2="8" stroke="currentColor" strokeWidth="1.4" />
					<line x1="11.5" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.4" />
				</svg>
			);
		case "trendLine":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<circle cx="3" cy="13" r="1.5" fill="currentColor" />
					<circle cx="13" cy="3" r="1.5" fill="currentColor" />
					<line x1="4" y1="12" x2="12" y2="4" stroke="currentColor" strokeWidth="1.5" />
				</svg>
			);
		case "ray":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<line x1="3" y1="12" x2="13" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
					<path d="M10.5 4H13V6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			);
		case "extendedLine":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<line x1="2" y1="12" x2="14" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
					<circle cx="2" cy="12" r="1.2" fill="currentColor" />
					<circle cx="14" cy="4" r="1.2" fill="currentColor" />
				</svg>
			);
		case "hLine":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
					<circle cx="3" cy="8" r="1.5" fill="currentColor" />
				</svg>
			);
		case "vLine":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<line x1="8" y1="1" x2="8" y2="15" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
					<circle cx="8" cy="13" r="1.5" fill="currentColor" />
				</svg>
			);
		case "fibonacci":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<line x1="1" y1="4"  x2="15" y2="4"  stroke="currentColor" strokeWidth="1" />
					<line x1="1" y1="8"  x2="15" y2="8" stroke="currentColor" strokeWidth="1.5" />
					<line x1="1" y1="12" x2="15" y2="12" stroke="currentColor" strokeWidth="1" />
				</svg>
			);
		case "fibExtension":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<line x1="1" y1="5" x2="15" y2="5" stroke="currentColor" strokeWidth="1" />
					<line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1.3" />
					<line x1="1" y1="11" x2="15" y2="11" stroke="currentColor" strokeWidth="1" />
					<line x1="11" y1="3" x2="11" y2="13" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1" />
				</svg>
			);
		case "parallelChannel":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<line x1="2" y1="11" x2="13" y2="4" stroke="currentColor" strokeWidth="1.4" />
					<line x1="3" y1="13" x2="14" y2="6" stroke="currentColor" strokeWidth="1.1" strokeDasharray="3 2" />
					<line x1="1" y1="9" x2="12" y2="2" stroke="currentColor" strokeWidth="1.1" strokeDasharray="3 2" />
				</svg>
			);
		case "pitchfork":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<line x1="8" y1="13" x2="8" y2="5" stroke="currentColor" strokeWidth="1.4" />
					<line x1="8" y1="9" x2="3" y2="3" stroke="currentColor" strokeWidth="1.1" strokeDasharray="3 2" />
					<line x1="8" y1="9" x2="13" y2="3" stroke="currentColor" strokeWidth="1.1" strokeDasharray="3 2" />
				</svg>
			);
		case "abcdPattern":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<polyline points="2,12 5,6 9,10 13,4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
					<circle cx="2" cy="12" r="1" fill="currentColor" />
					<circle cx="13" cy="4" r="1" fill="currentColor" />
				</svg>
			);
		case "fibArc":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<path d="M3 11A5 5 0 0 1 13 11" stroke="currentColor" strokeWidth="1.3" />
					<path d="M4.2 11A3.8 3.8 0 0 1 11.8 11" stroke="currentColor" strokeWidth="1" strokeDasharray="3 2" />
				</svg>
			);
		case "fibTimeZone":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<line x1="3" y1="2" x2="3" y2="14" stroke="currentColor" strokeWidth="1.2" />
					<line x1="6" y1="2" x2="6" y2="14" stroke="currentColor" strokeWidth="1" strokeDasharray="3 2" />
					<line x1="10" y1="2" x2="10" y2="14" stroke="currentColor" strokeWidth="1" strokeDasharray="3 2" />
					<line x1="13" y1="2" x2="13" y2="14" stroke="currentColor" strokeWidth="1.2" />
				</svg>
			);
		case "regressionChannel":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<path d="M2 11l11-7" stroke="currentColor" strokeWidth="1.4" />
					<path d="M1.5 13l11-7" stroke="currentColor" strokeWidth="1" strokeDasharray="3 2" />
					<path d="M2.5 9l11-7" stroke="currentColor" strokeWidth="1" strokeDasharray="3 2" />
				</svg>
			);
		case "channel":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<line x1="1" y1="4"  x2="15" y2="9"  stroke="currentColor" strokeWidth="1.5" />
					<line x1="1" y1="8"  x2="15" y2="13" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
				</svg>
			);
		case "text":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16">
					<text x="2" y="13" fontSize="13" fontWeight="700" fill="currentColor" fontFamily="Georgia, serif">T</text>
				</svg>
			);
		case "rectangle":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<rect x="2" y="3" width="12" height="9" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
				</svg>
			);
		case "polyline":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<polyline points="2,12 5,9 8,11 12,5 14,7" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
					<circle cx="2" cy="12" r="1" fill="currentColor" />
					<circle cx="14" cy="7" r="1" fill="currentColor" />
				</svg>
			);
		case "arrow":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<path d="M3 12L12 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
					<path d="M8.5 3H12V6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			);
		case "dateAndPriceRange":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
					<path d="M4 6.5h8M4 9.5h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
				</svg>
			);
		case "longPosition":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<rect x="2" y="4" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
					<path d="M8 11V5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
					<path d="M6.2 6.8L8 5l1.8 1.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			);
		case "shortPosition":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<rect x="2" y="4" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
					<path d="M8 5v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
					<path d="M6.2 9.2L8 11l1.8-1.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			);
		case "settings":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.4" />
					<path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
				</svg>
			);
		case "disjointChannel":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<path d="M2 5h12M2 11h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
					<path d="M2 5h3M2 11h3" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1" strokeLinecap="round" />
				</svg>
			);
		case "flatTopBottom":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1.4" />
					<line x1="2" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.4" />
				</svg>
			);
		case "schiffPitchfork":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<line x1="8" y1="13" x2="8" y2="5" stroke="currentColor" strokeWidth="1.2" />
					<line x1="8" y1="9" x2="2" y2="3" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1" />
					<line x1="8" y1="9" x2="14" y2="3" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1" />
				</svg>
			);
		case "modifiedSchiff":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<line x1="8" y1="13" x2="8" y2="4" stroke="currentColor" strokeWidth="1.2" />
					<line x1="8" y1="8" x2="3" y2="3" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1" />
					<line x1="8" y1="8" x2="13" y2="3" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1" />
				</svg>
			);
		case "insidePitchfork":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<line x1="8" y1="13" x2="8" y2="6" stroke="currentColor" strokeWidth="1.2" />
					<line x1="8" y1="9" x2="4" y2="4" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1" />
					<line x1="8" y1="9" x2="12" y2="4" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1" />
				</svg>
			);
		case "gannFixed":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<rect x="2" y="2" width="12" height="12" stroke="currentColor" strokeWidth="1.2" />
					<line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1" />
				</svg>
			);
		case "trendAngle":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<path d="M3 12L13 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
					<path d="M10 12h3v-3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			);
		case "infoLine":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="1.2" />
					<circle cx="8" cy="8" r="1.5" fill="currentColor" />
				</svg>
			);
		case "brush":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<path d="M2 13Q4 10 6 12Q8 14 10 11Q12 8 14 6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			);
		case "highlighter":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<path d="M2 13Q4 10 6 12Q8 14 10 11Q12 8 14 6" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="square" strokeLinejoin="round" opacity="0.5" />
				</svg>
			);
		case "eraser":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<rect x="3" y="10" width="10" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
					<line x1="5" y1="10" x2="8" y2="4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
				</svg>
			);
		case "curve":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<path d="M2 13Q8 3 14 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
				</svg>
			);
		case "arc":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<path d="M2 13A8 8 0 0 1 14 13" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
				</svg>
			);
		case "path":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<path d="M2 13L6 5L10 11L14 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			);
		case "polygon":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<path d="M8 2L14 6L10 14L6 14L2 6Z" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.2" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			);
		case "rotatedRectangle":
			return (
				<svg width="15" height="15" viewBox="0 0 16 16" fill="none">
					<path d="M4 10L10 4L12 6L6 12Z" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.15" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			);
		default:
			return <span style={{ fontSize: 11 }}>?</span>;
	}
}
