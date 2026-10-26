/**
 * P2-a: Icons.tsx — internal SVG chrome icon set (zero new dependencies, F2 approved).
 *
 * Conventions: 16x16 viewBox, 1.5px stroke, currentColor, round caps —
 * identical to OHLCHeader desktop icons so every surface matches.
 * Tool glyphs (drawing tools) live in @vninvestcharts/engine-react (drawingToolIcons) (SSOT);
 * use <ToolGlyph id> for those, <Icon*> for chrome.
 */
import type { SVGProps } from "react";
import { drawingToolIcons } from "@vninvestcharts/engine-react";

export interface IconProps extends SVGProps<SVGSVGElement> {
	size?: number;
}

function Svg({ size = 15, children, ...props }: IconProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			{...props}
		>
			{children}
		</svg>
	);
}

/**
 * Drawing-tool glyph from the central registry (@vninvestcharts/engine-react (drawingToolIcons)).
 * P4: unknown ids render a dashed placeholder (plus a dev-only warning) instead
 * of nothing — a missing glyph must stay visible, never silent.
 */
export function ToolGlyph({ id }: { id: string }) {
	const glyph = drawingToolIcons[id];
	if (glyph) return <>{glyph}</>;
	if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
		console.warn(`[ToolGlyph] missing icon for tool "${id}"`);
	}
	return (
		<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
			<rect x="2.5" y="2.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2" />
		</svg>
	);
}

export function IconSearch(props: IconProps) {
	return (
		<Svg {...props}>
			<circle cx="7.5" cy="7.5" r="4.5" />
			<line x1="11" y1="11" x2="14" y2="14" />
		</Svg>
	);
}

export function IconX(props: IconProps) {
	return (
		<Svg {...props}>
			<line x1="3" y1="3" x2="13" y2="13" />
			<line x1="13" y1="3" x2="3" y2="13" />
		</Svg>
	);
}

export function IconMenu(props: IconProps) {
	return (
		<Svg {...props}>
			<line x1="2" y1="4" x2="14" y2="4" />
			<line x1="2" y1="8" x2="14" y2="8" />
			<line x1="2" y1="12" x2="14" y2="12" />
		</Svg>
	);
}

export function IconLock(props: IconProps) {
	return (
		<Svg {...props}>
			<rect x="3.5" y="7" width="9" height="7" rx="1.5" />
			<path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
		</Svg>
	);
}

export function IconUnlock(props: IconProps) {
	return (
		<Svg {...props}>
			<rect x="3.5" y="7" width="9" height="7" rx="1.5" />
			<path d="M5.5 7V5a2.5 2.5 0 0 1 4.9-.8" />
		</Svg>
	);
}

export function IconChevronUp(props: IconProps) {
	return (
		<Svg {...props}>
			<polyline points="4,10 8,6 12,10" />
		</Svg>
	);
}

export function IconChevronDown(props: IconProps) {
	return (
		<Svg {...props}>
			<polyline points="4,6 8,10 12,6" />
		</Svg>
	);
}

export function IconChevronLeft(props: IconProps) {
	return (
		<Svg {...props}>
			<polyline points="10,4 6,8 10,12" />
		</Svg>
	);
}

export function IconChevronRight(props: IconProps) {
	return (
		<Svg {...props}>
			<polyline points="6,4 10,8 6,12" />
		</Svg>
	);
}

export function IconTrash(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M2.5 4h11" />
			<path d="M6.5 4V2.5h3V4" />
			<path d="M4 4l.8 9.2a1 1 0 0 0 1 .8h4.4a1 1 0 0 0 1-.8L12 4" />
			<line x1="6.5" y1="7" x2="6.5" y2="11" />
			<line x1="9.5" y1="7" x2="9.5" y2="11" />
		</Svg>
	);
}

export function IconUndo(props: IconProps) {
	return (
		<Svg {...props}>
			<polyline points="5.5,3.5 2.5,6.5 5.5,9.5" />
			<path d="M2.5 6.5h7a3.5 3.5 0 0 1 0 7H7" />
		</Svg>
	);
}

export function IconRedo(props: IconProps) {
	return (
		<Svg {...props}>
			<polyline points="10.5,3.5 13.5,6.5 10.5,9.5" />
			<path d="M13.5 6.5h-7a3.5 3.5 0 0 0 0 7H9" />
		</Svg>
	);
}

