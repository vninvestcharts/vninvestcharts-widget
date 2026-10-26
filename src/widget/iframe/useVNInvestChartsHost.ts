/**
 * useVNInvestChartsHost — React hook for the iframe Host SDK.
 *
 * Lives in its own module (instead of hostSDK.ts) so vanilla-JS hosts never
 * pay for a React import. Connects on mount, disconnects on unmount.
 *
 * NOTE: memoize `config` (or at least `config.iframe`) in the caller — a new
 * object identity reconnects, same as any effect-driven resource hook.
 */
import { useEffect, useState } from "react";
import {
	createVNInvestChartsHost,
	type HostSDKConfig,
	type VNInvestChartsHostSDK,
} from "./hostSDK";

export interface UseVNInvestChartsHostResult {
	sdk: VNInvestChartsHostSDK | null;
	controller: ReturnType<VNInvestChartsHostSDK["getController"]> | null;
	connecting: boolean;
	error: Error | null;
}

export function useVNInvestChartsHost(config: HostSDKConfig): UseVNInvestChartsHostResult {
	const [sdk, setSdk] = useState<VNInvestChartsHostSDK | null>(null);
	const [controller, setController] = useState<ReturnType<VNInvestChartsHostSDK["getController"]> | null>(null);
	const [connecting, setConnecting] = useState<boolean>(true);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		let cancelled = false;
		let instance: VNInvestChartsHostSDK | null = null;
		setConnecting(true);
		setError(null);
		setSdk(null);
		setController(null);
		createVNInvestChartsHost(config).then(
			(next) => {
				instance = next;
				if (cancelled) {
					next.disconnect();
					return;
				}
				setSdk(next);
				setController(next.getController());
				setConnecting(false);
			},
			(failure: unknown) => {
				if (cancelled) return;
				setError(failure instanceof Error ? failure : new Error(String(failure)));
				setConnecting(false);
			},
		);
		return () => {
			cancelled = true;
			instance?.disconnect();
		};
		// Reconnect only when the target or timeouts change; callers memoize the rest.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [config.iframe, config.connectionTimeout, config.requestTimeout]);

	return { sdk, controller, connecting, error };
}

