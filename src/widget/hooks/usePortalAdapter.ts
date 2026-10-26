import { useEffect, useRef, useState, useCallback } from "react";
import { usePortalRoot } from "../context/VNInvestChartsContext";
import type { PortalAdapter } from "@vninvestcharts/engine-react";

export interface UsePortalAdapterOptions {
  portalAdapter: PortalAdapter;
}

export function usePortalAdapter(options: UsePortalAdapterOptions) {
	const { portalAdapter } = options;
	const contextPortalRoot = usePortalRoot();
	const [portalTarget, setPortalTarget] = useState<Element | null>(null);

	// Initialize portal target
	useEffect(() => {
		const updateTarget = () => {
			if (portalAdapter) {
				// Use injected adapter
				setPortalTarget(portalAdapter.getContainer());
			} else if (contextPortalRoot) {
				// Use context portal root (for Shadow DOM)
				setPortalTarget(contextPortalRoot);
			} else if (typeof document !== "undefined" && document.body) {
				// LAST RESORT: light DOM. `VNInvestChartsContext.tsx:139` only supplies
				// `portalRoot` when the host passes one, which is exactly the Shadow DOM case,
				// so a null context value means we are in the light document and `body` is the
				// correct target. Without this the target stayed null forever and every
				// portalled surface was unreachable: the alerts modal returned null at
				// `AlertsModal.tsx:156`, so **no alert could ever be created**. Deliberately
				// not `document.body` when a shadow root IS in play, because that would move
				// the node out of the shadow tree and drop its styles.
				setPortalTarget(document.body);
			}
		};

		updateTarget();

		// Listen for fullscreen changes using portal adapter if available
		// Note: fullscreenchange is not covered by WindowEventAdapter, so we use document directly
		// This is acceptable as it's a rare event and only for portal positioning
		const target = typeof document !== "undefined" ? document : null;
		target?.addEventListener("fullscreenchange", updateTarget, { capture: true });

		return () => {
			target?.removeEventListener("fullscreenchange", updateTarget, { capture: true });
		};
	}, [portalAdapter, contextPortalRoot]);

	// Create a portal using the adapter
	const createPortal = useCallback((children: React.ReactNode) => {
		if (!portalTarget) return null;

		// We need to use ReactDOM.createPortal, but we can't import it here
		// The component using this hook should import createPortal and use portalTarget
		return portalTarget;
	}, [portalTarget]);

	return { portalTarget, createPortal };
}