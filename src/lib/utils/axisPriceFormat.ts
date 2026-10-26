/**
 * Axis price labels: full grouped numbers ("84,000") instead of compact
 * ("84.00K"), matching the last-price tag format. Small values keep
 * precision; negatives and NaN are handled defensively.
 */
export function formatAxisPrice(value: number): string {
	if (!Number.isFinite(value)) return "—";
	// Up to 2 decimals, trailing zeros dropped: round gridlines render clean
	// ("84,000") while odd values keep tag-exact precision ("81,352.54").
	return new Intl.NumberFormat("en-US", {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2,
	}).format(value);
}
