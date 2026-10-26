/**
 * P2 unified compare entry (SYMBOL_SEARCH): one modal hosting VNSymbolSearch
 * mode="unified" (Switch + Compare per row). Shared by single + multi chart
 * so both surfaces render the identical dialog.
 */
import type { StockDataAdapter } from "../../../lib/types/adapter";
import type { VNInvestClient } from "../../adapters/VNInvestClient";
import type { ComparisonOverlayEntry } from "../../hooks/useComparisonState";
import { SymbolSearchModal } from "./SymbolSearchModal";
import { VNSymbolSearch } from "./VNSymbolSearch";

export interface SymbolCompareModalProps {
	adapter?: StockDataAdapter;
	client?: VNInvestClient;
	/** Current main-chart symbol — matching rows render disabled (no self-compare). */
	mainSymbol?: string;
	/** Main-symbol switch (caller also closes the dialog). Unused while allowSwitch is false. */
	onSwitch: (symbol: string) => void;
	onTimeframeChange?: (timeframe: string) => void;
	existing: string[];
	entries?: ComparisonOverlayEntry[];
	onAdd: (symbolId: string) => void;
	onRemove: (symbolId: string) => void;
	onUpdate?: (symbolId: string, partial: Partial<ComparisonOverlayEntry>) => void;
	onClose: () => void;
}

export function SymbolCompareModal(p: SymbolCompareModalProps) {
	return (
		<SymbolSearchModal open onClose={p.onClose}>
			<VNSymbolSearch mode="unified" flat defaultAction="compare" allowSwitch={false} mainSymbol={p.mainSymbol} adapter={p.adapter} client={p.client}
				onChange={p.onSwitch} onTimeframeChange={p.onTimeframeChange}
				compare={{ existing: p.existing, entries: p.entries, onAdd: p.onAdd, onRemove: p.onRemove, onUpdate: p.onUpdate }} />
		</SymbolSearchModal>
	);
}
