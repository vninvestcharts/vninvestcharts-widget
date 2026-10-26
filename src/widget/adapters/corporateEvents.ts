import { type StockDataAdapter } from "../../lib/types/adapter";
import { type CorporateEvent } from "../components/events/CorporateEventsOverlay";

export function shouldEnableCorporateEvents(symbol: string): boolean {
	const s = (symbol || "").toUpperCase().trim();
	if (s.endsWith("USDT") || s.endsWith("BUSD") || s.endsWith("USDC") || s.endsWith("USD")) return false;
	if (["BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE", "DOT", "AVAX", "LINK"].some((c) => s.startsWith(c))) return false;
	return true;
}

export interface CorporateEventsFetchOptions {
	/**
	 * Demo-only escape hatch. Production must leave this false/undefined so a
	 * missing or failed adapter returns no events instead of fabricated ones.
	 */
	allowMockEvents?: boolean;
}

export async function fetchCorporateEvents(
	adapter: StockDataAdapter | undefined | null,
	symbol: string,
	from: number,
	to: number,
	plotData: any[] = [],
	options: CorporateEventsFetchOptions = {}
): Promise<CorporateEvent[]> {
	if (!shouldEnableCorporateEvents(symbol)) {
		return [];
	}
	if (!adapter || typeof adapter.fetchCorporateEvents !== "function") {
		if (options.allowMockEvents) return generateMockEvents(plotData);
		console.warn("Corporate events unavailable: adapter has no fetchCorporateEvents; returning empty");
		return [];
	}
	try {
		const rawEvents = await adapter.fetchCorporateEvents(symbol, from, to);
		return mapToCorporateEvents(rawEvents, plotData);
	} catch (err) {
		if (options.allowMockEvents) return generateMockEvents(plotData);
		console.warn("Failed to fetch corporate events from adapter; returning empty", err);
		return [];
	}
}

function mapToCorporateEvents(rawEvents: any[], plotData: any[]): CorporateEvent[] {
	if (!Array.isArray(rawEvents)) return [];
	return rawEvents.map((evt, idx) => {
		const timestamp = typeof evt.timestamp === "number" ? evt.timestamp : (evt.date ? new Date(evt.date).getTime() : Date.now());
		const dateStr = evt.date || new Date(timestamp).toISOString();

		// Find closest index in plotData based on timestamp
		let timeIndex = -1;
		if (plotData.length > 0) {
			let minDiff = Infinity;
			for (let i = 0; i < plotData.length; i++) {
				const d = plotData[i]?.date;
				if (d) {
					const diff = Math.abs(d.getTime() - timestamp);
					if (diff < minDiff) {
						minDiff = diff;
						timeIndex = i;
					}
				}
			}
		}

		return {
			id: evt.id || `evt-${idx}-${timestamp}`,
			type: (evt.type === "D" || evt.type === "E" || evt.type === "N" || evt.type === "S") ? evt.type : "N",
			timeIndex: timeIndex !== -1 ? timeIndex : idx,
			timestamp,
			date: dateStr,
			label: evt.label || evt.type || "N",
			title: evt.title || "Sự kiện doanh nghiệp",
			description: evt.description || "",
			data: evt.data || {},
		};
	});
}

/** Demo-only fixture. Never render this as production market data. */
export function generateMockEvents(plotData: any[]): CorporateEvent[] {
	if (!plotData || plotData.length < 50) return [];

	const idxDiv = Math.round(plotData.length * 0.85);
	const idxEarn = Math.round(plotData.length * 0.65);
	const idxSplit = Math.round(plotData.length * 0.45);
	const idxNews = Math.round(plotData.length * 0.25);

	return [
		{
			id: "evt-div",
			type: "D",
			timeIndex: idxDiv,
			timestamp: plotData[idxDiv]?.date?.getTime() || Date.now(),
			date: plotData[idxDiv]?.date?.toISOString() || new Date().toISOString(),
			label: "D",
			title: "Cổ tức tiền mặt 15%",
			description: "Tỷ lệ thực hiện: 15% (1,500đ/cp). Ngày chi trả: 25/08/2026.",
			data: {},
		},
		{
			id: "evt-earn",
			type: "E",
			timeIndex: idxEarn,
			timestamp: plotData[idxEarn]?.date?.getTime() || Date.now(),
			date: plotData[idxEarn]?.date?.toISOString() || new Date().toISOString(),
			label: "E",
			title: "Báo cáo Q2/2026",
			description: "Doanh thu tăng trưởng 25% YoY. LNST đạt 1,200 tỷ đồng.",
			data: {},
		},
		{
			id: "evt-split",
			type: "S",
			timeIndex: idxSplit,
			timestamp: plotData[idxSplit]?.date?.getTime() || Date.now(),
			date: plotData[idxSplit]?.date?.toISOString() || new Date().toISOString(),
			label: "S",
			title: "Chia tách cổ phiếu 2:1",
			description: "Tỷ lệ phân bổ: 2:1. Ngày giao dịch bổ sung: 10/08/2026.",
			data: {},
		},
		{
			id: "evt-news",
			type: "N",
			timeIndex: idxNews,
			timestamp: plotData[idxNews]?.date?.getTime() || Date.now(),
			date: plotData[idxNews]?.date?.toISOString() || new Date().toISOString(),
			label: "N",
			title: "Ký hợp đồng xuất khẩu lớn",
			description: "Hợp đồng trị giá 50 triệu USD xuất khẩu sang thị trường Mỹ.",
			data: {},
		}
	];
}
