/**
 * PerformanceMonitor - Tracks freeze/thaw performance metrics for WebGL management
 * Exposes metrics to devtools for debugging and optimization
 */

export interface FreezeThawMetrics {
  freezeCount: number;
  thawCount: number;
  totalFreezeLatencyMs: number;
  totalThawLatencyMs: number;
  totalSnapshotCaptureMs: number;
  totalSnapshotRestoreMs: number;
  totalMemoryReclaimedBytes: number;
  lastFreezeTimestamp: number | null;
  lastThawTimestamp: number | null;
  averageFreezeLatencyMs: number;
  averageThawLatencyMs: number;
  averageSnapshotCaptureMs: number;
  averageSnapshotRestoreMs: number;
}

export interface FrameTimeMetrics {
  frameCount: number;
  totalFrameTimeMs: number;
  averageFrameTimeMs: number;
  maxFrameTimeMs: number;
  minFrameTimeMs: number;
  droppedFrames: number;
}

export interface PerformanceReport {
  freezeThaw: FreezeThawMetrics;
  frameTime: FrameTimeMetrics;
  memory: {
    currentHeapUsed: number;
    currentHeapTotal: number;
    peakHeapUsed: number;
    webglContextsActive: number;
  };
  timestamp: number;
}

class PerformanceMonitor {
	private static instance: PerformanceMonitor;

	private freezeThawMetrics: FreezeThawMetrics = {
		freezeCount: 0,
		thawCount: 0,
		totalFreezeLatencyMs: 0,
		totalThawLatencyMs: 0,
		totalSnapshotCaptureMs: 0,
		totalSnapshotRestoreMs: 0,
		totalMemoryReclaimedBytes: 0,
		lastFreezeTimestamp: null,
		lastThawTimestamp: null,
		averageFreezeLatencyMs: 0,
		averageThawLatencyMs: 0,
		averageSnapshotCaptureMs: 0,
		averageSnapshotRestoreMs: 0,
	};

	private frameTimeMetrics: FrameTimeMetrics = {
		frameCount: 0,
		totalFrameTimeMs: 0,
		averageFrameTimeMs: 0,
		maxFrameTimeMs: 0,
		minFrameTimeMs: Infinity,
		droppedFrames: 0,
	};

	private frameTimeHistory: number[] = [];
	private maxHistorySize = 1000;
	private rafId: number | null = null;
	private lastFrameTime: number = 0;
	private isMonitoring = false;

	private constructor() {}

	static getInstance(): PerformanceMonitor {
		if (!PerformanceMonitor.instance) {
			PerformanceMonitor.instance = new PerformanceMonitor();
		}
		return PerformanceMonitor.instance;
	}

	// ============================================
	// Freeze/Thaw Metrics
	// ============================================

	recordFreezeStart(): number {
		return performance.now();
	}

	recordFreezeEnd(startTime: number, memoryReclaimed: number = 0, snapshotCaptureMs: number = 0): void {
		const latency = performance.now() - startTime;
		this.freezeThawMetrics.freezeCount++;
		this.freezeThawMetrics.totalFreezeLatencyMs += latency;
		this.freezeThawMetrics.totalSnapshotCaptureMs += snapshotCaptureMs;
		this.freezeThawMetrics.totalMemoryReclaimedBytes += memoryReclaimed;
		this.freezeThawMetrics.lastFreezeTimestamp = Date.now();
		this.freezeThawMetrics.averageFreezeLatencyMs =
      this.freezeThawMetrics.totalFreezeLatencyMs / this.freezeThawMetrics.freezeCount;
		this.freezeThawMetrics.averageSnapshotCaptureMs =
      this.freezeThawMetrics.totalSnapshotCaptureMs / this.freezeThawMetrics.freezeCount;
	}

	recordThawStart(): number {
		return performance.now();
	}

	recordThawEnd(startTime: number, snapshotRestoreMs: number = 0): void {
		const latency = performance.now() - startTime;
		this.freezeThawMetrics.thawCount++;
		this.freezeThawMetrics.totalThawLatencyMs += latency;
		this.freezeThawMetrics.totalSnapshotRestoreMs += snapshotRestoreMs;
		this.freezeThawMetrics.lastThawTimestamp = Date.now();
		this.freezeThawMetrics.averageThawLatencyMs =
      this.freezeThawMetrics.totalThawLatencyMs / this.freezeThawMetrics.thawCount;
		this.freezeThawMetrics.averageSnapshotRestoreMs =
      this.freezeThawMetrics.totalSnapshotRestoreMs / this.freezeThawMetrics.thawCount;
	}

	// ============================================
	// Frame Time Monitoring
	// ============================================

	startFrameMonitoring(): void {
		if (this.isMonitoring) return;
		this.isMonitoring = true;
		this.lastFrameTime = performance.now();
		this.tick();
	}

	stopFrameMonitoring(): void {
		this.isMonitoring = false;
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
	}

