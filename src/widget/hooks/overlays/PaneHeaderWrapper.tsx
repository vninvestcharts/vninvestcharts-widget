import React, { useState, useRef, type CSSProperties } from "react";
import { PaneHeader, SeriesPicker } from "../../../lib/core";
import type { SeriesConfig, SeriesTypeId, PaneDescriptor } from "../../../lib/core/types/pane-descriptor";

export function PaneHeaderWithPickerWrapper({
	pane,
	onToggleVisible,
	onRemove,
	onQuickAddSeries,
	onQuickRemoveSeries,
	style,
	children,
}: {
	pane: PaneDescriptor;
	onToggleVisible: () => void;
	onRemove: () => void;
	onQuickAddSeries?: (series: SeriesConfig) => void;
	onQuickRemoveSeries?: (seriesType: SeriesTypeId) => void;
	style?: CSSProperties;
	children?: React.ReactNode;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const addRef = useRef<HTMLButtonElement | null>(null);

	return (
		<>
			<PaneHeader
				pane={pane}
				onToggleVisible={onToggleVisible}
				onRemove={onRemove}
				onAddSeries={() => setIsOpen(true)}
				addButtonRef={addRef}
				style={style}
			>
				{children}
			</PaneHeader>
			{isOpen && onQuickAddSeries && (
				<SeriesPicker
					pane={pane}
					onAddSeries={(series) => {
						onQuickAddSeries(series);
						setIsOpen(false);
					}}
					onRemoveSeries={onQuickRemoveSeries ?? (() => {})}
					anchorRef={addRef}
					onClose={() => setIsOpen(false)}
				/>
			)}
		</>
	);
}