export function IconSun(props: IconProps) {
	return (
		<Svg {...props}>
			<circle cx="8" cy="8" r="2.5" />
			<path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
		</Svg>
	);
}

export function IconMoon(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M13.5 11A5.5 5.5 0 1 1 5 2.5a4.5 4.5 0 0 0 8.5 8.5z" />
		</Svg>
	);
}

export function IconClock(props: IconProps) {
	return (
		<Svg {...props}>
			<circle cx="8" cy="8" r="6" />
			<polyline points="8,4.5 8,8 10.5,9.5" />
		</Svg>
	);
}

export function IconSync(props: IconProps) {
	return (
		<Svg {...props}>
			<polyline points="13,2.5 13,6 9.5,6" />
			<path d="M11.2 8.5a4.5 4.5 0 1 1-1.3-4.2L13 6" />
			<polyline points="3,13.5 3,10 6.5,10" />
			<path d="M4.8 7.5a4.5 4.5 0 1 1 1.3 4.2L3 10" />
		</Svg>
	);
}

export function IconLayoutGrid(props: IconProps) {
	return (
		<Svg {...props}>
			<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
			<rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
			<rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
			<rect x="9" y="9" width="4.5" height="4.5" rx="1" />
		</Svg>
	);
}

export function IconPlus(props: IconProps) {
	return (
		<Svg {...props}>
			<line x1="8" y1="3" x2="8" y2="13" />
			<line x1="3" y1="8" x2="13" y2="8" />
		</Svg>
	);
}

export function IconSave(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M12 2 H4 A2 2 0 0 0 2 4 V12 A2 2 0 0 0 4 14 H12 A2 2 0 0 0 14 12 V4 A2 2 0 0 0 12 2 Z" />
			<rect x="5" y="2" width="6" height="4" />
			<rect x="4" y="9" width="8" height="5" />
		</Svg>
	);
}

export function IconFolderOpen(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M2 10 V14 H14 V10" />
			<path d="M8 2 V10 M5 7 L8 10 L11 7" />
		</Svg>
	);
}

export function IconCamera(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M5 5.5 L6 3.5 H10 L11 5.5" />
			<rect x="2" y="5.5" width="12" height="8" rx="1.5" />
			<circle cx="8" cy="9.5" r="2" />
		</Svg>
	);
}

export function IconExpand(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M3 6V3.5A.5.5 0 0 1 3.5 3H6" />
			<path d="M10 3h2.5a.5.5 0 0 1 .5.5V6" />
			<path d="M13 10v2.5a.5.5 0 0 1-.5.5H10" />
			<path d="M6 13H3.5a.5.5 0 0 1-.5-.5V10" />
		</Svg>
	);
}

export function IconBell(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M8 2 C9.5 2 11 3.5 11 5 L11 9 C11 10.5 12 11 12 11.5 L4 11.5 C4 11 5 10.5 5 9 L5 5 C5 3.5 6.5 2 8 2 Z" />
			<path d="M7 13 A1 1 0 0 0 9 13" />
		</Svg>
	);
}

export function IconSettings(props: IconProps) {
	return (
		<Svg {...props}>
			<polygon points="8,2 13.5,5 13.5,11 8,14 2.5,11 2.5,5" />
			<circle cx="8" cy="8" r="2.5" />
		</Svg>
	);
}

export function IconCompare(props: IconProps) {
	return (
		<Svg {...props}>
			<line x1="12" y1="2" x2="12" y2="14" />
			<line x1="4" y1="8" x2="10" y2="8" />
			<line x1="6" y1="12" x2="14" y2="12" />
		</Svg>
	);
}

export function IconReplay(props: IconProps) {
	return (
		<Svg {...props}>
			<circle cx="8" cy="8" r="6.5" />
			<polygon points="6.5,5.5 11.5,8 6.5,10.5" fill="currentColor" stroke="none" />
		</Svg>
	);
}

export function IconDownload(props: IconProps) {
	return (
		<Svg {...props}>
			<polyline points="4.7,6.7 8,10 11.3,6.7" />
			<line x1="8" y1="10" x2="8" y2="2" />
			<path d="M14 10v2.7a1.3 1.3 0 0 1-1.3 1.3H3.3A1.3 1.3 0 0 1 2 12.7V10" />
		</Svg>
	);
}

