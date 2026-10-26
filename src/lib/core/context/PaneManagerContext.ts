import { createContext, createElement, useContext } from "react";
import type { ReactNode } from "react";
import type { PaneManagerState } from "../hooks/usePaneManager";

const PaneManagerContext = createContext<PaneManagerState | undefined>(undefined);

export interface PaneManagerProviderProps {
	value: PaneManagerState;
	children: ReactNode;
}

export function PaneManagerProvider({ value, children }: PaneManagerProviderProps) {
	return createElement(PaneManagerContext.Provider, { value }, children);
}

export function usePaneManagerContext() {
	const context = useContext(PaneManagerContext);
	if (!context) {
		throw new Error("usePaneManagerContext must be used within a PaneManagerProvider");
	}
	return context;
}

export { PaneManagerContext };