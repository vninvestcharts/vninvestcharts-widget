import { useCallback, useEffect, useMemo, useState } from "react";
import { listRegistered } from "../registry/SeriesRegistry";
import { BUILTIN_INDICATOR_SETS } from "../sets/builtins";
import {
	buildIndicatorSetFileName,
	cloneIndicatorSet,
	createIndicatorSet,
	indicatorSetToPaneLayout,
	loadIndicatorSets,
	sanitizeIndicatorSet,
	saveIndicatorSets,
	stringifyIndicatorSet,
} from "../sets/indicatorSetCodec";
import type { IndicatorSet, IndicatorSetStorageLike } from "../types/indicator-set";
import type { PaneDescriptor } from "../types/pane-descriptor";

export interface UseIndicatorSetsOptions {
	currentPanes: readonly PaneDescriptor[];
	storage?: IndicatorSetStorageLike;
	onApplyPanes?: (panes: readonly PaneDescriptor[]) => void;
}

export interface UseIndicatorSetsResult {
	sets: IndicatorSet[];
	builtinSets: readonly IndicatorSet[];
	userSets: IndicatorSet[];
	getSetById: (id: string) => IndicatorSet | undefined;
	saveCurrentAsSet: (name: string) => IndicatorSet | null;
	applySet: (id: string) => boolean;
	renameSet: (id: string, name: string) => boolean;
	deleteSet: (id: string) => boolean;
	exportSet: (id: string) => boolean;
	importSet: (file: File) => Promise<IndicatorSet | null>;
}

function pickStorage(storage?: IndicatorSetStorageLike): IndicatorSetStorageLike | undefined {
	if (storage) {
		return storage;
	}
	if (typeof localStorage === "undefined") {
		return undefined;
	}
	return localStorage;
}

function readFileAsText(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result ?? ""));
		reader.onerror = () => reject(reader.error ?? new Error("Unable to read file"));
		reader.readAsText(file);
	});
}

function mergeSets(builtinSets: readonly IndicatorSet[], userSets: readonly IndicatorSet[]): IndicatorSet[] {
	const merged = new Map<string, IndicatorSet>();
	builtinSets.forEach((set) => {
		merged.set(set.id, cloneIndicatorSet({ ...set, isBuiltin: true }));
	});
	userSets.forEach((set) => {
		if (!merged.has(set.id)) {
			merged.set(set.id, cloneIndicatorSet({ ...set, isBuiltin: false }));
		}
	});
	return [...merged.values()].sort((left, right) => {
		if (left.isBuiltin !== right.isBuiltin) {
			return left.isBuiltin ? -1 : 1;
		}
		return right.updatedAt - left.updatedAt;
	});
}

export function useIndicatorSets(options: UseIndicatorSetsOptions): UseIndicatorSetsResult {
	const storage = useMemo(() => pickStorage(options.storage), [options.storage]);
	const allowedSeriesTypes = useMemo(() => listRegistered(), []);
	const builtinSets = BUILTIN_INDICATOR_SETS;
	const [userSets, setUserSets] = useState<IndicatorSet[]>(() => {
		const loaded = loadIndicatorSets(storage, { allowedSeriesTypes });
		return loaded.map((set) => cloneIndicatorSet({ ...set, isBuiltin: false }));
	});

	useEffect(() => {
		saveIndicatorSets(storage, userSets);
	}, [storage, userSets]);

	const sets = useMemo(() => mergeSets(builtinSets, userSets), [builtinSets, userSets]);

	const getSetById = useCallback((id: string) => sets.find((set) => set.id === id), [sets]);

	const saveCurrentAsSet = useCallback((name: string) => {
		const trimmed = name.trim();
		if (!trimmed) {
			return null;
		}
		const nextSet = createIndicatorSet(trimmed, options.currentPanes);
		setUserSets((current) => [nextSet, ...current.filter((set) => set.id !== nextSet.id)]);
		return nextSet;
	}, [options.currentPanes]);

	const applySet = useCallback((id: string) => {
		const set = sets.find((item) => item.id === id);
		if (!set) {
			return false;
		}
		options.onApplyPanes?.(indicatorSetToPaneLayout(set));
		return true;
	}, [options.onApplyPanes, sets]);

	const renameSet = useCallback((id: string, name: string) => {
		const trimmed = name.trim();
		if (!trimmed) {
			return false;
		}
		let renamed = false;
		setUserSets((current) => current.map((set) => {
			if (set.id !== id || set.isBuiltin) {
				return set;
			}
			renamed = true;
			return {
				...set,
				name: trimmed,
				updatedAt: Date.now(),
			};
		}));
		return renamed;
	}, []);

	const deleteSet = useCallback((id: string) => {
		let removed = false;
		setUserSets((current) => current.filter((set) => {
			if (set.id !== id || set.isBuiltin) {
				return true;
			}
			removed = true;
			return false;
		}));
		return removed;
	}, []);

	const exportSet = useCallback((id: string) => {
		const set = sets.find((item) => item.id === id);
		if (!set || typeof document === "undefined") {
			return false;
		}
		try {
			const blob = new Blob([stringifyIndicatorSet(set)], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = buildIndicatorSetFileName(set.name, set.createdAt);
			link.click();
			URL.revokeObjectURL(url);
			return true;
		} catch {
			return false;
		}
	}, [sets]);

	const importSet = useCallback(async (file: File) => {
		try {
			const text = await readFileAsText(file);
			const parsed = JSON.parse(text) as unknown;
			const imported = sanitizeIndicatorSet(parsed, { allowedSeriesTypes, preserveBuiltin: false });
			if (!imported) {
				return null;
			}
			const nextSet = {
				...imported,
				isBuiltin: false,
				updatedAt: Date.now(),
			};
			setUserSets((current) => [nextSet, ...current.filter((set) => set.id !== nextSet.id)]);
			return nextSet;
		} catch {
			return null;
		}
	}, [allowedSeriesTypes]);

	return {
		sets,
		builtinSets,
		userSets,
		getSetById,
		saveCurrentAsSet,
		applySet,
		renameSet,
		deleteSet,
		exportSet,
		importSet,
	};
}