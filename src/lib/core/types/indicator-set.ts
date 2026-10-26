import type { PaneDescriptor } from "./pane-descriptor";

export interface IndicatorSet {
	id: string;
	name: string;
	createdAt: number;
	updatedAt: number;
	panes: readonly PaneDescriptor[];
	isBuiltin?: boolean;
}

export interface IndicatorSetsStorage {
	version: 1;
	sets: readonly IndicatorSet[];
}

export interface IndicatorSetStorageLike {
	getItem: (key: string) => string | null;
	setItem: (key: string, value: string) => void;
	removeItem: (key: string) => void;
}

export const INDICATOR_SETS_STORAGE_KEY = "vnsc:indicator-sets-v1";