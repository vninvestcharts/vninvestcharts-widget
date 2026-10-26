import { describe, it, expect } from "vitest";
import { buildCsv, downloadCsv, ordersToRows, toCsvCell, tradesToRows } from "../csvExport";

// Task TVP-A4: CSV escape + BOM + jsdom guard.
describe("csvExport", () => {
	it("escape phẩy/ngoặc kép/xuống dòng", () => {
		expect(toCsvCell("FPT")).toBe("FPT");
		expect(toCsvCell("a,b")).toBe('"a,b"');
		expect(toCsvCell('a"b')).toBe('"a""b"');
		expect(toCsvCell("a\nb")).toBe('"a\nb"');
		expect(toCsvCell(null)).toBe("");
		expect(toCsvCell(128500)).toBe("128500");
	});

	it("buildCsv nối headers + rows", () => {
		expect(buildCsv(["a", "b"], [[1, "x,y"]])).toBe("a,b\n1,\"x,y\"");
	});

	it("ordersToRows/tradesToRows đủ cột", () => {
		const orders = ordersToRows([
			{
				id: "ord_1",
				clientOrderId: "c1",
				symbol: "FPT",
				side: "buy",
				type: "limit",
				status: "filled",
				quantity: 100,
				filledQuantity: 100,
				price: 127000,
				timeInForce: "GTC",
				createdAt: 1000,
				updatedAt: 2000,
			},
		]);
		expect(orders.headers).toContain("status");
		expect(orders.rows[0][3]).toBe("limit");
		expect(orders.rows[0][5]).toBe(127000);
		const trades = tradesToRows([
			{ timestamp: 3, realizedPnl: 650000, commission: 13500, tax: 13500, symbol: "FPT", side: "long", quantity: 100, entryPrice: 128500, exitPrice: 135000 },
		]);
		expect(trades.rows[0][5]).toBe(650000);
	});

	it("downloadCsv trả false an toàn khi thiếu API (jsdom)", () => {
		expect(downloadCsv("paper.csv", "a,b\n1,2")).toBe(false);
	});
});
