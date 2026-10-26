/**
 * CellPricePaneHeader — hàng toolbar của ô multi + 4 cờ `statusLine` (UIUX_STATUSLINE_MULTI).
 *
 * VÌ SAO CẦN wrapper riêng:
 *   `GridContainer` render `PricePaneHeader` trong một **callback** (`handleRenderPaneToolbar`) ⇒ không
 *   gọi được hook ở đó (Rules of Hooks) ⇒ tách 1 component để gọi `useCellStatusLineSettings`.
 *
 * Hành vi: mặc định (4 cờ ON) ⇒ **không đổi** gì so với trước; khi user tắt cờ trong tab
 * "Dòng trạng thái" ⇒ ô multi ẩn đúng phần tương ứng (mã / O-H-L-C / % / Vol).
 */
import React from "react";
import type { StorageAdapter } from "@vninvestcharts/engine-react";
import { PricePaneHeader, type PricePaneHeaderProps } from "../canvas/PricePaneHeader";
import { useCellStatusLineSettings } from "../../hooks/useCellStatusLineSettings";

export interface CellPricePaneHeaderProps extends PricePaneHeaderProps {
	storageAdapter?: StorageAdapter;
}

export const CellPricePaneHeader: React.FC<CellPricePaneHeaderProps> = ({ storageAdapter, ...props }) => {
	const flags = useCellStatusLineSettings(props.chartId, storageAdapter);
	return (
		<PricePaneHeader
			{...props}
			showTicker={flags.showTicker}
			showOHLC={flags.showOHLC}
			showBarChange={flags.showBarChange}
			showVolume={flags.showVolume}
		/>
	);
};
