/**
 * WE2 P2-09: WorkspaceReplayTradingContext
 *
 * Holds a SINGLE shared replay-trading session (ReplayOrderBook + analytics)
 * at the VNInvestMultiCharts (parent) level. Per DECISION-1 / H3 (workspace-level,
 * chốt 2026-07-17): paper trade là 1 session chung cho toàn bộ workspace.
 *
 * Chỉ chart ACTIVE mới feed bars vào shared order book (qua `feedBar`), tránh
 * trộn lẫn bars khi các chart có symbol khác nhau. Mọi chart đọc chung
 * `positions` / `closedTrades` từ singleton này.
 */

import { createContext, useContext } from "react";
import type { UseReplayTradingResult } from "../hooks/useReplayTrading";

export interface WorkspaceReplayTradingValue extends UseReplayTradingResult {
	/** Task 11: broker bên dưới (cho multi-chart panel + sync). Luôn set sau render đầu. */
	broker: import("../../lib/core/trading/VirtualBrokerEngine").VirtualBrokerEngine;
	/** Task 11: ring buffer log fills/closes (cap 200) cho TradingLogTab. */
	log: Array<{ timestamp: number; message: string }>;
	/** Task 11: hủy lệnh chờ theo id. */
	cancelOrder: (orderId: string) => boolean;
	/** Task 11: đóng + mở ngược chiều tại mark hiện tại. */
	reversePosition: (positionId: string) => void;
	/** Active chart gọi mỗi khi currentBar đổi để xử lý fills vào shared order book. symbol = symbol của chart active (dùng để reset khi đổi symbol). Truyền `bars` để process queue đầy đủ khi tua nhanh (F6 fix). */
	feedBar: (bar: import("../../lib/core/replay/replayTradingTypes").ReplayOHLCBar, currentBar: number, timestamp?: number, symbol?: string, bars?: readonly import("../../lib/core/replay/replayTradingTypes").ReplayOHLCBar[]) => void;
	/** A6: chart đang sở hữu phiên replay dùng chung (null = idle). */
	sessionOwnerId: string | null;
	/** A6: claim quyền sở hữu khi user bắt đầu replay trên một chart. */
	claimSessionOwner: (chartId: string) => void;
	/** A6: nhả quyền sở hữu + reset sổ khi kết thúc phiên. */
	clearSessionOwner: () => void;
	/** Chart sở hữu có đang replay không (để các chart khác biết có feed hay không). */
	isReplayActive: boolean;
	/** F-11: reset shared order book + analytics khi master chart đổi (không giữ position của master cũ). */
	resetForNewMaster: (masterId: string | null) => void;
}

const defaultValue: WorkspaceReplayTradingValue = undefined as unknown as WorkspaceReplayTradingValue;

export const WorkspaceReplayTradingContext = createContext<WorkspaceReplayTradingValue>(defaultValue);

export function useWorkspaceReplayTrading(): WorkspaceReplayTradingValue {
	const ctx = useContext(WorkspaceReplayTradingContext);
	if (ctx === defaultValue) {
		throw new Error("useWorkspaceReplayTrading must be used within WorkspaceReplayTradingProvider");
	}
	return ctx;
}

export function useOptionalWorkspaceReplayTrading(): WorkspaceReplayTradingValue | undefined {
	const ctx = useContext(WorkspaceReplayTradingContext);
	return ctx === defaultValue ? undefined : ctx;
}
