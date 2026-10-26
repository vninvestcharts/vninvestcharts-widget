/**
 * Calendar registry: maps sessionCalendarId strings to ExchangeCalendar instances.
 * Adapters declare their calendar via SourceSemanticsDescriptor.sessionCalendarId;
 * the widget uses this registry to look up the right calendar for gap classification.
 */
import type { ExchangeCalendar } from "./ExchangeCalendar";
import { vnExchangeCalendar } from "./ExchangeCalendar";

const REGISTRY = new Map<string, ExchangeCalendar>([
	["vn-exchange-calendar", vnExchangeCalendar],
]);

/**
 * Returns the ExchangeCalendar for the given calendarId, or null if unknown.
 */
export function getCalendar(calendarId: string | undefined): ExchangeCalendar | null {
	if (!calendarId) return null;
	return REGISTRY.get(calendarId) ?? null;
}
