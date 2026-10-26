// @vitest-environment jsdom
// P3-07 (2026-11): the anchor-reconciliation effect must NOT be recorded as a
// user edit.
//
// `useWidgetDrawings` re-anchors drawing points to the current time-index map
// whenever `plotData` changes. It used to dispatch that through
// `replaceDrawings`, which is the USER-INTENT channel: it pushed an undo step
// and cleared the redo stack. Measured consequences, all from one cause:
//
//   M1  draw one line, press Ctrl+Z once -> the line is still on screen;
//   M2  draw -> Delete -> Ctrl+Z -> Ctrl+Y is a no-op whenever the index map
//       shifted in between (the P3-07 E2E flake, 4 PASS / 2 FAIL);
//   M3  every live-data tick that shifts indices burns an invisible undo step.
//
// The reducer-level lock lives in the engine
// (`packages/vn-kline-engine-drawing/src/history.test.ts`). This file proves
// the WIDGET actually calls the non-recording channel — a reducer test alone
// would stay green if this effect went back to `replaceDrawings`.
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { useWidgetDrawings } from "../useWidgetDrawings";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const SYMBOL = "P307";
const TIMEFRAME = "1m";
const STORAGE_KEY = `rsc-drawings-v1-${SYMBOL}-${TIMEFRAME}`;
const BASE_MS = 1_700_000_000_000;

/** A drawing whose points carry `timeMsHint` but no `xIndexFloat` — i.e. one the reconciler must rewrite. */
const rawDrawing = {
	id: "d1",
	type: "trendLine",
	points: [
		{ x: 0, y: 100, timeMsHint: BASE_MS + 60_000 },
		{ x: 10, y: 95, timeMsHint: BASE_MS + 120_000 },
	],
	style: { stroke: "#2962ff", strokeWidth: 2 },
} as any;

function makePlotData(shiftBars: number) {
	return Array.from({ length: 5 }, (_, i) => ({
		// `createDateTimeIndexMap` reads `item.date.getTime()` — an ISO string
		// here throws inside the reconcile effect (timeIndexMap.ts:122).
		date: new Date(BASE_MS + (i + shiftBars) * 60_000),
		open: 1, high: 2, low: 0.5, close: 1.5,
		volume: 1,
	})) as any[];
}

function makeKeyboardAdapter() {
	const handlers = new Set<(e: KeyboardEvent) => void>();
	return {
		adapter: {
			onKeyDown: (h: (e: KeyboardEvent) => void) => {
				handlers.add(h);
				return () => { handlers.delete(h); };
			},
			onShortcut: () => () => {},
		} as any,
		fire: (e: KeyboardEvent) => { handlers.forEach((h) => h(e)); },
	};
}

/**
 * Mounts the hook with a mutable `shiftBars` so the test can simulate a live
 * data tick (the index map moving) between two keystrokes.
 *
 * Starts EMPTY and lets the test DRAW, rather than seeding a drawing through
 * storage. Two fixture facts, both learned the hard way:
 *
 *  1. Passing `defaultDrawings` as well would put a drawing in `present` before
 *     hydration.
 *  2. Seeding a non-empty list through storage stopped recording an undo step
 *     in this same session — hydration now RECONCILEs, because loading is not a
 *     user intent (engine `handleStorageLoad`). M1 and M3 had been leaning on
 *     that step as their undo entry; once it correctly stopped existing, one
 *     Ctrl+Z had nothing to undo and both tests failed. They now draw first,
 *     through the same PUSH a completed drag dispatches.
 */
function mountProbe(keyboard: ReturnType<typeof makeKeyboardAdapter>, initialShift: number) {
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	const captured: { drawings?: any } = {};
	let shiftBars = initialShift;

	function Probe({ shift }: { shift: number }) {
		const drawingsResult = useWidgetDrawings({
			plotData: makePlotData(shift),
			symbol: SYMBOL,
			timeframe: TIMEFRAME as any,
			drawingUiEnabled: true,
			keyboardAdapter: keyboard.adapter,
			useForkRuntime: true,
			isEditingText: false,
		});
		captured.drawings = drawingsResult;
		return null;
	}
	const render = (shift: number) => {
		shiftBars = shift;
		act(() => { root.render(createElement(Probe, { shift })); });
	};
	render(shiftBars);
	/** The user's drag: PUSH is a user intent, so it DOES belong in the timeline. */
	const draw = () => {
		act(() => {
			captured.drawings.drawingWorkspace.interaction.dispatch({
				type: "PUSH",
				drawing: JSON.parse(JSON.stringify(rawDrawing)),
			});
		});
	};
	return {
		captured,
		render,
		draw,
		cleanup: () => {
			act(() => { root.unmount(); });
			container.remove();
			window.localStorage.removeItem(STORAGE_KEY);
		},
	};
}

