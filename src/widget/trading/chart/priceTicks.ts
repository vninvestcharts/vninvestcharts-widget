// Task 08: làm tròn giá theo bước tick (dùng khi drag SL/TP + preview).
export function roundToTick(price: number, tickSize: number): number {
	if (!Number.isFinite(price) || !Number.isFinite(tickSize) || tickSize <= 0) return price;
	return Math.round(price / tickSize) * tickSize;
}