	private tick(): void {
		if (!this.isMonitoring) return;

		const now = performance.now();
		const frameTime = now - this.lastFrameTime;
		this.lastFrameTime = now;

		this.frameTimeMetrics.frameCount++;
		this.frameTimeMetrics.totalFrameTimeMs += frameTime;
		this.frameTimeMetrics.averageFrameTimeMs =
      this.frameTimeMetrics.totalFrameTimeMs / this.frameTimeMetrics.frameCount;
		this.frameTimeMetrics.maxFrameTimeMs = Math.max(this.frameTimeMetrics.maxFrameTimeMs, frameTime);
		this.frameTimeMetrics.minFrameTimeMs = Math.min(this.frameTimeMetrics.minFrameTimeMs, frameTime);

		// Count dropped frames (>16.67ms for 60fps)
		if (frameTime > 16.67) {
			this.frameTimeMetrics.droppedFrames++;
		}

		// Keep history for percentile calculations
		this.frameTimeHistory.push(frameTime);
		if (this.frameTimeHistory.length > this.maxHistorySize) {
			this.frameTimeHistory.shift();
		}

		this.rafId = requestAnimationFrame(() => this.tick());
	}

	// ============================================
	// Reporting
	// ============================================

	getReport(): PerformanceReport {
		const memory = typeof window !== 'undefined' && window.performance && (window.performance as any).memory // ARC-1-keep: legacy bridge
			? (window.performance as any).memory // ARC-1-keep: legacy bridge
			: { usedJSHeapSize: 0, totalJSHeapSize: 0, jsHeapSizeLimit: 0 };

		return {
			freezeThaw: { ...this.freezeThawMetrics },
			frameTime: { ...this.frameTimeMetrics },
			memory: {
				currentHeapUsed: memory.usedJSHeapSize || 0,
				currentHeapTotal: memory.totalJSHeapSize || 0,
				peakHeapUsed: memory.usedJSHeapSize || 0,
				webglContextsActive: 0, // Would need to be tracked externally
			},
			timestamp: Date.now(),
		};
	}

	logReport(): void {
		const report = this.getReport();
		console.group('[PerformanceMonitor] WebGL Freeze/Thaw Report');
		console.table({
			'Freeze Count': report.freezeThaw.freezeCount,
			'Thaw Count': report.freezeThaw.thawCount,
			'Avg Freeze Latency (ms)': report.freezeThaw.averageFreezeLatencyMs.toFixed(2),
			'Avg Thaw Latency (ms)': report.freezeThaw.averageThawLatencyMs.toFixed(2),
			'Avg Snapshot Capture (ms)': report.freezeThaw.averageSnapshotCaptureMs.toFixed(2),
			'Avg Snapshot Restore (ms)': report.freezeThaw.averageSnapshotRestoreMs.toFixed(2),
			'Total Memory Reclaimed (MB)': (report.freezeThaw.totalMemoryReclaimedBytes / 1024 / 1024).toFixed(2),
			'Avg Frame Time (ms)': report.frameTime.averageFrameTimeMs.toFixed(2),
			'Max Frame Time (ms)': report.frameTime.maxFrameTimeMs.toFixed(2),
			'Dropped Frames': report.frameTime.droppedFrames,
			'Current Heap (MB)': (report.memory.currentHeapUsed / 1024 / 1024).toFixed(2),
		});
		console.groupEnd();
	}

	// ============================================
	// DevTools Integration
	// ============================================

	exposeToDevTools(): void {
		if (typeof window === 'undefined') return;

		// Expose to window for console access
		(window as any).__VNINVESTCHARTS_PERF__ = { // ARC-1-keep: legacy bridge
			getReport: () => this.getReport(),
			logReport: () => this.logReport(),
			startFrameMonitoring: () => this.startFrameMonitoring(),
			stopFrameMonitoring: () => this.stopFrameMonitoring(),
			reset: () => this.reset(),
		};
	}

	// ============================================
	// Reset
	// ============================================

	reset(): void {
		this.freezeThawMetrics = {
			freezeCount: 0,
			thawCount: 0,
			totalFreezeLatencyMs: 0,
			totalThawLatencyMs: 0,
			totalSnapshotCaptureMs: 0,
			totalSnapshotRestoreMs: 0,
			totalMemoryReclaimedBytes: 0,
			lastFreezeTimestamp: null,
			lastThawTimestamp: null,
			averageFreezeLatencyMs: 0,
			averageThawLatencyMs: 0,
			averageSnapshotCaptureMs: 0,
			averageSnapshotRestoreMs: 0,
		};

		this.frameTimeMetrics = {
			frameCount: 0,
			totalFrameTimeMs: 0,
			averageFrameTimeMs: 0,
			maxFrameTimeMs: 0,
			minFrameTimeMs: Infinity,
			droppedFrames: 0,
		};

		this.frameTimeHistory = [];
	}

	// ============================================
	// Percentile Calculations
	// ============================================

	getFrameTimePercentile(percentile: number): number {
		if (this.frameTimeHistory.length === 0) return 0;
		const sorted = [...this.frameTimeHistory].sort((a, b) => a - b);
		const index = Math.ceil(percentile / 100 * sorted.length) - 1;
		return sorted[Math.max(0, index)];
	}

	getFrameTimeStats(): { p50: number; p90: number; p95: number; p99: number } {
		return {
			p50: this.getFrameTimePercentile(50),
			p90: this.getFrameTimePercentile(90),
			p95: this.getFrameTimePercentile(95),
			p99: this.getFrameTimePercentile(99),
		};
	}
}

export const performanceMonitor = PerformanceMonitor.getInstance();
export default PerformanceMonitor;