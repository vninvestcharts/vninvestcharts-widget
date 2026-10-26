import { describe, expect, it, vi } from "vitest";

import {
	createRuntimeInvalidationBatcher,
	type CancelFrame,
	type ScheduleFrame,
} from "../runtimeInvalidationBatch";
import type { WidgetPaneRuntimeSnapshot, WidgetRuntimeCapabilities } from "../../widget/VNInvestCharts";

function createManualFrameScheduler() {
	let idSeed = 0;
	const scheduled = new Map<number, () => void>();

	const scheduleFrame: ScheduleFrame = (flush) => {
		idSeed += 1;
		scheduled.set(idSeed, flush);
		return idSeed;
	};

	const cancelFrameSpy = vi.fn((id: number) => {
		scheduled.delete(id);
	});
	const cancelFrame: CancelFrame = (id) => {
		cancelFrameSpy(id);
	};

	const flushFrame = (id: number) => {
		const flush = scheduled.get(id);
		if (!flush) {
			return;
		}
		scheduled.delete(id);
		flush();
	};

	const flushAll = () => {
		for (const id of [...scheduled.keys()]) {
			flushFrame(id);
		}
	};

	return {
		scheduleFrame,
		cancelFrame,
		cancelFrameSpy,
		flushAll,
		getScheduledIds: () => [...scheduled.keys()],
	};
}

describe("runtimeInvalidationBatch", () => {
	it("batches pane snapshots and runtime capabilities into one frame flush", () => {
		const scheduler = createManualFrameScheduler();
		const paneCalls: Array<readonly WidgetPaneRuntimeSnapshot[]> = [];
		const capabilityCalls: Array<WidgetRuntimeCapabilities | null> = [];

		const batcher = createRuntimeInvalidationBatcher({
			onPaneSnapshots: (snapshots) => paneCalls.push(snapshots),
			onRuntimeCapabilities: (capabilities) => capabilityCalls.push(capabilities),
		}, {
			scheduleFrame: scheduler.scheduleFrame,
			cancelFrame: scheduler.cancelFrame,
		});

		batcher.queuePaneSnapshots([{ paneId: "price" } as WidgetPaneRuntimeSnapshot]);
		batcher.queuePaneSnapshots([{ paneId: "volume" } as WidgetPaneRuntimeSnapshot]);
		batcher.queueRuntimeCapabilities({
			engineRuntime: "fork",
			forkSupported: true,
			paneToolbar: true,
			paneSplitters: true,
			chartCanvasOverlays: true,
			measurementOverlay: true,
			drawingOverlays: false,
		});

		expect(scheduler.getScheduledIds()).toHaveLength(1);
		scheduler.flushAll();

		expect(paneCalls).toHaveLength(1);
		expect(capabilityCalls).toHaveLength(1);
		expect(paneCalls[0]).toEqual([{ paneId: "volume" }]);
		expect(capabilityCalls[0]?.engineRuntime).toBe("fork");
	});

	it("invalidates only changed layer when runtime capabilities are not queued", () => {
		const scheduler = createManualFrameScheduler();
		const paneCalls: Array<readonly WidgetPaneRuntimeSnapshot[]> = [];
		const capabilityCalls: Array<WidgetRuntimeCapabilities | null> = [];

		const batcher = createRuntimeInvalidationBatcher({
			onPaneSnapshots: (snapshots) => paneCalls.push(snapshots),
			onRuntimeCapabilities: (capabilities) => capabilityCalls.push(capabilities),
		}, {
			scheduleFrame: scheduler.scheduleFrame,
			cancelFrame: scheduler.cancelFrame,
		});

		batcher.queuePaneSnapshots([{ paneId: "price" } as WidgetPaneRuntimeSnapshot]);
		scheduler.flushAll();

		expect(paneCalls).toHaveLength(1);
		expect(capabilityCalls).toHaveLength(0);
	});

	it("dispose cancels pending frame and prevents late callback execution", () => {
		const scheduler = createManualFrameScheduler();
		const paneSpy = vi.fn();
		const capabilitySpy = vi.fn();

		const batcher = createRuntimeInvalidationBatcher({
			onPaneSnapshots: paneSpy,
			onRuntimeCapabilities: capabilitySpy,
		}, {
			scheduleFrame: scheduler.scheduleFrame,
			cancelFrame: scheduler.cancelFrame,
		});

		batcher.queuePaneSnapshots([{ paneId: "price" } as WidgetPaneRuntimeSnapshot]);
		const scheduledBeforeDispose = scheduler.getScheduledIds();
		expect(scheduledBeforeDispose).toHaveLength(1);

		batcher.dispose();
		expect(scheduler.cancelFrameSpy).toHaveBeenCalledWith(scheduledBeforeDispose[0]);
		scheduler.flushAll();

		expect(paneSpy).not.toHaveBeenCalled();
		expect(capabilitySpy).not.toHaveBeenCalled();
	});
});
