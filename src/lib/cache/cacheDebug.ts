/* eslint-disable @typescript-eslint/no-unnecessary-condition */

const IS_DEV =
	typeof process !== "undefined" && process.env?.NODE_ENV !== "production";

const cacheDebugOn = (): boolean => {
	try {
		return (
			typeof window !== "undefined" &&
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- intentional runtime check
			((window as unknown as Record<string, unknown>).__VNI_CACHE_DEBUG__ as boolean | undefined) === true
		);
	} catch {
		return false;
	}
};

const qs = (): URLSearchParams =>
	typeof window !== "undefined"
		? new URLSearchParams(window.location.search)
		: new URLSearchParams();

export function isCacheDisabled(): boolean {
	if (qs().get("cache") === "off") return true;
	return IS_DEV && cacheDebugOn();
}

export function getCacheTTL(defaultMs: number): number {
	const override = Number(qs().get("bars-ttl"));
	return Number.isFinite(override) && override > 0 ? override : defaultMs;
}

export function enforceMaxSize<K, V>(map: Map<K, V>, maxEntries: number): void {
	while (map.size > maxEntries) {
		const oldest = map.keys().next().value;
		if (oldest !== undefined) map.delete(oldest);
	}
}
