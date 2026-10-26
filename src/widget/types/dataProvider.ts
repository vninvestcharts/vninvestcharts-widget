import { type OHLCVBar, type SymbolInfo } from "../../lib/types/adapter";

export interface IChartDataProvider {
  fetchBars(symbol: string, timeframe: string, from: number, to: number): Promise<readonly OHLCVBar[]>;
  subscribeBars(
    symbol: string,
    timeframe: string,
    onBar: (bar: OHLCVBar) => void
  ): () => void;  // returns unsubscribe
  searchSymbols(query: string): Promise<readonly SymbolInfo[]>;
  getServerTime?(): Promise<number>;
  fetchCorporateEvents?(symbol: string, from: number, to: number): Promise<any[]>;
}
