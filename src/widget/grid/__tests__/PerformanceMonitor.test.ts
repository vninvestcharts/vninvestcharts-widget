/**
 * Unit tests for PerformanceMonitor
 */

import { performanceMonitor } from '../PerformanceMonitor';
const PerformanceMonitor = { getInstance: () => performanceMonitor };

beforeEach(() => {
	vi.restoreAllMocks();
	performanceMonitor.reset();
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('PerformanceMonitor', () => {
	test('should be singleton', () => {
		const instance1 = PerformanceMonitor.getInstance();
		const instance2 = PerformanceMonitor.getInstance();

		expect(instance1).toBe(instance2);
	});

	test('should record freeze metrics', () => {
		const perfNowSpy = vi.spyOn(performance, 'now');
		perfNowSpy.mockReturnValueOnce(1000); // recordFreezeStart
		const startTime = performanceMonitor.recordFreezeStart();

		perfNowSpy.mockReturnValueOnce(1010); // recordFreezeEnd (latency = 10ms)
		performanceMonitor.recordFreezeEnd(startTime, 1024 * 1024, 5);

		const report = performanceMonitor.getReport();

		expect(report.freezeThaw.freezeCount).toBe(1);
		expect(report.freezeThaw.totalFreezeLatencyMs).toBeGreaterThanOrEqual(10);
		expect(report.freezeThaw.totalMemoryReclaimedBytes).toBe(1024 * 1024);
		expect(report.freezeThaw.totalSnapshotCaptureMs).toBe(5);
		expect(report.freezeThaw.averageFreezeLatencyMs).toBeGreaterThanOrEqual(10);
		expect(report.freezeThaw.averageSnapshotCaptureMs).toBe(5);
	});

	test('should record thaw metrics', () => {
		const perfNowSpy = vi.spyOn(performance, 'now');
		perfNowSpy.mockReturnValueOnce(2000); // recordThawStart
		const startTime = performanceMonitor.recordThawStart();

		perfNowSpy.mockReturnValueOnce(2015); // recordThawEnd (latency = 15ms)
		performanceMonitor.recordThawEnd(startTime, 8);

		const report = performanceMonitor.getReport();

		expect(report.freezeThaw.thawCount).toBe(1);
		expect(report.freezeThaw.totalThawLatencyMs).toBeGreaterThanOrEqual(15);
		expect(report.freezeThaw.totalSnapshotRestoreMs).toBe(8);
		expect(report.freezeThaw.averageThawLatencyMs).toBeGreaterThanOrEqual(15);
		expect(report.freezeThaw.averageSnapshotRestoreMs).toBe(8);
	});

	test('should calculate averages over multiple cycles', () => {
		const perfNowSpy = vi.spyOn(performance, 'now');

		perfNowSpy.mockReturnValueOnce(1000); // first freezeStart
		let startTime = performanceMonitor.recordFreezeStart();
		perfNowSpy.mockReturnValueOnce(1010); // first freezeEnd (latency = 10)
		performanceMonitor.recordFreezeEnd(startTime, 1024 * 1024, 5);

		perfNowSpy.mockReturnValueOnce(2000); // second freezeStart
		startTime = performanceMonitor.recordFreezeStart();
		perfNowSpy.mockReturnValueOnce(2020); // second freezeEnd (latency = 20)
		performanceMonitor.recordFreezeEnd(startTime, 2 * 1024 * 1024, 10);

		const report = performanceMonitor.getReport();

		expect(report.freezeThaw.freezeCount).toBe(2);
		expect(report.freezeThaw.averageFreezeLatencyMs).toBe(15);
		expect(report.freezeThaw.averageSnapshotCaptureMs).toBe(7.5);
	});

	test('should track frame time metrics', () => {
		// Each advanceTimersByTime fires rAF which calls performance.now() twice:
		// once internally (extra), once in tick()
		const perfNowSpy = vi.spyOn(performance, 'now');
		perfNowSpy
			.mockReturnValueOnce(0)    // startFrameMonitoring: lastFrameTime
			.mockReturnValueOnce(16)   // initial tick: frameTime = 16
			.mockReturnValueOnce(16)   // rAF 1: extra internal call
			.mockReturnValueOnce(32)   // rAF 1: tick, frameTime = 16
			.mockReturnValueOnce(32)   // rAF 2: extra internal call
			.mockReturnValueOnce(48)   // rAF 2: tick, frameTime = 16
			.mockReturnValueOnce(48)   // rAF 3: extra internal call
			.mockReturnValueOnce(64)   // rAF 3: tick, frameTime = 16
			.mockReturnValue(64);

		performanceMonitor.startFrameMonitoring();

		vi.advanceTimersByTime(16);
		vi.advanceTimersByTime(16);
		vi.advanceTimersByTime(16);

		performanceMonitor.stopFrameMonitoring();

		const report = performanceMonitor.getReport();

		expect(report.frameTime.frameCount).toBe(4);
		expect(report.frameTime.averageFrameTimeMs).toBeCloseTo(16, 0);
		expect(report.frameTime.maxFrameTimeMs).toBe(16);
		expect(report.frameTime.minFrameTimeMs).toBe(16);
	});

	test('should detect dropped frames', () => {
		const perfNowSpy = vi.spyOn(performance, 'now');
		perfNowSpy
			.mockReturnValueOnce(0)    // startFrameMonitoring: lastFrameTime
			.mockReturnValueOnce(0)    // initial tick: frameTime = 0
			.mockReturnValueOnce(0)    // rAF 1: extra internal call
			.mockReturnValueOnce(16)   // rAF 1: tick, frameTime = 16
			.mockReturnValueOnce(16)   // rAF 2: extra internal call
			.mockReturnValueOnce(49)   // rAF 2: tick, frameTime = 33 (dropped)
			.mockReturnValueOnce(49)   // rAF 3: extra internal call
			.mockReturnValueOnce(65)   // rAF 3: tick, frameTime = 16
			.mockReturnValue(65);

		performanceMonitor.startFrameMonitoring();

		vi.advanceTimersByTime(16);
		vi.advanceTimersByTime(33);
		vi.advanceTimersByTime(16);

		performanceMonitor.stopFrameMonitoring();

		const report = performanceMonitor.getReport();

		expect(report.frameTime.droppedFrames).toBe(1);
	});

	test('should calculate frame time percentiles', () => {
		const perfNowSpy = vi.spyOn(performance, 'now');
		// Each advance fires rAF: 1 extra + 1 tick call
		perfNowSpy
			.mockReturnValueOnce(0)    // startFrameMonitoring: lastFrameTime
			.mockReturnValueOnce(0)    // initial tick: frameTime = 0
			.mockReturnValueOnce(10)   // rAF 1: extra
			.mockReturnValueOnce(10)   // rAF 1: tick, frameTime = 10
			.mockReturnValueOnce(22)   // rAF 2: extra
			.mockReturnValueOnce(22)   // rAF 2: tick, frameTime = 12
			.mockReturnValueOnce(36)   // rAF 3: extra
			.mockReturnValueOnce(36)   // rAF 3: tick, frameTime = 14
			.mockReturnValueOnce(52)   // rAF 4: extra
			.mockReturnValueOnce(52)   // rAF 4: tick, frameTime = 16
			.mockReturnValueOnce(68)   // rAF 5: extra
			.mockReturnValueOnce(68)   // rAF 5: tick, frameTime = 16
			.mockReturnValueOnce(84)   // rAF 6: extra
			.mockReturnValueOnce(84)   // rAF 6: tick, frameTime = 16
			.mockReturnValueOnce(100)  // rAF 7: extra
			.mockReturnValueOnce(100)  // rAF 7: tick, frameTime = 16
			.mockReturnValueOnce(118)  // rAF 8: extra
			.mockReturnValueOnce(118)  // rAF 8: tick, frameTime = 18
			.mockReturnValueOnce(138)  // rAF 9: extra
			.mockReturnValueOnce(138)  // rAF 9: tick, frameTime = 20
			.mockReturnValueOnce(188)  // rAF 10: extra
			.mockReturnValueOnce(188)  // rAF 10: tick, frameTime = 50
			.mockReturnValue(188);

		performanceMonitor.startFrameMonitoring();

		const frameTimes = [10, 12, 14, 16, 16, 16, 16, 18, 20, 50];
		frameTimes.forEach(time => vi.advanceTimersByTime(time));

		performanceMonitor.stopFrameMonitoring();

		const stats = performanceMonitor.getFrameTimeStats();

		expect(stats.p50).toBe(16);
		expect(stats.p90).toBe(20);
		expect(stats.p95).toBe(50);
		expect(stats.p99).toBe(50);
	});

	test('should include memory info in report', () => {
		const report = performanceMonitor.getReport();

		expect(report.memory).toHaveProperty('currentHeapUsed');
		expect(report.memory).toHaveProperty('currentHeapTotal');
		expect(report.memory).toHaveProperty('peakHeapUsed');
		expect(report.memory).toHaveProperty('webglContextsActive');
	});

	test('should reset all metrics', () => {
		const perfNowSpy = vi.spyOn(performance, 'now');
		perfNowSpy
			.mockReturnValueOnce(1000)  // recordFreezeStart
			.mockReturnValueOnce(1010)  // recordFreezeEnd (latency = 10)
			.mockReturnValueOnce(0)     // startFrameMonitoring: lastFrameTime
			.mockReturnValueOnce(0)     // initial tick
			.mockReturnValueOnce(0)     // rAF: extra internal call
			.mockReturnValueOnce(16)    // rAF: tick
			.mockReturnValue(16);

		const startTime = performanceMonitor.recordFreezeStart();
		vi.advanceTimersByTime(10);
		performanceMonitor.recordFreezeEnd(startTime);

		performanceMonitor.startFrameMonitoring();
		vi.advanceTimersByTime(16);
		performanceMonitor.stopFrameMonitoring();

		performanceMonitor.reset();

		const report = performanceMonitor.getReport();

		expect(report.freezeThaw.freezeCount).toBe(0);
		expect(report.freezeThaw.thawCount).toBe(0);
		expect(report.frameTime.frameCount).toBe(0);
		expect(report.frameTime.droppedFrames).toBe(0);
	});

	test('should expose to devtools', () => {
		performanceMonitor.exposeToDevTools();

		expect((window as any).__VNINVESTCHARTS_PERF__).toBeDefined();
		expect(typeof (window as any).__VNINVESTCHARTS_PERF__.getReport).toBe('function');
		expect(typeof (window as any).__VNINVESTCHARTS_PERF__.logReport).toBe('function');
		expect(typeof (window as any).__VNINVESTCHARTS_PERF__.reset).toBe('function');
	});
});