export const MIN_TRACK_PX = 100;

/**
 * Resolve a grid-track token ("1fr"/"120px"/"20%") to rendered px so the dragged track can be sized in px even with fr units.
 */
export function resolveTrackPx(token: string, containerSize: number, allTokens: string[], gap = 4): number {
	const n = allTokens.length;
	const fixed = allTokens.reduce((s, t) => s + (/%|px$/.test(t) ? parseFloat(t) || 0 : 0), 0);
	const frSum = allTokens.reduce((s, t) => s + (/fr$/.test(t) ? parseFloat(t) || 0 : 0), 0);
	const free = Math.max(0, containerSize - fixed - gap * (n - 1));
	if (/fr$/.test(token)) {
		const f = parseFloat(token) || 0;
		return frSum > 0 ? (f / frSum) * free : free / n;
	}
	return parseFloat(token) || 0;
}

/**
 * Get the current computed or approximated pixel size for a track.
 */
export function getTrackPixelValue(
	trackSizes: { rows: string[]; cols: string[] },
	type: 'row' | 'col',
	index: number,
	containerEl: HTMLDivElement | null
): number {
	const tracks = type === 'row' ? trackSizes.rows : trackSizes.cols;
	const raw = tracks[index];
	if (!raw) return 300;
	if (raw.endsWith('px')) return parseFloat(raw);
	const totalFr = tracks.reduce((sum, s) => sum + (s.endsWith('fr') ? parseFloat(s) : 0), 0);
	const frValue = parseFloat(raw);
	if (totalFr <= 0 || isNaN(frValue) || !containerEl) return 300;
	const containerSize = type === 'row' ? containerEl.clientHeight : containerEl.clientWidth;
	return (frValue / totalFr) * containerSize;
}

export interface NeighborDeltaOptions {
	baseTracksPx: number[];
	index: number;
	deltaPx: number;
	minPx?: number;
}

/**
 * Zero-sum neighbor compensation:
 * Track `index` changes by deltaPx, while the adjacent neighbor `nextIndex` absorbs -deltaPx.
 * Both tracks are clamped to `>= minPx`.
 * All other tracks remain exactly at their base size. Total px across all tracks is strictly preserved.
 */
export function applyNeighborDeltaPx({
	baseTracksPx,
	index,
	deltaPx,
	minPx = MIN_TRACK_PX,
}: NeighborDeltaOptions): number[] {
	const n = baseTracksPx.length;
	if (n <= 1 || index < 0 || index >= n - 1) {
		return [...baseTracksPx];
	}

	const nextIdx = index + 1;
	const pairSum = baseTracksPx[index] + baseTracksPx[nextIdx];

	// Maximum size for either track is pairSum - minPx
	const effectiveMin = Math.min(minPx, pairSum / 2);
	const minTrack = effectiveMin;
	const maxTrack = Math.max(effectiveMin, pairSum - effectiveMin);

	const desiredSize = baseTracksPx[index] + deltaPx;
	const clampedSize = Math.max(minTrack, Math.min(maxTrack, desiredSize));
	const neighborSize = pairSum - clampedSize;

	const result = [...baseTracksPx];
	result[index] = Math.round(clampedSize * 100) / 100;
	result[nextIdx] = Math.round(neighborSize * 100) / 100;
	return result;
}

/**
 * Convert pixel track sizes to normalized `fr` strings with fixed 2 decimal places.
 * Uses largest-remainder apportionment (integer hundredths) so the parsed sum
 * is exactly totalTracks — plain per-track toFixed(2) can drift (e.g. 3.01).
 */
export function convertPxToFr(tracksPx: number[], totalTracks: number): string[] {
	const totalPx = tracksPx.reduce((a, b) => a + b, 0);
	if (totalPx <= 0) {
		return Array(totalTracks).fill('1fr');
	}
	const raw = tracksPx.map(px => (px / totalPx) * totalTracks * 100);
	const apportioned = raw.map(v => Math.floor(v));
	let diff = Math.round(totalTracks * 100 - apportioned.reduce((a, b) => a + b, 0));
	if (diff > 0) {
		// Hand +1 hundredth to tracks with the largest fractional remainders.
		const order = raw.map((v, i) => i).sort((a, b) => (raw[b] - apportioned[b]) - (raw[a] - apportioned[a]));
		for (const i of order) {
			if (diff <= 0) break;
			apportioned[i] += 1;
			diff -= 1;
		}
	} else if (diff < 0) {
		// Floating-point safety: take back from the smallest remainders.
		const order = raw.map((v, i) => i).sort((a, b) => (raw[a] - apportioned[a]) - (raw[b] - apportioned[b]));
		for (const i of order) {
			if (diff >= 0) break;
			apportioned[i] -= 1;
			diff += 1;
		}
	}
	return apportioned.map(h => `${(h / 100).toFixed(2)}fr`);
}

/**
 * Calculate standard ARIA values (0-100%) for a track splitter separator.
 */
export function calculateAriaValues(trackPx: number, totalPx: number, minPx = MIN_TRACK_PX) {
	if (totalPx <= 0) {
		return {
			valueNow: 50,
			valueMin: 10,
			valueMax: 90,
			valueText: '50%',
		};
	}
	const percent = Math.max(0, Math.min(100, Math.round((trackPx / totalPx) * 100)));
	const minPercent = Math.max(1, Math.min(99, Math.round((minPx / totalPx) * 100)));
	const maxPercent = Math.max(minPercent, 100 - minPercent);

	return {
		valueNow: percent,
		valueMin: minPercent,
		valueMax: maxPercent,
		valueText: `${percent}%`,
	};
}
