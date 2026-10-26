/**
 * Runtime a host may ask for.
 *
 * `"legacy"` was removed on 2026-10-03 along with the DynamicChart lane
 * (G4). `"auto"` stays as a deprecated alias of fork, so hosts that still pass it
 * keep working. See ledger `G4_LEGACY_CUT_2026-10-03`.
 */
export type RequestedWidgetRuntime = "fork" | "auto";

/**
 * Runtime a host can observe.
 *
 * Narrowed to `"fork"` in 0.1.0, when the legacy lane was removed (the version was
 * 3.0.0 until 05d67df renamed it). It stayed a two-member union through the lane's
 * existence purely so existing
 * `onRuntimeResolved` consumers kept compiling, which is why the demo's own policy
 * return type could not be narrowed either.
 */
export type ResolvedWidgetRuntime = "fork";

export type WidgetRuntimeReasonCode =
	| "EXPLICIT_FORK_REQUEST"
	| "DEFAULT_FORK_RUNTIME"
	| "AUTO_DEFAULT_FORK_RUNTIME";

export interface WidgetRuntimePolicyInput {
	engineRuntime?: RequestedWidgetRuntime;
	drawingUiEnabled?: boolean;
	drawingActiveTool?: string;
	selectedDrawingType?: string | null;
}

export interface WidgetRuntimePolicyOutput {
	resolvedRuntime: ResolvedWidgetRuntime;
	reasonCode: WidgetRuntimeReasonCode;
}

/**
 * Dev-only deprecation notice, so a host still passing a frozen runtime finds out
 * from its own console rather than from a 0.1.0 changelog. Silent in production
 * builds: the value still works, and a warning per render is noise, not signal.
 */
function warnDeprecatedRuntime(subject: string, advice: string): void {
	if (process.env.NODE_ENV === "production") return;
	// eslint-disable-next-line no-console
	console.warn(`[runtimePolicy] ${subject} is deprecated: ${advice}`);
}

export function evaluateRuntimePolicy(input: WidgetRuntimePolicyInput): WidgetRuntimePolicyOutput {
	const requested = input.engineRuntime ?? "fork";
	// "auto" is a deprecated alias of fork (tool-lane fallback removed in L5 —
	// fork covers all tools since L1). Kept so hosts still passing it keep working.
	if (requested === "auto") {
		warnDeprecatedRuntime('engineRuntime="auto"', 'resolving fork. Pass "fork" explicitly.');
		return {
			resolvedRuntime: "fork",
			reasonCode: "AUTO_DEFAULT_FORK_RUNTIME",
		};
	}
	// The type no longer admits "legacy", but a host is JavaScript at runtime and can
	// pass the string anyway. Anything that is not literally "fork" resolves to fork,
	// so this function can never return a runtime it is unable to render. Without
	// this clamp it would hand back "legacy" and every caller would take a lane that
	// no longer exists.
	const reasonCode: WidgetRuntimeReasonCode = input.engineRuntime === undefined
		? "DEFAULT_FORK_RUNTIME"
		: "EXPLICIT_FORK_REQUEST";
	return {
		resolvedRuntime: "fork",
		reasonCode,
	};
}


/**
 * @deprecated Always `false` since the legacy lane was removed on 2026-10-03.
 * Removed from the public API in the same release that dropped DynamicChart.
 */
export function shouldForceLegacyRuntime(_input: Pick<WidgetRuntimePolicyInput, "drawingUiEnabled" | "drawingActiveTool" | "selectedDrawingType">): boolean {
	return false;
}

export function resolveRequestedRuntime(input: WidgetRuntimePolicyInput): ResolvedWidgetRuntime {
	return evaluateRuntimePolicy(input).resolvedRuntime;
}