import type { WidgetMessages } from "./types";

/**
 * UX-03: labels for the visually-hidden chart summary that acts as the DOM
 * alternative for the engine canvas. Kept in its own module (like
 * `dock.messages.*`) because `messages.{en,vi}.ts` sit at their frozen
 * fat-file budget and new UI text must not push them over.
 */
export const a11yMessagesEn: WidgetMessages = {
	"a11y.chart.symbol": "Symbol",
	"a11y.chart.timeframe": "Timeframe",
	"a11y.chart.ohlc": "OHLC",
	"a11y.chart.bars": "Bars",
	"a11y.chart.visibleRange": "Visible range",
	"a11y.chart.status": "Status",
	"a11y.chart.noData": "No data",
};