export function IconList(props: IconProps) {
	return (
		<Svg {...props}>
			<circle cx="3" cy="4.5" r="1" fill="currentColor" stroke="none" />
			<circle cx="3" cy="8" r="1" fill="currentColor" stroke="none" />
			<circle cx="3" cy="11.5" r="1" fill="currentColor" stroke="none" />
			<line x1="6" y1="4.5" x2="14" y2="4.5" />
			<line x1="6" y1="8" x2="14" y2="8" />
			<line x1="6" y1="11.5" x2="14" y2="11.5" />
		</Svg>
	);
}

export function IconBarChart(props: IconProps) {
	return (
		<Svg {...props}>
			<line x1="2" y1="13.5" x2="14" y2="13.5" />
			<line x1="4.5" y1="9" x2="4.5" y2="13.5" />
			<line x1="8" y1="6" x2="8" y2="13.5" />
			<line x1="11.5" y1="3.5" x2="11.5" y2="13.5" />
		</Svg>
	);
}

export function IconLayers(props: IconProps) {
	return (
		<Svg {...props}>
			<polygon points="8,2 14,5.5 8,9 2,5.5" />
			<polyline points="2,8.5 8,12 14,8.5" />
			<polyline points="2,11.5 8,15 14,11.5" />
		</Svg>
	);
}

export function IconActivity(props: IconProps) {
	return (
		<Svg {...props}>
			<polyline points="14,8 10,8 8,3.5 6,12.5 4,8 2,8" />
		</Svg>
	);
}

export function IconLink(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M10 6.5a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5l1.5-1.5" />
			<path d="M6 9.5a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5L6.5 4" />
		</Svg>
	);
}

export function IconEye(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M1.5 8S4.5 3.5 8 3.5 14.5 8 14.5 8 11.5 12.5 8 12.5 1.5 8 1.5 8z" />
			<circle cx="8" cy="8" r="1.8" />
		</Svg>
	);
}

export function IconEyeOff(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M1.5 8S4.5 3.5 8 3.5c1.2 0 2.5.5 3.5 1.3M14.5 8S11.5 12.5 8 12.5c-1.2 0-2.5-.5-3.5-1.3" />
			<line x1="2.5" y1="13.5" x2="13.5" y2="2.5" />
		</Svg>
	);
}

export function IconCode(props: IconProps) {
	return (
		<Svg {...props}>
			<polyline points="6,5 3,8 6,11" />
			<polyline points="10,5 13,8 10,11" />
		</Svg>
	);
}

export function IconFlask(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M7 2v4.5L3.8 12a1 1 0 0 0 .9 1.5h6.6a1 1 0 0 0 .9-1.5L9 6.5V2" />
			<path d="M6 2h4" />
			<line x1="7" y1="10.5" x2="9" y2="10.5" />
		</Svg>
	);
}

export function IconStar(props: IconProps) {
	return (
		<svg
			width={props.size ?? 15}
			height={props.size ?? 15}
			viewBox="0 0 16 16"
			fill="currentColor"
			aria-hidden="true"
		>
			<path d="M8 1.5l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.3l-3.8 2 .7-4.3-3.1-3 4.3-.6L8 1.5z" />
		</svg>
	);
}

/**
 * E1 hover-pin: pushpin glyph for the dock pin toggle (panel header).
 * 16x16 / 1.5px stroke / currentColor / round — matches file conventions.
 */
export function IconPin(props: IconProps) {
	return (
		<Svg {...props}>
			<path d="M9.5 2.5h5v3.5l-2.5 1v3.2l1.7 1.1v.7H6.3v-.7L8 10.2V7l-2.5-1V2.5h4z" />
			<line x1="8" y1="12" x2="8" y2="14.5" />
		</Svg>
	);
}

/**
 * P4-dock: vertical "more" grip — mirror of the drawing toolbar handle
 * (3 vertical dots). Used by the free-tier dock rail (DockUpgradeNudge).
 */
export function IconMoreVertical(props: IconProps) {
	return (
		<svg
			width={props.size ?? 15}
			height={props.size ?? 15}
			viewBox="0 0 16 16"
			fill="currentColor"
			aria-hidden="true"
		>
			<circle cx="8" cy="3" r="1.4" />
			<circle cx="8" cy="8" r="1.4" />
			<circle cx="8" cy="13" r="1.4" />
		</svg>
	);
}
