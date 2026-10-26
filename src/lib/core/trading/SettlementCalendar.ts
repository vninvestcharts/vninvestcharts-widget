// Task 01: SettlementCalendar — ngày chứng khoán về khả dụng (T+2 VN).
// Ngày lễ inject từ config (seed 2024–2027); ngoài phạm vi seed chỉ trừ T7/CN.
export class SettlementCalendar {
	private static holidaysVN: Set<string> = new Set([
		"2024-01-01",
		"2024-02-08",
		"2024-02-09",
		"2024-02-12",
		"2024-02-13",
		"2024-02-14",
		"2024-04-18",
		"2024-04-30",
		"2024-05-01",
		"2024-09-02",
		"2025-01-01",
		"2025-01-27",
		"2025-01-28",
		"2025-01-29",
		"2025-01-30",
		"2025-01-31",
		"2025-04-07",
		"2025-04-30",
		"2025-05-01",
		"2025-09-01",
		"2025-09-02",
		"2026-01-01",
		"2026-02-16",
		"2026-02-17",
		"2026-02-18",
		"2026-02-19",
		"2026-02-20",
		"2026-04-26",
		"2026-04-30",
		"2026-05-01",
		"2026-09-02",
		"2026-09-03",
		"2027-01-01",
	]);

	static configure(holidaysVN: string[]): void {
		this.holidaysVN = new Set(holidaysVN);
	}

	static isTradingDay(date: Date): boolean {
		const day = date.getDay();
		if (day === 0 || day === 6) return false;
		const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
			date.getDate(),
		).padStart(2, "0")}`;
		return !this.holidaysVN.has(ymd);
	}

	/**
	 * Timestamp chứng khoán về khả dụng. T+0 trả ngay; T+N cộng N ngày giao dịch
	 * rồi chốt 13:00 ngày cuối (giờ địa phương, tránh lệch TZ của toISOString).
	 */
	static calculateSettlementTimestamp(tradeTimestamp: number, settlementDays = 2): number {
		if (settlementDays <= 0) return tradeTimestamp;
		const d = new Date(tradeTimestamp);
		let added = 0;
		while (added < settlementDays) {
			d.setDate(d.getDate() + 1);
			if (this.isTradingDay(d)) {
				added += 1;
			}
		}
		d.setHours(13, 0, 0, 0);
		return d.getTime();
	}
}
