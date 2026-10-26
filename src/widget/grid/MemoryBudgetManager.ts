import { GridChartRegistry } from './GridChartRegistry';
import { performanceMonitor } from './PerformanceMonitor';
import { getAdjustedDeviceProfile, DeviceProfileConfig } from './DeviceProfiles';

export interface MemoryReport {
  totalHeapEstimate: number;
  activeContexts: number;
  status: 'normal' | 'warning' | 'critical' | 'emergency';
}

export interface DeviceProfile {
  maxWebGLContexts: number;
  maxHeapBudget: number;
  isMobile: boolean;
  isLowEnd: boolean;
  deviceType: 'ios-safari' | 'android-chrome' | 'desktop' | 'unknown';
}

export class MemoryBudgetManager {
	private static lruList: string[] = [];
	private static MAX_HEAP_BUDGET = 300 * 1024 * 1024; // 300MB (desktop default)
	private static MAX_WEBGL_CONTEXTS = 8; // desktop default
	private static deviceProfile: DeviceProfile | null = null;

	static register(id: string): void {
		if (!this.lruList.includes(id)) {
			this.lruList.push(id);
		}
	}

	static unregister(id: string): void {
		this.lruList = this.lruList.filter(item => item !== id);
	}

	static touch(id: string): void {
		// Move to the end of LRU list (most recently used)
		this.lruList = this.lruList.filter(item => item !== id);
		this.lruList.push(id);
	}

	/**
	 * Detect device performance profile based on user agent and hardware concurrency
	 * Returns dynamic limits for WebGL contexts and heap budget
	 * Uses DeviceProfiles for centralized configuration
	 */
	static getDevicePerformanceProfile(): DeviceProfile {
		// Return cached profile if already computed
		if (this.deviceProfile) {
			return this.deviceProfile;
		}

		// Get adjusted profile from DeviceProfiles
		const profile = getAdjustedDeviceProfile();

		// Convert to DeviceProfile format
		this.deviceProfile = {
			maxWebGLContexts: profile.maxWebGLContexts,
			maxHeapBudget: profile.maxHeapBudget,
			isMobile: profile.aggressiveFreeze, // Use aggressiveFreeze as proxy for mobile
			isLowEnd: profile.maxWebGLContexts <= 4,
			deviceType: profile.aggressiveFreeze ? 'ios-safari' : 'desktop', // Simplified
		};

		return this.deviceProfile;
	}

	/**
	 * Get the current device profile (computes if not cached)
	 */
	static getCurrentProfile(): DeviceProfile {
		return this.getDevicePerformanceProfile();
	}

	/**
	 * Reset device profile cache (useful for testing)
	 */
	static resetDeviceProfile(): void {
		this.deviceProfile = null;
	}

	static getEstimate(): MemoryReport {
		// Get dynamic limits from device profile
		const profile = this.getDevicePerformanceProfile();
		const maxHeapBudget = profile.maxHeapBudget;
		const maxWebGLContexts = profile.maxWebGLContexts;

		let totalHeapEstimate = 0;
		let activeContexts = 0;

		const allHandles = GridChartRegistry.getAll();
		allHandles.forEach(handle => {
			if (handle.getMemoryUsage) {
				const usage = handle.getMemoryUsage();
				totalHeapEstimate += usage.heapSize;
				activeContexts += usage.webglContexts;
			} else {
				// Fallback estimate if getMemoryUsage is not implemented
				totalHeapEstimate += 20 * 1024 * 1024; // 20MB base
				activeContexts += 1;
			}
		});

		// Overwrite with performance.memory if supported and larger (reflects real browser state)
		if (
			typeof window !== 'undefined' &&
      window.performance &&
      (window.performance as any).memory // ARC-1-keep: legacy bridge
		) {
			const memory = (window.performance as any).memory; // ARC-1-keep: legacy bridge
			if (memory.usedJSHeapSize > totalHeapEstimate) {
				totalHeapEstimate = memory.usedJSHeapSize;
			}
		}

		let status: 'normal' | 'warning' | 'critical' | 'emergency' = 'normal';
		if (totalHeapEstimate >= maxHeapBudget * 0.95 || activeContexts >= maxWebGLContexts) {
			status = 'emergency';
		} else if (totalHeapEstimate >= maxHeapBudget * 0.90) {
			status = 'critical';
		} else if (totalHeapEstimate >= maxHeapBudget * 0.80) {
			status = 'warning';
		}

		return {
			totalHeapEstimate,
			activeContexts,
			status,
		};
	}

