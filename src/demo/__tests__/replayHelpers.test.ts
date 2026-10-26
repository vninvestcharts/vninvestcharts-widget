import { describe, expect, it } from "vitest";

import { resolveReplayStartIndexOnDataSync, shouldOpenReplayContextMenu } from "../replayHelpers";

describe("resolveReplayStartIndexOnDataSync", () => {
	it("keeps replay pinned to latest when cursor was at previous latest", () => {
		expect(resolveReplayStartIndexOnDataSync({
			currentIndex: 100,
			previousTotal: 100,
			nextTotal: 120,
		})).toBe(120);
	});

	it("preserves historical cursor when replay is not at latest", () => {
		expect(resolveReplayStartIndexOnDataSync({
			currentIndex: 42,
			previousTotal: 100,
			nextTotal: 120,
		})).toBe(42);
	});

	it("clamps preserved cursor to the new data length when data shrinks", () => {
		expect(resolveReplayStartIndexOnDataSync({
			currentIndex: 42,
			previousTotal: 100,
			nextTotal: 30,
		})).toBe(30);
	});

	it("returns zero when next data is empty", () => {
		expect(resolveReplayStartIndexOnDataSync({
			currentIndex: 10,
			previousTotal: 100,
			nextTotal: 0,
		})).toBe(0);
	});
});

describe("shouldOpenReplayContextMenu", () => {
	it("returns true only when replay mode is active and context is valid", () => {
		expect(shouldOpenReplayContextMenu({
			showReplayBar: true,
			hasCurrentItemDate: true,
			hasShellNode: true,
			hasDrawingContextMenu: false,
			isAltRightClick: true,
			isTouchLongPress: false,
		})).toBe(true);
	});

	it("allows opening on mobile long-press when replay mode is active", () => {
		expect(shouldOpenReplayContextMenu({
			showReplayBar: true,
			hasCurrentItemDate: true,
			hasShellNode: true,
			hasDrawingContextMenu: false,
			isAltRightClick: false,
			isTouchLongPress: true,
		})).toBe(true);
	});

	it("blocks opening when Alt + right-click shortcut is not used", () => {
		expect(shouldOpenReplayContextMenu({
			showReplayBar: true,
			hasCurrentItemDate: true,
			hasShellNode: true,
			hasDrawingContextMenu: false,
			isAltRightClick: false,
			isTouchLongPress: false,
		})).toBe(false);
	});

	it("blocks opening when replay bar is hidden", () => {
		expect(shouldOpenReplayContextMenu({
			showReplayBar: false,
			hasCurrentItemDate: true,
			hasShellNode: true,
			hasDrawingContextMenu: false,
			isAltRightClick: true,
			isTouchLongPress: false,
		})).toBe(false);
	});

	it("blocks opening when drawing context menu is already open", () => {
		expect(shouldOpenReplayContextMenu({
			showReplayBar: true,
			hasCurrentItemDate: true,
			hasShellNode: true,
			hasDrawingContextMenu: true,
			isAltRightClick: true,
			isTouchLongPress: false,
		})).toBe(false);
	});
});
