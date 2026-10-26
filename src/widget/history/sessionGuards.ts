import type { SourceSemanticsDescriptor, Timeframe } from "../../lib/adapters";

function normalizeField(value: string | number | undefined | null): string {
	if (value === undefined || value === null) {
		return "-";
	}
	return String(value);
}

export function buildSourceRevisionKey(
	adapterLabel: string,
	sourceSemantics: SourceSemanticsDescriptor | null,
): string {
	if (!sourceSemantics) {
		return `${adapterLabel}|no-semantics`;
	}

	return [
		adapterLabel,
		normalizeField(sourceSemantics.sourceId),
		normalizeField(sourceSemantics.sourceContractVersion),
		normalizeField(sourceSemantics.coverageMode),
		normalizeField(sourceSemantics.sessionModel),
		normalizeField(sourceSemantics.sessionCalendarId),
		normalizeField(sourceSemantics.timezone),
		normalizeField(sourceSemantics.finalityMode),
		normalizeField(sourceSemantics.correctionLookbackMs),
	].join("|");
}

export function buildHistorySessionRequestKey(
	symbol: string,
	timeframe: Timeframe,
	sourceRevisionKey: string,
): string {
	return `${symbol}:${timeframe}:${sourceRevisionKey}`;
}
