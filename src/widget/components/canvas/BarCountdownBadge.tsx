import React, { useEffect, useRef, useState } from "react";
import { useNow, useBarCountdown } from "../footer/useBarCountdown";
import {
	LEGACY_COMPOSITE_KEY,
	normalizeChartId,
	settingsCompositeKey,
	shouldAcceptSettingsEvent,
} from "../settings/storageKeys";

function readStoredVisibility(chartId?: string | null): boolean | undefined {
	try {
		if (typeof window === "undefined" || !window.localStorage) return undefined;
		const raw =
			window.localStorage.getItem(settingsCompositeKey(chartId)) ??
			window.localStorage.getItem(LEGACY_COMPOSITE_KEY);
		if (!raw) return undefined;
		const flag = (JSON.parse(raw) as { scales?: { showCountdownToBarClose?: unknown } }).scales
			?.showCountdownToBarClose;
		return typeof flag === "boolean" ? flag : undefined;
	} catch {
		return undefined;
	}
}

export interface BarCountdownBadgeProps {
	timeframe?: string;
	className?: string;
	style?: React.CSSProperties;
	isDark?: boolean;
}

export const BarCountdownBadge: React.FC<BarCountdownBadgeProps> = ({
	timeframe,
	className,
	style,
	isDark = true,
}) => {
	const now = useNow(Boolean(timeframe));
	const countdown = useBarCountdown(timeframe, now);
	// Wires the (previously dead) Settings → Scales → showCountdownToBarClose
	// toggle. Chart id is derived from the grid slot (S1 pattern); single-chart
	// falls back to the legacy key. Listens for enveloped sync (S2 guard).
	const [visible, setVisible] = useState<boolean>(() => readStoredVisibility(null) ?? true);
	const hostRef = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		const el = hostRef.current;
		if (!el) return;
		const myId = normalizeChartId(el.closest?.("[data-chart-id]")?.getAttribute?.("data-chart-id") ?? null);
		const stored = readStoredVisibility(myId);
		if (stored !== undefined) setVisible(stored);
		const handler = (e: Event) => {
			const detail = (e as CustomEvent<{ chartId?: string | null; state?: unknown }>).detail;
			if (!shouldAcceptSettingsEvent(myId, detail?.chartId ?? null)) return;
			const scales = (detail?.state as { scales?: { showCountdownToBarClose?: unknown } } | undefined)?.scales;
			if (scales && typeof scales.showCountdownToBarClose === "boolean") {
				setVisible(scales.showCountdownToBarClose);
			}
		};
		window.addEventListener("vnsc-settings-sync", handler);
		return () => window.removeEventListener("vnsc-settings-sync", handler);
	}, []);

	if (!countdown || !visible) {
		return null;
	}

	return (
		<span
			ref={hostRef}
			data-rsc-bar-countdown="true"
			className={className}
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: "4px",
				padding: "1px 6px",
				borderRadius: "4px",
				fontSize: "10.5px",
				fontWeight: 600,
				fontFamily: "Inter, -apple-system, BlinkMacSystemFont, monospace",
				lineHeight: "14px",
				letterSpacing: "0.02em",
				background: isDark ? "rgba(8, 153, 129, 0.18)" : "rgba(8, 153, 129, 0.12)",
				color: isDark ? "#26a69a" : "#089981",
				border: `1px solid ${isDark ? "rgba(38, 166, 154, 0.35)" : "rgba(8, 153, 129, 0.3)"}`,
				userSelect: "none",
				whiteSpace: "nowrap",
				...style,
			}}
		>
			<span
				style={{
					width: "5px",
					height: "5px",
					borderRadius: "50%",
					background: "#26a69a",
					display: "inline-block",
				}}
			/>
			{countdown}
		</span>
	);
};

