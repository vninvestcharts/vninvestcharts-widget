/**
 * Unit tests for MemoryBudgetManager
 */

import { MemoryBudgetManager } from '../MemoryBudgetManager';
import { GridChartRegistry } from '../GridChartRegistry';

// Mock chart handle
const createMockHandle = (id: string, frozen = false) => {
	const handle: Record<string, unknown> = {
		id,
		frozen,
		getMemoryUsage: vi.fn(() => ({ heapSize: 20 * 1024 * 1024, webglContexts: 1 })),
		captureSnapshot: vi.fn().mockResolvedValue({ width: 100, height: 100 } as ImageBitmap),
		restoreFromSnapshot: vi.fn().mockResolvedValue(undefined),
		freeze: vi.fn(() => { handle.frozen = true; }),
		thaw: vi.fn(() => { handle.frozen = false; }),
	};
	return handle;
};

beforeEach(() => {
	vi.clearAllMocks();
	GridChartRegistry.clear();
	// Reset MemoryBudgetManager static state
	(MemoryBudgetManager as any).lruList = [];
	(MemoryBudgetManager as any).deviceProfile = null;
});

describe('MemoryBudgetManager', () => {
	test('should register and unregister charts', () => {
		const handle = createMockHandle('chart-1');
		GridChartRegistry.register('chart-1', handle as any);

		MemoryBudgetManager.register('chart-1');
		expect((MemoryBudgetManager as any).lruList).toContain('chart-1');

		MemoryBudgetManager.unregister('chart-1');
		expect((MemoryBudgetManager as any).lruList).not.toContain('chart-1');
	});

	test('should track LRU order with touch', () => {
		const handle1 = createMockHandle('chart-1');
		const handle2 = createMockHandle('chart-2');
		GridChartRegistry.register('chart-1', handle1 as any);
		GridChartRegistry.register('chart-2', handle2 as any);

		MemoryBudgetManager.register('chart-1');
		MemoryBudgetManager.register('chart-2');

		// chart-1 should be first (oldest)
		expect((MemoryBudgetManager as any).lruList[0]).toBe('chart-1');

		// Touch chart-1 (make it most recent)
		MemoryBudgetManager.touch('chart-1');

		// chart-1 should now be last (most recent)
		expect((MemoryBudgetManager as any).lruList[1]).toBe('chart-1');
	});

	test('should detect device profile', () => {
		const profile = MemoryBudgetManager.getDevicePerformanceProfile();

		expect(profile).toHaveProperty('maxWebGLContexts');
		expect(profile).toHaveProperty('maxHeapBudget');
		expect(profile).toHaveProperty('isMobile');
		expect(profile).toHaveProperty('isLowEnd');
		expect(profile).toHaveProperty('deviceType');
		expect(typeof profile.maxWebGLContexts).toBe('number');
		expect(typeof profile.maxHeapBudget).toBe('number');
	});

	test('should return cached profile on subsequent calls', () => {
		const profile1 = MemoryBudgetManager.getDevicePerformanceProfile();
		const profile2 = MemoryBudgetManager.getDevicePerformanceProfile();

		expect(profile1).toBe(profile2); // Same reference
	});

	test('should reset device profile cache', () => {
		MemoryBudgetManager.getDevicePerformanceProfile();
		MemoryBudgetManager.resetDeviceProfile();

		// Should be able to get new profile
		const profile = MemoryBudgetManager.getDevicePerformanceProfile();
		expect(profile).toBeDefined();
	});

	test('should estimate memory usage', () => {
		const handle1 = createMockHandle('chart-1');
		const handle2 = createMockHandle('chart-2');
		GridChartRegistry.register('chart-1', handle1 as any);
		GridChartRegistry.register('chart-2', handle2 as any);

		const report = MemoryBudgetManager.getEstimate();

		expect(report).toHaveProperty('totalHeapEstimate');
		expect(report).toHaveProperty('activeContexts');
		expect(report).toHaveProperty('status');
		expect(report.activeContexts).toBe(2);
		expect(report.totalHeapEstimate).toBeGreaterThan(0);
	});

	test('should enforce budget when over limit', () => {
		// Create many charts to exceed budget
		for (let i = 0; i < 10; i++) {
			const handle = createMockHandle(`chart-${i}`);
			GridChartRegistry.register(`chart-${i}`, handle as any);
			MemoryBudgetManager.register(`chart-${i}`);
		}

		// Mock low budget
		(MemoryBudgetManager as any).deviceProfile = {
			maxWebGLContexts: 4,
			maxHeapBudget: 50 * 1024 * 1024,
			isMobile: true,
			isLowEnd: true,
			deviceType: 'ios-safari',
		};

		// Should freeze some charts
		MemoryBudgetManager.enforceBudget('chart-0');

		// At least some charts should be frozen
		const frozenCount = Array.from(GridChartRegistry.getAll()).filter(h => (h as any).frozen).length;
		expect(frozenCount).toBeGreaterThan(0);
	});

	test('should not enforce budget when under limit', () => {
		const handle = createMockHandle('chart-1');
		GridChartRegistry.register('chart-1', handle as any);
		MemoryBudgetManager.register('chart-1');

		// Mock high budget
		(MemoryBudgetManager as any).deviceProfile = {
			maxWebGLContexts: 10,
			maxHeapBudget: 500 * 1024 * 1024,
			isMobile: false,
			isLowEnd: false,
			deviceType: 'desktop',
		};

		MemoryBudgetManager.enforceBudget('chart-1');

		// No charts should be frozen
		const frozenCount = Array.from(GridChartRegistry.getAll()).filter(h => (h as any).frozen).length;
		expect(frozenCount).toBe(0);
	});

	test('should freeze and thaw contexts with snapshot', async () => {
		const handle = createMockHandle('chart-1');
		GridChartRegistry.register('chart-1', handle as any);
		MemoryBudgetManager.register('chart-1');

		// Freeze context
		await MemoryBudgetManager.freezeContext('chart-1');

		expect(handle.freeze).toHaveBeenCalled();
		expect(handle.captureSnapshot).toHaveBeenCalled();
		expect((handle as any)._frozenSnapshot).toBeDefined();

		// Thaw context
		const snapshot = (handle as any)._frozenSnapshot;
		await MemoryBudgetManager.thawContext('chart-1');

		expect(handle.thaw).toHaveBeenCalled();
		expect(handle.restoreFromSnapshot).toHaveBeenCalledWith(snapshot);
		expect((handle as any)._frozenSnapshot).toBeUndefined();
	});

	test('should handle missing handle gracefully', async () => {
		// Should not throw
		await expect(MemoryBudgetManager.freezeContext('non-existent')).resolves.toBeUndefined();
		await expect(MemoryBudgetManager.thawContext('non-existent')).resolves.toBeUndefined();
	});

	test('should expose performance metrics', () => {
		const metrics = MemoryBudgetManager.getPerformanceMetrics();

		expect(metrics).toHaveProperty('freezeThaw');
		expect(metrics).toHaveProperty('frameTime');
		expect(metrics).toHaveProperty('memory');
		expect(metrics).toHaveProperty('timestamp');
	});

	test('should start and stop performance monitoring', () => {
		MemoryBudgetManager.startPerformanceMonitoring();
		MemoryBudgetManager.stopPerformanceMonitoring();

		// Should not throw
		expect(true).toBe(true);
	});
});