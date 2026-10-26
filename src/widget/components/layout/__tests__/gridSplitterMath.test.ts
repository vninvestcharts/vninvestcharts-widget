import { describe, it, expect } from 'vitest';
import {
	MIN_TRACK_PX,
	resolveTrackPx,
	getTrackPixelValue,
	applyNeighborDeltaPx,
	convertPxToFr,
	calculateAriaValues,
} from '../gridSplitterMath';

describe('gridSplitterMath', () => {
	describe('resolveTrackPx', () => {
		it('resolves equal 1fr tracks accurately', () => {
			const tokens = ['1fr', '1fr'];
			const px0 = resolveTrackPx('1fr', 600, tokens, 4);
			const px1 = resolveTrackPx('1fr', 600, tokens, 4);
			// container 600, gap 4 => free space = 596 => 298px each
			expect(px0).toBe(298);
			expect(px1).toBe(298);
		});

		it('resolves fixed px tracks', () => {
			const tokens = ['200px', '1fr'];
			const px0 = resolveTrackPx('200px', 600, tokens, 4);
			const px1 = resolveTrackPx('1fr', 600, tokens, 4);
			expect(px0).toBe(200);
			// 600 - 200 - 4 = 396
			expect(px1).toBe(396);
		});
	});

	describe('applyNeighborDeltaPx', () => {
		it('performs zero-sum change between index and index+1', () => {
			const baseTracks = [300, 300];
			const result = applyNeighborDeltaPx({
				baseTracksPx: baseTracks,
				index: 0,
				deltaPx: 50,
				minPx: 100,
			});
			expect(result[0]).toBe(350);
			expect(result[1]).toBe(250);
			expect(result[0] + result[1]).toBe(600);
		});

		it('preserves other tracks unchanged in 3+ tracks layout', () => {
			const baseTracks = [200, 300, 400];
			const result = applyNeighborDeltaPx({
				baseTracksPx: baseTracks,
				index: 0,
				deltaPx: 60,
				minPx: 100,
			});
			expect(result[0]).toBe(260);
			expect(result[1]).toBe(240);
			expect(result[2]).toBe(400); // 3rd track strictly preserved!
			expect(result[0] + result[1] + result[2]).toBe(900);
		});

		it('clamps to minPx when dragging beyond boundaries', () => {
			const baseTracks = [300, 300];
			// Dragging -250 would make track 0 = 50 < minPx (100)
			const result = applyNeighborDeltaPx({
				baseTracksPx: baseTracks,
				index: 0,
				deltaPx: -250,
				minPx: 100,
			});
			expect(result[0]).toBe(100);
			expect(result[1]).toBe(500);
			expect(result[0] + result[1]).toBe(600);

			// Dragging +250 would make track 1 = 50 < minPx (100)
			const result2 = applyNeighborDeltaPx({
				baseTracksPx: baseTracks,
				index: 0,
				deltaPx: 250,
				minPx: 100,
			});
			expect(result2[0]).toBe(500);
			expect(result2[1]).toBe(100);
			expect(result2[0] + result2[1]).toBe(600);
		});
	});

	describe('convertPxToFr', () => {
		it('converts px to normalized fr maintaining exact sum', () => {
			const frs = convertPxToFr([300, 300], 2);
			expect(frs).toEqual(['1.00fr', '1.00fr']);

			const frsAsymmetric = convertPxToFr([200, 400], 2);
			expect(frsAsymmetric).toEqual(['0.67fr', '1.33fr']);
		});

		it('handles 3 tracks layout', () => {
			const frs = convertPxToFr([300, 300, 300], 3);
			expect(frs).toEqual(['1.00fr', '1.00fr', '1.00fr']);
		});

		it('keeps parsed fr sum exactly equal to totalTracks (largest remainder)', () => {
			const frs = convertPxToFr([100, 100, 101], 3);
			const sum = frs.reduce((a, s) => a + parseFloat(s), 0);
			expect(sum).toBeCloseTo(3, 10);
			// Uneven split that drifts with naive per-track toFixed(2).
			const frs2 = convertPxToFr([100, 200, 300], 3);
			const sum2 = frs2.reduce((a, s) => a + parseFloat(s), 0);
			expect(sum2).toBeCloseTo(3, 10);
		});
	});

	describe('calculateAriaValues', () => {
		it('returns percentages and valueText', () => {
			const aria = calculateAriaValues(300, 600, 100);
			expect(aria.valueNow).toBe(50);
			expect(aria.valueMin).toBe(17);
			expect(aria.valueMax).toBe(83);
			expect(aria.valueText).toBe('50%');
		});
	});
});