function pressCtrl(keyboard: ReturnType<typeof makeKeyboardAdapter>, key: string) {
	const evt = new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true });
	act(() => {
		window.dispatchEvent(evt);
		keyboard.fire(evt);
	});
}

describe("P3-07: anchor reconciliation is not a user edit (useWidgetDrawings)", () => {
	it("M2/AC-A3: Ctrl+Y still redoes after Ctrl+Z when the index map shifted in between", () => {
		const keyboard = makeKeyboardAdapter();
		const probe = mountProbe(keyboard, 0);
		try {
			const ws = () => probe.captured.drawings.drawingWorkspace;

			// draw -> delete
			probe.draw();
			expect(ws().state.drawings).toHaveLength(1);
			act(() => { ws().selectDrawing("d1"); });
			act(() => { ws().interaction.replaceDrawings([]); });
			expect(ws().state.drawings).toHaveLength(0);

			pressCtrl(keyboard, "z");                                  // Ctrl+Z restores
			expect(ws().state.drawings).toHaveLength(1);
			expect(ws().interaction.canRedo).toBe(true);

			// Live data tick: the time-index map moves one bar.
			probe.render(1);

			// The reconcile effect has now re-anchored the restored drawing.
			// Before the fix this dispatched REPLACE, `canRedo` went false,
			// and Ctrl+Y below was a no-op — the P3-07 failure.
			pressCtrl(keyboard, "y");                                  // Ctrl+Y
			expect(ws().state.drawings).toHaveLength(0);
		} finally {
			probe.cleanup();
		}
	});

	it("M1/AC-A4: one Ctrl+Z after the reconcile removes the drawing", () => {
		const keyboard = makeKeyboardAdapter();
		const probe = mountProbe(keyboard, 0);
		try {
			const ws = () => probe.captured.drawings.drawingWorkspace;
			probe.draw();
			expect(ws().state.drawings).toHaveLength(1);
			// The reconcile effect has anchored the new drawing's points.

			pressCtrl(keyboard, "z");
			// Before the fix `present` was still length 1: the first undo only
			// undid the normalization, so the user had to press twice.
			expect(ws().state.drawings).toHaveLength(0);
		} finally {
			probe.cleanup();
		}
	});

	it("M3/AC-A5: repeated live-data ticks do not accumulate invisible undo steps", () => {
		const keyboard = makeKeyboardAdapter();
		const probe = mountProbe(keyboard, 0);
		try {
			const ws = () => probe.captured.drawings.drawingWorkspace;
			probe.draw();
			for (let tick = 1; tick <= 5; tick += 1) {
				probe.render(tick);
			}
			expect(ws().state.drawings).toHaveLength(1);

			pressCtrl(keyboard, "z");
			// Before the fix this was length 1: five ticks had pushed five
			// invisible steps, so one Ctrl+Z did nothing.
			expect(ws().state.drawings).toHaveLength(0);
		} finally {
			probe.cleanup();
		}
	});

	it("the reconcile effect still re-anchors (it is not simply disabled)", () => {
		const keyboard = makeKeyboardAdapter();
		const probe = mountProbe(keyboard, 0);
		try {
			const ws = () => probe.captured.drawings.drawingWorkspace;
			probe.draw();
			// VACUITY GUARD (L-E01). A fix that simply stopped reconciling would
			// satisfy M1/M3 by never dispatching anything — and re-anchor nothing.
			// The points must actually carry an index now.
			const point = ws().state.drawings[0].points[0];
			expect(typeof point.xIndexFloat).toBe("number");
			expect(typeof point.timeMsHint).toBe("number");
		} finally {
			probe.cleanup();
		}
	});
});
