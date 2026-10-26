import { useEffect, useState } from "react";

import { normalizeExternalBars, type ExternalBarsNormalizationResult } from "./externalBarsNormalization";
import {
	EMPTY_EXTERNAL_BARS_NORMALIZATION_RESULT,
	normalizeExternalBarsAsync,
	shouldUseExternalBarsWorker,
} from "./externalBarsNormalizationAsync";

function isExternalBarsNormalizationTestEnv(): boolean {
	return typeof (globalThis as { vi?: unknown; describe?: unknown }).vi !== "undefined"
		|| typeof (globalThis as { vi?: unknown; describe?: unknown }).describe !== "undefined"
		|| (typeof process !== "undefined" && process.env.NODE_ENV === "test");
}

function resolveInitialExternalBarsNormalization(
	data: readonly unknown[] | undefined | null,
	enabled: boolean,
	useWorker: boolean = true,
): { result: ExternalBarsNormalizationResult; pending: boolean } {
	if (!enabled) {
		return {
			result: EMPTY_EXTERNAL_BARS_NORMALIZATION_RESULT,
			pending: false,
		};
	}

	if (isExternalBarsNormalizationTestEnv() || (!useWorker || !shouldUseExternalBarsWorker(data))) {
		return {
			result: normalizeExternalBars(data),
			pending: false,
		};
	}

	return {
		result: EMPTY_EXTERNAL_BARS_NORMALIZATION_RESULT,
		pending: true,
	};
}

export function useExternalBarsNormalization(
	data: readonly unknown[] | undefined | null,
	enabled: boolean,
	useWorker: boolean = true,
): { result: ExternalBarsNormalizationResult; pending: boolean } {
	const initialState = resolveInitialExternalBarsNormalization(data, enabled, useWorker);
	const [result, setResult] = useState<ExternalBarsNormalizationResult>(initialState.result);
	const [pending, setPending] = useState(initialState.pending);

	useEffect(() => {
		if (!enabled) {
			setResult(EMPTY_EXTERNAL_BARS_NORMALIZATION_RESULT);
			setPending(false);
			return undefined;
		}

		if (isExternalBarsNormalizationTestEnv() || (!useWorker || !shouldUseExternalBarsWorker(data))) {
			setResult(normalizeExternalBars(data));
			setPending(false);
			return undefined;
		}

		const controller = new AbortController();
		let disposed = false;
		setPending(true);

		void normalizeExternalBarsAsync(data, { signal: controller.signal, useWorker }).then((nextResult) => {
			if (disposed || controller.signal.aborted) {
				return;
			}

			setResult(nextResult);
			setPending(false);
		}).catch((error) => {
			if (disposed || controller.signal.aborted) {
				return;
			}

			setResult(normalizeExternalBars(data));
			setPending(false);
			console.warn("Falling back to main-thread external bars normalization", error);
		});

		return () => {
			disposed = true;
			controller.abort();
		};
	}, [data, enabled, useWorker]);

	return { result, pending };
}