import { vi, describe, it, expect, beforeEach } from 'vitest';
import { GridChartRegistry } from '../grid/GridChartRegistry';
import { MemoryBudgetManager } from '../grid/MemoryBudgetManager';

vi.mock('../grid/DeviceProfiles', () => ({
	getAdjustedDeviceProfile: () => ({
		maxWebGLContexts: 8,
		maxHeapBudget: 300 * 1024 * 1024, // 300MB to match test expectations
		aggressiveFreeze: false,
		freezeThreshold: 0.5,
		thawThreshold: 0.1,
		debounceMs: 100,
		minFreezeDuration: 1000,
		maxSnapshotWidth: 1920,
		snapshotQuality: 0.8,
		preThawOnHover: false,
		enableFrameMonitoring: false,
	}),
}));

describe('MemoryBudgetManager', () => {
	beforeEach(() => {
		GridChartRegistry.clear();
		MemoryBudgetManager.resetDeviceProfile();
		// Reset LRU private state by unregistered everything (or touch will clear it)
		const all = GridChartRegistry.getAll();
		all.forEach(h => MemoryBudgetManager.unregister(h.id));
	});

	const createMockHandle = (id: string, heapSize: number, webglContexts: number) => {
		let isFrozen = false;
		const handle = {
			id,
			getMemoryUsage: vi.fn(() => {
				if (isFrozen) {
					return { heapSize: 2 * 1024 * 1024, webglContexts: 0 };
				}
				return { heapSize, webglContexts };
			}),
			freeze: vi.fn(() => {
				isFrozen = true;
			}),
			thaw: vi.fn(() => {
				isFrozen = false;
			}),
		};
		GridChartRegistry.register(id, handle as any);
		MemoryBudgetManager.register(id);
		return handle;
	};

	it('calculates memory estimate correctly', () => {
		createMockHandle('chart-1', 50 * 1024 * 1024, 1); // 50MB
		createMockHandle('chart-2', 100 * 1024 * 1024, 1); // 100MB

		const estimate = MemoryBudgetManager.getEstimate();
		expect(estimate.totalHeapEstimate).toBe(150 * 1024 * 1024);
		expect(estimate.activeContexts).toBe(2);
		expect(estimate.status).toBe('normal'); // 150MB is < 80% of 300MB
	});

	it('returns warning, critical, and emergency status based on heap size', () => {
		// 80% warning = 240MB
		createMockHandle('chart-1', 241 * 1024 * 1024, 1);
		expect(MemoryBudgetManager.getEstimate().status).toBe('warning');

		// 90% critical = 270MB
		GridChartRegistry.clear();
		createMockHandle('chart-1', 271 * 1024 * 1024, 1);
		expect(MemoryBudgetManager.getEstimate().status).toBe('critical');

		// 95% emergency = 285MB
		GridChartRegistry.clear();
		createMockHandle('chart-1', 286 * 1024 * 1024, 1);
		expect(MemoryBudgetManager.getEstimate().status).toBe('emergency');
	});

	it('enforces budget by freezing the oldest chart when status is critical (LRU)', () => {
		// Register three charts
		const chart1 = createMockHandle('chart-1', 100 * 1024 * 1024, 1);
		const chart2 = createMockHandle('chart-2', 100 * 1024 * 1024, 1);
		const chart3 = createMockHandle('chart-3', 80 * 1024 * 1024, 1);

		// Initial LRU order: chart-1, chart-2, chart-3
		// Touch chart-1 to make it recently used
		MemoryBudgetManager.touch('chart-1');
		// LRU order now: chart-2, chart-3, chart-1

		// Total size = 280MB (Critical status)
		expect(MemoryBudgetManager.getEstimate().status).toBe('critical');

		// Active chart is chart-1. Oldest background is chart-2.
		// Call enforceBudget with active chart = chart-1
		MemoryBudgetManager.enforceBudget('chart-1');

		// chart-2 (oldest) should be frozen
		expect(chart2.freeze).toHaveBeenCalled();
		// chart-3 should NOT be frozen (because after freezing chart-2, total memory drops below critical)
		expect(chart3.freeze).not.toHaveBeenCalled();
		expect(chart1.freeze).not.toHaveBeenCalled();
	});

	it('enforces budget by freezing all background charts when status is emergency', () => {
		const chart1 = createMockHandle('chart-1', 150 * 1024 * 1024, 1);
		const chart2 = createMockHandle('chart-2', 100 * 1024 * 1024, 1);
		const chart3 = createMockHandle('chart-3', 40 * 1024 * 1024, 1);

		// Total heap = 290MB (Emergency status >= 285MB)
		expect(MemoryBudgetManager.getEstimate().status).toBe('emergency');

		// active chart is chart-1
		MemoryBudgetManager.enforceBudget('chart-1');

		// Both backgrounds chart-2 and chart-3 should be frozen
		expect(chart2.freeze).toHaveBeenCalled();
		expect(chart3.freeze).toHaveBeenCalled();
		expect(chart1.freeze).not.toHaveBeenCalled();
	});
});

