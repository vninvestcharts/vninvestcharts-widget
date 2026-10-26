export interface ReplayDataSyncInput {
	currentIndex: number;
	previousTotal: number;
	nextTotal: number;
}

export function resolveReplayStartIndexOnDataSync({
	currentIndex,
	previousTotal,
	nextTotal,
}: ReplayDataSyncInput): number {
	if (nextTotal <= 0) {
		return 0;
	}

	if (currentIndex >= previousTotal) {
		return nextTotal;
	}

	return Math.min(Math.max(currentIndex, 1), nextTotal);
}

export interface ReplayContextMenuGateInput {
	showReplayBar: boolean;
	hasCurrentItemDate: boolean;
	hasShellNode: boolean;
	hasDrawingContextMenu: boolean;
	isAltRightClick: boolean;
	isTouchLongPress: boolean;
}

export function shouldOpenReplayContextMenu({
	showReplayBar,
	hasCurrentItemDate,
	hasShellNode,
	hasDrawingContextMenu,
	isAltRightClick,
	isTouchLongPress,
}: ReplayContextMenuGateInput): boolean {
	if (!isAltRightClick && !isTouchLongPress) {
		return false;
	}

	if (!showReplayBar) {
		return false;
	}

	if (!hasCurrentItemDate || !hasShellNode) {
		return false;
	}

	if (hasDrawingContextMenu) {
		return false;
	}

	return true;
}
