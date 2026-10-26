import type { RawOHLCV } from "../types";

export const mockOHLCV300: RawOHLCV[] = Array.from({ length: 300 }, (_, index) => {
	const base = 100 + (index * 0.35);
	const drift = Math.sin(index / 11) * 2.4 + Math.cos(index / 23) * 1.7;
	const open = Number((base + drift).toFixed(4));
	const close = Number((open + Math.sin(index / 7) * 1.1 + Math.cos(index / 17) * 0.8).toFixed(4));
	const high = Number((Math.max(open, close) + 1.25).toFixed(4));
	const low = Number((Math.min(open, close) - 1.15).toFixed(4));
	const volume = 1_000 + (index % 48) * 37;

	return {
		date: new Date(Date.UTC(2024, 0, 1 + index)),
		open,
		high,
		low,
		close,
		volume,
	};
});
