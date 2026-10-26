/**
 * Symbol search SSOT types (SYMBOL_SEARCH P1).
 * Single shared item shape for VNSymbolSearch + compare picker.
 */
export interface SymbolSearchItem {
	symbol: string;
	company_name: string;
	exchange: string;
}
