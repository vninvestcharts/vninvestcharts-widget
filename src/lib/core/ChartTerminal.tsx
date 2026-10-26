import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { Fragment } from "react";
import type { StockDataAdapter } from "../types/adapter";
import type { OHLCVBar } from "../types/ohlcv";
import type { PaneConfig } from "../types/pane";
import { ChartPane } from "./ChartPane";
import { PaneSplitter } from "./PaneSplitter";
import { DataProvider } from "./context/DataContext";
import { PaneManagerProvider } from "./context/PaneManagerContext";
import { usePaneManager, type PaneInput } from "./hooks/usePaneManager";

export interface ChartTerminalProps extends HTMLAttributes<HTMLElement> {
	data: readonly OHLCVBar[];
	panes: readonly PaneInput[];
	adapter?: StockDataAdapter;
	children?: ReactNode;
}

export function ChartTerminal({ data, panes, adapter, children, className, style, ...rest }: ChartTerminalProps) {
	const paneState = usePaneManager(panes);

	const mergedStyle: CSSProperties = {
		display: "flex",
		flexDirection: "column",
		gap: 0,
		width: "100%",
		height: "100%",
		minHeight: 0,
		...style,
	};

	return (
		<PaneManagerProvider value={paneState}>
			<DataProvider value={{ data, adapter }}>
				<section {...rest} className={className} style={mergedStyle}>
					{paneState.panes.map((pane, index) => (
						<Fragment key={pane.id}>
							<ChartPane pane={pane} />
							{index < paneState.panes.length - 1 ? (
								<PaneSplitter onResize={(heightPx) => paneState.resizePane(pane.id, heightPx)} />
							) : null}
						</Fragment>
					))}
					{children}
				</section>
			</DataProvider>
		</PaneManagerProvider>
	);
}

export type { PaneInput } from "./hooks/usePaneManager";