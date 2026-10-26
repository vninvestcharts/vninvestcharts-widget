type PaneSnapshotLike = {
	paneId: string;
	bounds: {
		left: number;
		width: number;
		top: number;
		height: number;
	};
	headerAnchor: {
		top: number;
	};
};

type PanePointerEventLike = {
	currentTarget: {
		getBoundingClientRect: () => {
			left: number;
			top: number;
		};
	};
	clientX: number;
	clientY: number;
};

const PANE_HEADER_HEIGHT = 28;

export function resolveHoveredPaneId(
	event: PanePointerEventLike,
	snapshots: readonly PaneSnapshotLike[],
) {
	const rect = event.currentTarget.getBoundingClientRect();
	const localX = event.clientX - rect.left;
	const localY = event.clientY - rect.top;
	// Only activate header hover when cursor is within the header strip, not the full pane.
	const hoveredSnapshot = snapshots.find((snapshot) => {
		const headerTop = snapshot.headerAnchor.top;
		const headerBottom = headerTop + PANE_HEADER_HEIGHT;
		const right = snapshot.bounds.left + snapshot.bounds.width;
		return localX >= snapshot.bounds.left && localX <= right && localY >= headerTop && localY <= headerBottom;
	});

	return hoveredSnapshot?.paneId ?? null;
}

export function findPaneSnapshotAtPosition<T extends PaneSnapshotLike>(
	snapshots: readonly T[],
	localX: number,
	localY: number,
) {
	return snapshots.find((snapshot) => {
		const right = snapshot.bounds.left + snapshot.bounds.width;
		const bottom = snapshot.bounds.top + snapshot.bounds.height;
		return localX >= snapshot.bounds.left && localX <= right && localY >= snapshot.bounds.top && localY <= bottom;
	});
}