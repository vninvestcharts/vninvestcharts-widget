/**
 * WP-05: Widget adapters index.
 *
 * Optional subpath import — NOT bundled in core IIFE.
 * Usage:
 *   import { VNInvestDataAdapter } from '@vninvestcharts/widget/adapters';
 */

export { VNInvestClient, resolveApiBase, TIMEFRAME_MAP } from "./VNInvestClient";
export type {
	VNIBarsParams,
	VNIBarsPageResponse,
	BarsHotWindowTelemetry,
	BarsHotWindowLoadGateStatus,
	BarsHotWindowLoadGateThresholds,
	BarsHotWindowLoadGateReport,
} from "./VNInvestClient";

export { VNInvestWebSocketClient } from "./VNInvestWebSocketClient";
export type {
	TickerUpdateEvent,
	WhaleAlertWSEvent,
	VNIWSEvent,
} from "./VNInvestWebSocketClient";

export { VNInvestDataAdapter } from "./VNInvestDataAdapter";
export type { VNInvestDataAdapterConfig } from "./VNInvestDataAdapter";

export { normalizeBarsPagingMeta, buildBackwardPageRequest } from "./barsPagingPolicy";
export type { BarsPagingMeta } from "./barsPagingPolicy";

export { useWatchlistRealtimeSync } from "./watchlistRealtimeSync";
export type { UseWatchlistRealtimeSyncOptions } from "./watchlistRealtimeSync";

export { ContinuousFuturesStockDataAdapter } from "./ContinuousFuturesStockDataAdapter";

export { MultiSourceDataAdapter } from "./MultiSourceDataAdapter";
export type { MultiSourceDataAdapterConfig, SourceRoute } from "./MultiSourceDataAdapter";
