/**
 * BL-18: library-safe observability hook (opt-in, zero bundled SDK).
 * Hosts plug their own Sentry/Datadog/PostHog via the `onTelemetry` prop;
 * without a handler this module is a no-op and adds 0 bytes of vendor code.
 */
export type WidgetTelemetryKind = "data-error" | "render-error" | "action";

export interface WidgetTelemetryEvent {
	kind: WidgetTelemetryKind;
	/** Machine-readable code when available (see widgetErrors taxonomy). */
	code?: string;
	message: string;
	context?: Record<string, unknown>;
	timestamp: number;
}

export type WidgetTelemetryHandler = (event: WidgetTelemetryEvent) => void;

export function emitTelemetry(
	handler: WidgetTelemetryHandler | undefined | null,
	kind: WidgetTelemetryKind,
	message: string,
	extra?: { code?: string; context?: Record<string, unknown> },
): void {
	if (typeof handler !== "function") return;
	try {
		handler({
			kind,
			message,
			code: extra?.code,
			context: extra?.context,
			timestamp: Date.now(),
		});
	} catch {
		/* telemetry must never break the chart */
	}
}
