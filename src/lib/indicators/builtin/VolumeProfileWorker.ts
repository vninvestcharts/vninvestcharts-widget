import { computeVolumeProfile, type VolumeProfileData } from "../utils";

export interface VolumeProfileWorkerRequest {
	readonly requestId: number;
	readonly data: any[];
	readonly priceTickSize: number;
	readonly range?: { from: number; to: number };
}

export interface VolumeProfileWorkerResponse {
	readonly requestId: number;
	readonly result?: VolumeProfileData;
	readonly error?: string;
}

const VOLUME_PROFILE_WORKER_CODE = `
function synthesizeTicksFromBar(bar, tickSize) {
	var ticks = [];
	var high = bar.high;
	var low = bar.low;
	var open = bar.open !== undefined && bar.open !== null ? bar.open : bar.close;
	var close = bar.close;
	var volume = bar.volume;
	var ts = bar.date ? (bar.date instanceof Date ? bar.date.getTime() : (typeof bar.date === "string" ? new Date(bar.date).getTime() : (typeof bar.date === "number" ? bar.date : Date.now()))) : Date.now();

	var safeTickSize = tickSize > 0 ? tickSize : 0.01;
	var priceRange = high - low;
	var steps = Math.max(1, Math.round(priceRange / safeTickSize)) + 1;
	var volumePerStep = volume / steps;

	var isUp = close >= open;
	var side = isUp ? "buy" : "sell";

	for (var i = 0; i < steps; i++) {
		var price = Math.round((low + i * safeTickSize) / safeTickSize) * safeTickSize;
		ticks.push({
			timestamp: ts,
			price: price,
			size: volumePerStep,
			side: side
		});
	}
	return ticks;
}

function computeVolumeProfile(data, priceTickSize, range) {
	var safeTickSize = priceTickSize > 0 ? priceTickSize : 0.01;

	var ticks = [];
	if (data.length > 0) {
		if ("close" in data[0]) {
			for (var i = 0; i < data.length; i++) {
				var barTicks = synthesizeTicksFromBar(data[i], safeTickSize);
				for (var j = 0; j < barTicks.length; j++) {
					ticks.push(barTicks[j]);
				}
			}
		} else {
			ticks = data;
		}
	}

	if (range) {
		ticks = ticks.filter(function(t) {
			return t.price >= range.from && t.price <= range.to;
		});
	}

	if (ticks.length === 0) {
		return {
			priceLevels: [],
			poc: 0,
			valueAreaHigh: 0,
			valueAreaLow: 0,
			highVolumeNodes: [],
			lowVolumeNodes: []
		};
	}

	var aggMap = new Map();
	for (var i = 0; i < ticks.length; i++) {
		var tick = ticks[i];
		var roundedPrice = Math.round(tick.price / safeTickSize) * safeTickSize;
		if (!aggMap.has(roundedPrice)) {
			aggMap.set(roundedPrice, { volume: 0, buyVolume: 0, sellVolume: 0 });
		}
		var level = aggMap.get(roundedPrice);
		level.volume += tick.size;
		if (tick.side === "buy") {
			level.buyVolume += tick.size;
		} else {
			level.sellVolume += tick.size;
		}
	}

	var entries = Array.from(aggMap.entries());
	var priceLevels = [];
	for (var i = 0; i < entries.length; i++) {
		var price = entries[i][0];
		var val = entries[i][1];
		priceLevels.push({
			price: price,
			volume: val.volume,
			buyVolume: val.buyVolume,
			sellVolume: val.sellVolume
		});
	}
	priceLevels.sort(function(a, b) {
		return a.price - b.price;
	});

	var poc = 0;
	var maxVolume = -1;
	for (var i = 0; i < priceLevels.length; i++) {
		var lvl = priceLevels[i];
		if (lvl.volume > maxVolume) {
			maxVolume = lvl.volume;
			poc = lvl.price;
		}
	}

	var totalVolume = 0;
	for (var i = 0; i < priceLevels.length; i++) {
		totalVolume += priceLevels[i].volume;
	}
	var targetVolume = totalVolume * 0.70;

	var vaHigh = poc;
	var vaLow = poc;

	if (priceLevels.length > 1) {
		var pocIndex = -1;
		for (var i = 0; i < priceLevels.length; i++) {
			if (priceLevels[i].price === poc) {
				pocIndex = i;
				break;
			}
		}
		if (pocIndex === -1) pocIndex = 0;
		var left = pocIndex;
		var right = pocIndex;
		var currentVolume = priceLevels[pocIndex].volume;

		while (currentVolume < targetVolume && (left > 0 || right < priceLevels.length - 1)) {
			var upVol = right + 1 < priceLevels.length ? priceLevels[right + 1].volume : 0;
			var downVol = left - 1 >= 0 ? priceLevels[left - 1].volume : 0;

			if (upVol >= downVol && right < priceLevels.length - 1) {
				right += 1;
				currentVolume += priceLevels[right].volume;
			} else if (left > 0) {
				left -= 1;
				currentVolume += priceLevels[left].volume;
			} else if (right < priceLevels.length - 1) {
				right += 1;
				currentVolume += priceLevels[right].volume;
			}
		}

		vaHigh = priceLevels[right].price;
		vaLow = priceLevels[left].price;
	}

	var highVolumeNodes = [];
	var lowVolumeNodes = [];
	var avgVolume = totalVolume / priceLevels.length;

	for (var i = 1; i < priceLevels.length - 1; i++) {
		var prev = priceLevels[i - 1].volume;
		var curr = priceLevels[i].volume;
		var next = priceLevels[i + 1].volume;

		if (curr > prev && curr > next && curr > avgVolume) {
			highVolumeNodes.push(priceLevels[i].price);
		}
		if (curr < prev && curr < next && curr > 0 && curr < avgVolume) {
			lowVolumeNodes.push(priceLevels[i].price);
		}
	}

	return {
		priceLevels: priceLevels,
		poc: poc,
		valueAreaHigh: vaHigh,
		valueAreaLow: vaLow,
		highVolumeNodes: highVolumeNodes,
		lowVolumeNodes: lowVolumeNodes
	};
}

self.onmessage = function(event) {
	var requestId = event.data.requestId;
	var data = event.data.data;
	var priceTickSize = event.data.priceTickSize;
	var range = event.data.range;
	try {
		var result = computeVolumeProfile(data, priceTickSize, range);
		self.postMessage({ requestId: requestId, result: result });
	} catch (error) {
		self.postMessage({ requestId: requestId, error: error instanceof Error ? error.message : String(error) });
	}
};
`;

let nextRequestId = 1;

export function computeVolumeProfileAsync(
	data: any[],
	priceTickSize: number,
	range?: { from: number; to: number }
): Promise<VolumeProfileData> {
	if (typeof Blob === "undefined" || typeof URL === "undefined" || typeof Worker === "undefined") {
		// Non-browser / SSR fallback
		return Promise.resolve(computeVolumeProfile(data, priceTickSize, range));
	}

	return new Promise((resolve, reject) => {
		const blob = new Blob([VOLUME_PROFILE_WORKER_CODE], { type: "application/javascript" });
		const workerUrl = URL.createObjectURL(blob);
		const worker = new Worker(workerUrl);
		const requestId = nextRequestId++;

		const cleanup = () => {
			worker.terminate();
			URL.revokeObjectURL(workerUrl);
		};

		worker.onmessage = (event) => {
			if (event.data.requestId === requestId) {
				if (event.data.error) {
					reject(new Error(event.data.error));
				} else {
					resolve(event.data.result);
				}
				cleanup();
			}
		};

		worker.onerror = (error) => {
			reject(error);
			cleanup();
		};

		worker.postMessage({ requestId, data, priceTickSize, range });
	});
}