	static enforceBudget(activeChartId: string | null): void {
		const report = this.getEstimate();
		const profile = this.getDevicePerformanceProfile();
		const maxWebGLContexts = profile.maxWebGLContexts;

		if (report.status === 'normal' && report.activeContexts < maxWebGLContexts) {
			return; // Under budget
		}

		const allHandles = GridChartRegistry.getAll();

		if (report.status === 'emergency') {
			// Freeze all charts except the active one
			allHandles.forEach(handle => {
				if (handle.id !== activeChartId && handle.freeze) {
					handle.freeze();
				}
			});
			console.warn('Memory Budget Emergency: Suspended all background charts.');
			return;
		}

		if (report.status === 'critical' || report.activeContexts >= maxWebGLContexts) {
			// Evict using LRU policy
			// Filter candidates: charts that are NOT active, NOT currently frozen, and have freeze()
			const candidates = this.lruList
				.filter(id => id !== activeChartId)
				.map(id => GridChartRegistry.get(id))
				.filter((handle): handle is any => {
					if (!handle) return false;
					const usage = handle.getMemoryUsage?.();
					return usage ? usage.webglContexts > 0 : true; // only evict active ones
				});

			// Evict oldest first until under budget
			for (const handle of candidates) {
				if (handle.freeze) {
					handle.freeze();
					console.warn(`Memory Budget Critical: Frozen chart instance ${handle.id} to release WebGL context.`);

					// Re-evaluate budget
					const newReport = this.getEstimate();
					if (newReport.status !== 'critical' && newReport.activeContexts < maxWebGLContexts) {
						break;
					}
				}
			}
		}
	}

	/**
	 * Freeze a specific chart context (called by IntersectionObserver)
	 * Captures snapshot before freezing for visual continuity
	 */
	static async freezeContext(chartId: string): Promise<void> {
		const freezeStart = performanceMonitor.recordFreezeStart();
		const handle = GridChartRegistry.get(chartId);
		if (!handle) {
			return;
		}

		let snapshotCaptureMs = 0;
		let memoryReclaimed = 0;

		// Capture snapshot before freezing (for visual continuity)
		const h: any = handle;
		if (h.captureSnapshot) {
			const snapshotStart = performance.now();
			try {
				const snapshotPromise = h.captureSnapshot();
				if (snapshotPromise && typeof snapshotPromise.then === 'function') {
					const snapshot = await snapshotPromise;
					if (snapshot) {
						h._frozenSnapshot = snapshot;
						snapshotCaptureMs = performance.now() - snapshotStart;
					}
				}
			} catch (_e) {
				// Snapshot capture failed silently
			}
		}

		// Estimate memory reclaimed before freezing
		if (handle.getMemoryUsage) {
			const usage = handle.getMemoryUsage();
			memoryReclaimed = usage.heapSize;
		}

		// Freeze the chart (releases WebGL context)
		if (handle.freeze) {
			handle.freeze();
		}

		// Update LRU - move to front (least recently used)
		this.lruList = this.lruList.filter(id => id !== chartId);
		this.lruList.unshift(chartId);

		// Record metrics
		performanceMonitor.recordFreezeEnd(freezeStart, memoryReclaimed, snapshotCaptureMs);
	}

	/**
	 * Thaw a specific chart context (called by IntersectionObserver)
	 * Restores from snapshot for seamless visual transition
	 */
	static async thawContext(chartId: string): Promise<void> {
		const thawStart = performanceMonitor.recordThawStart();
		const handle = GridChartRegistry.get(chartId);
		if (!handle) {
			return;
		}

		let snapshotRestoreMs = 0;

		// Restore from snapshot if available
		const h: any = handle;
		if (h.restoreFromSnapshot && h._frozenSnapshot) {
			const restoreStart = performance.now();
			try {
				await h.restoreFromSnapshot(h._frozenSnapshot);
				delete h._frozenSnapshot;
				snapshotRestoreMs = performance.now() - restoreStart;
			} catch (_e) {
				// Snapshot restore failed silently
			}
		}

		// Thaw the chart (recreates WebGL context)
		if (handle.thaw) {
			handle.thaw();
		}

		// Update LRU - move to end (most recently used)
		this.touch(chartId);

		// Record metrics
		performanceMonitor.recordThawEnd(thawStart, snapshotRestoreMs);
	}

	/**
	 * Get performance metrics for devtools
	 */
	static getPerformanceMetrics() {
		return performanceMonitor.getReport();
	}

	/**
	 * Start frame time monitoring
	 */
	static startPerformanceMonitoring(): void {
		performanceMonitor.startFrameMonitoring();
		performanceMonitor.exposeToDevTools();
	}

	/**
	 * Stop frame time monitoring
	 */
	static stopPerformanceMonitoring(): void {
		performanceMonitor.stopFrameMonitoring();
	}

	/**
	 * Log performance report to console
	 */
	static logPerformanceReport(): void {
		performanceMonitor.logReport();
	}
}

