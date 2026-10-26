import type { EngineOverlayDrawingPrimitiveInput, PaneRuntimeSnapshot, VisibleRange as EngineVisibleRange } from "@vninvestcharts/engine-core";
import { createPaneProjector } from "@vninvestcharts/engine-core";
import type { ReplayExecutedTrade, ReplayPosition } from "./replayTradingTypes";

export interface TradeMarkerInput {
  positions: readonly ReplayPosition[];
  closedTrades: readonly ReplayExecutedTrade[];
}

export function createReplayTradeMarkerInputs(
	input: TradeMarkerInput,
	paneSnapshot: PaneRuntimeSnapshot,
	visibleRange: EngineVisibleRange,
	scaleSlotId: string,
): EngineOverlayDrawingPrimitiveInput[] {
	const projector = createPaneProjector(paneSnapshot, visibleRange, scaleSlotId);
	const { plotBounds } = paneSnapshot;
	const results: EngineOverlayDrawingPrimitiveInput[] = [];
	const paneId = paneSnapshot.paneId;

	for (const pos of input.positions) {
		const entryX = projector.indexToPixelX(pos.entryBarIndex);
		const entryY = projector.valueToPixelY(pos.entryPrice);
		const currentY = projector.valueToPixelY(pos.currentPrice);
		if (entryX == null || entryY == null || currentY == null) continue;

		const color = pos.side === "long" ? "#22bb5c" : "#d7324b";
		const arrow = pos.side === "long" ? "\u2191" : "\u2193";

		results.push({
			key: `pos-entry-line-${pos.id}`,
			paneId,
			scaleSlotId,
			primitive: {
				type: "text",
				points: [{ x: plotBounds.left + 4, y: entryY - 4 }],
				style: { fill: color, stroke: color, strokeWidth: 1, fontSize: 11, opacity: 0.8 },
				text: `${arrow} Entry ${pos.entryPrice.toFixed(2)}`,
			},
			selected: false,
			clipToPane: true,
		});

		if (pos.stopLoss != null) {
			const slY = projector.valueToPixelY(pos.stopLoss);
			if (slY != null) {
				results.push({
					key: `pos-sl-${pos.id}`,
					paneId,
					scaleSlotId,
					primitive: {
						type: "text",
						points: [{ x: plotBounds.left + 4, y: slY - 4 }],
						style: { fill: "#d7324b", stroke: "#d7324b", strokeWidth: 1, fontSize: 10, opacity: 0.7 },
						text: `SL ${pos.stopLoss.toFixed(2)}`,
					},
					selected: false,
					clipToPane: true,
				});
			}
		}

		if (pos.takeProfit != null) {
			const tpY = projector.valueToPixelY(pos.takeProfit);
			if (tpY != null) {
				results.push({
					key: `pos-tp-${pos.id}`,
					paneId,
					scaleSlotId,
					primitive: {
						type: "text",
						points: [{ x: plotBounds.left + 4, y: tpY - 4 }],
						style: { fill: "#22bb5c", stroke: "#22bb5c", strokeWidth: 1, fontSize: 10, opacity: 0.7 },
						text: `TP ${pos.takeProfit.toFixed(2)}`,
					},
					selected: false,
					clipToPane: true,
				});
			}
		}

		const pnlColor = pos.unrealizedPnl >= 0 ? "#22bb5c" : "#d7324b";
		const pnlText = `${pos.unrealizedPnl >= 0 ? "+" : ""}${pos.unrealizedPnl.toFixed(2)}`;
		results.push({
			key: `pos-pnl-${pos.id}`,
			paneId,
			scaleSlotId,
			primitive: {
				type: "text",
				points: [{ x: entryX + 8, y: currentY }],
				style: { fill: pnlColor, stroke: pnlColor, strokeWidth: 1, fontSize: 11, opacity: 0.9 },
				text: `${arrow} ${pnlText}`,
			},
			selected: false,
			clipToPane: true,
		});
	}

	for (const trade of input.closedTrades) {
		const exitX = projector.indexToPixelX(trade.exitBarIndex);
		const exitY = projector.valueToPixelY(trade.exitPrice);
		if (exitX == null || exitY == null) continue;

		const pnlColor = trade.pnl >= 0 ? "#22bb5c" : "#d7324b";
		const arrow = trade.side === "buy" ? "\u2191" : "\u2193";
		const pnlText = `${trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}`;

		results.push({
			key: `trade-exit-${trade.id}`,
			paneId,
			scaleSlotId,
			primitive: {
				type: "text",
				points: [{ x: exitX + 4, y: exitY - 4 }],
				style: { fill: pnlColor, stroke: pnlColor, strokeWidth: 1, fontSize: 11, opacity: 0.9 },
				text: `\u2715 ${arrow} ${trade.exitPrice.toFixed(2)} ${pnlText}`,
			},
			selected: false,
			clipToPane: true,
		});
	}

	return results;
}
