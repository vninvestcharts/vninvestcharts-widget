import { normalizeExternalBars } from "./externalBarsNormalization";
import type {
	ExternalBarsNormalizationWorkerRequest,
	ExternalBarsNormalizationWorkerResponse,
} from "./externalBarsNormalizationAsync";

declare const self: Worker;

self.onmessage = (event: MessageEvent<ExternalBarsNormalizationWorkerRequest>) => {
	const { requestId, data } = event.data;

	try {
		const response: ExternalBarsNormalizationWorkerResponse = {
			requestId,
			result: normalizeExternalBars(data),
		};
		self.postMessage(response);
	} catch (error) {
		const response: ExternalBarsNormalizationWorkerResponse = {
			requestId,
			error: error instanceof Error ? error.message : String(error),
		};
		self.postMessage(response);
	}
};

export {};