export type { StockDataAdapter, Timeframe, Trade, OrderbookSnapshot, SymbolInfo, Unsubscribe } from "./StockDataAdapter";
export { BaseAdapter } from "./BaseAdapter";
export { DjangoVnstockAdapter, createRestAdapter } from "./DjangoVnstockAdapter";
export { MockAdapter, createMockBars } from "./MockAdapter";
export type {
	CoverageMode,
	SessionModel,
	FinalityMode,
	GapReason,
	CoverageFragment,
	SourceSemanticsDescriptor,
} from "@vninvestcharts/engine-core";

// CE20: DataAdapter abstraction for demo data fetching
export type {
	DataAdapter,
	KLineBar,
	GetBarsType,
	GetBarsParams,
	GetBarsResult,
	CanonicalFetchResult,
} from "./DataAdapter";
export { BinanceAdapter, binanceAdapter } from "./BinanceAdapter";
export { LocalCacheAdapter } from "./LocalCacheAdapter";
export { VNStocksAdapter } from "./VNStocksAdapter";
export { UDFDataAdapter } from "./UDFDataAdapter";
export type { UDFDataAdapterConfig } from "./UDFDataAdapter";
export { CSVAdapter } from "./CSVAdapter";
export { RESTAdapter } from "./RESTAdapter";
export { WSAdapter } from "./WSAdapter";
export { DBAdapter } from "./DBAdapter";