/**
 * CS-6 — why a license cannot be verified in this environment, if that is why.
 *
 * The engine fails closed and silent when WebCrypto is unavailable: no subtle
 * means no verify means free, with nothing logged. On an `http://<LAN-IP>` dev
 * server or a non-TLS self-host that reads as "Pro vanished for no reason".
 * This hook names the cause so the UI can say it out loud instead.
 *
 * Runs independent of verification itself: it answers about the ENVIRONMENT,
 * not about any key. Never throws, never fetches, safe to call on every render
 * (the result is referentially stable per environment).
 */
import { useMemo } from "react";

export type LicenseDiagnosticReason = "insecure-context" | "subtle-unavailable" | null;

export interface LicenseDiagnostics {
	/** False on plain http (non-localhost). WebCrypto requires a secure context. */
	secureContext: boolean;
	/** False when crypto.subtle is missing for any reason. */
	subtleAvailable: boolean;
	/** Non-null exactly when a license cannot be verified for environmental reasons. */
	reason: LicenseDiagnosticReason;
}

function detect(): LicenseDiagnostics {
	let secureContext = true;
	let subtleAvailable = true;
	try {
		// This whole function is an environment probe: isSecureContext and
		// crypto.subtle are properties of the HOST, not of the widget, so there is
		// no adapter to inject. `no-restricted-globals` guards rendering paths
		// against ambient access; here the ambient scope is the subject. Each read
		// is in its own try, because a cross-origin or sandboxed iframe can throw on
		// access rather than return undefined.
		/* eslint-disable-next-line no-restricted-globals */
		if (typeof globalThis.isSecureContext === "boolean" && !globalThis.isSecureContext) {
			secureContext = false;
		}
	} catch {
		secureContext = false;
	}
	try {
		/* eslint-disable-next-line no-restricted-globals */
		if (!globalThis.crypto?.subtle) subtleAvailable = false;
	} catch {
		subtleAvailable = false;
	}
	return {
		secureContext,
		subtleAvailable,
		reason: !secureContext ? "insecure-context" : !subtleAvailable ? "subtle-unavailable" : null,
	};
}

export function useLicenseDiagnostics(): LicenseDiagnostics {
	return useMemo(detect, []);
}

/**
 * Pure environment probe, exported so the provider can report the same reason
 * through `onLicenseDiagnostic` without mounting the hook. Same logic, one place.
 */
export function detectLicenseEnvironment(): LicenseDiagnosticReason {
	return detect().reason;
}
