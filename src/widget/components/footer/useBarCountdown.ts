/**
 * P5b-iii (bar countdown): clock-aligned time remaining in the current bar.
 *
 * v1 scope/limits (documented, see AUDIT_LEDGER UI_P5B_III):
 * - Intraday minute/hour frames assume clock-aligned sessions (exact for `m`;
 *   `h`/`D`/`W` align to UTC boundaries — may drift vs exchange-tz sessions).
 * - Monthly (`M`) and unknown formats are unsupported -> countdown hidden (null).
 * - Session calendars (VN lunch break 11:30-13:00, 14:45 close) are NOT modeled;
 *   countdown keeps ticking to the next clock boundary while closed.
 */
import { useEffect, useState } from "react";

export function parseTimeframeIntervalMs(timeframe: string | undefined | null): number | null {
	if (!timeframe) return null;
	const match = /^(\d+)(m|h|D|W)$/.exec(timeframe.trim());
	if (!match) return null;
	const amount = Number(match[1]);
	if (!Number.isFinite(amount) || amount <= 0) return null;
	switch (match[2]) {
		case "m": return amount * 60_000;
		case "h": return amount * 3_600_000;
		case "D": return amount * 86_400_000;
		case "W": return amount * 604_800_000;
		default: return null;
	}
}

export function formatCountdown(remainingMs: number, intervalMs: number): string {
	const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	const minutePart = intervalMs >= 3_600_000
		? `${hours}:${String(minutes).padStart(2, "0")}`
		: String(minutes).padStart(2, "0");
	return `${minutePart}:${String(seconds).padStart(2, "0")}`;
}

/** V-04: module-shared 1s ticker. Every useNow() consumer (statusline badge,
 * footer countdown, clocks) reads the SAME timestamp, so two countdowns can
 * never disagree by a second. One interval total, refcounted. */
let sharedNow = Date.now();
let tickerId: ReturnType<typeof setInterval> | null = null;
const tickerListeners = new Set<() => void>();

function ensureTicker(): void {
	if (tickerId !== null || typeof window === "undefined") return;
	tickerId = setInterval(() => {
		sharedNow = Date.now();
		tickerListeners.forEach((fn) => fn());
	}, 1000);
}

function releaseTicker(): void {
	if (tickerListeners.size === 0 && tickerId !== null) {
		clearInterval(tickerId);
		tickerId = null;
	}
}

export function useNow(enabled = true): number {
	const [, force] = useState(0);
	useEffect(() => {
		if (!enabled) return;
		ensureTicker();
		force(sharedNow);
		const notify = () => force((v) => v + 1);
		tickerListeners.add(notify);
		return () => {
			tickerListeners.delete(notify);
			releaseTicker();
		};
	}, [enabled]);
	return sharedNow;
}

/** Remaining time in the current bar as "mm:ss" / "h:mm:ss", or null when N/A. */
export function useBarCountdown(timeframe: string | undefined, now: number): string | null {
	const intervalMs = parseTimeframeIntervalMs(timeframe);
	if (intervalMs === null) return null;
	const elapsed = now % intervalMs;
	const remaining = elapsed === 0 ? intervalMs : intervalMs - elapsed;
	return formatCountdown(remaining, intervalMs);
}
