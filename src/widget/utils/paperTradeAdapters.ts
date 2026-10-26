/**
 * WE2 P2-09: paperTradeAdapters
 *
 * Map engine replay types (ReplayPosition / ReplayExecutedTrade) → panel types
 * (PaperTradePosition / PaperTradeJournalEntry) để PaperTradePanel render data thật.
 * Không duplicate logic — chỉ mapping field.
 */

import type { ReplayPosition, ReplayExecutedTrade } from "../../lib/core/replay/replayTradingTypes";
import type { PaperTradePosition, PaperTradeJournalEntry } from "../components/trading/PaperTradePanel";

export function toPaperPosition(pos: ReplayPosition): PaperTradePosition {
	return {
		id: pos.id,
		side: pos.side,
		entryPrice: pos.entryPrice,
		currentPrice: pos.currentPrice,
		quantity: pos.quantity,
		entryBar: pos.entryBarIndex,
		unrealizedPnl: pos.unrealizedPnl,
	};
}

export function toPaperJournal(trade: ReplayExecutedTrade): PaperTradeJournalEntry {
	return {
		id: trade.id,
		side: trade.side === "buy" ? "long" : "short",
		entryPrice: trade.entryPrice,
		exitPrice: trade.exitPrice,
		quantity: trade.quantity,
		pnl: trade.pnl,
		barsHeld: trade.barsHeld,
	};
}
