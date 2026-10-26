/**
 * useCellStatusLineSettings — 4 cờ `statusLine` cho ô multi (UIUX_STATUSLINE_MULTI).
 *
 * VÌ SAO CẦN:
 *   Ô multi không render `OHLCHeader` (cell pin `showHeader={false}`) ⇒ hàng toolbar của ô là
 *   `PricePaneHeader` (`GridContainer.tsx:389`) — và nó **không** nằm trong `SettingsContext` của chart
 *   ⇒ đọc không được `settings.statusLineSettings`. Sau khi sóng W2 bỏ dải header trùng, 4 cờ
 *   `statusLine` (showTicker / showOhlc / showBarChange / showVolume) **chết** ở multi.
 *
 * CÁCH LÀM:
 *   - đọc composite **scoped theo chartId** (`vnsc_chart_settings_v1[_<chartId>]`) qua
 *     `readScopedSetting` — **adapter-first**, đúng thứ tự app đọc (`storageKeys.ts:33-50`);
 *   - nghe `vnsc-settings-sync` và lọc theo `chartId` (`shouldAcceptSettingsEvent`) ⇒ cờ áp dụng
 *     **live** khi user đổi setting trong workspace (không cần reload).
 *
 * ALIAS: khoá lưu thật là `showOhlc` (`chartSettingsSchema.ts:32`, `StatusLineSettingsTab.tsx:47`);
 *   `showOHLC` là tên legacy mà `useWidgetSettings.ts:440` vẫn hỗ trợ ⇒ dùng **đúng** biểu thức alias đó.
 */
import { useEffect, useMemo, useState } from "react";
import type { StorageAdapter } from "@vninvestcharts/engine-react";
import { LEGACY_COMPOSITE_KEY, readScopedSetting, shouldAcceptSettingsEvent } from "../components/settings/storageKeys";

export interface CellStatusLineFlags {
	showTicker: boolean;
	showOHLC: boolean;
	showBarChange: boolean;
	showVolume: boolean;
}

const DEFAULT_FLAGS: CellStatusLineFlags = {
	showTicker: true,
	showOHLC: true,
	showBarChange: true,
	showVolume: true,
};

/** Đọc 4 cờ từ 1 section `statusLine` (hỗ trợ alias `showOHLC` legacy). */
export function readCellStatusLineFlags(section: Record<string, unknown> | null | undefined): CellStatusLineFlags {
	const sl = section ?? {};
	return {
		showTicker: sl.showTicker !== false,
		showOHLC: (sl.showOhlc ?? sl.showOHLC) !== false,
		showBarChange: sl.showBarChange !== false,
		showVolume: sl.showVolume !== false,
	};
}

function readFlagsFromStorage(storageAdapter: StorageAdapter | undefined, chartId: string | null | undefined): CellStatusLineFlags {
	const raw = readScopedSetting(storageAdapter, LEGACY_COMPOSITE_KEY, chartId);
	if (!raw) return DEFAULT_FLAGS;
	try {
		const parsed = JSON.parse(raw) as { statusLine?: Record<string, unknown> };
		return readCellStatusLineFlags(parsed.statusLine);
	} catch {
		return DEFAULT_FLAGS;
	}
}

export function useCellStatusLineSettings(
	chartId: string | null | undefined,
	storageAdapter?: StorageAdapter,
): CellStatusLineFlags {
	const [flags, setFlags] = useState<CellStatusLineFlags>(() => readFlagsFromStorage(storageAdapter, chartId));

	useEffect(() => {
		setFlags(readFlagsFromStorage(storageAdapter, chartId));
	}, [chartId, storageAdapter]);

	useEffect(() => {
		/* eslint-disable-next-line no-restricted-globals */
		if (typeof window === "undefined") return;
		const onSync = (event: Event) => {
			const detail = (event as CustomEvent).detail as
				| { chartId?: string | null; state?: { statusLine?: Record<string, unknown> } }
				| undefined;
			if (!detail) return;
			if (!shouldAcceptSettingsEvent(chartId ?? null, detail.chartId ?? null)) return;
			const section = detail.state?.statusLine;
			if (!section) return;
			setFlags(readCellStatusLineFlags(section));
		};
		/* eslint-disable-next-line no-restricted-globals */
		window.addEventListener("vnsc-settings-sync", onSync);
		return () => {
			/* eslint-disable-next-line no-restricted-globals */
			window.removeEventListener("vnsc-settings-sync", onSync);
		};
	}, [chartId]);

	return useMemo(() => flags, [flags]);
}
