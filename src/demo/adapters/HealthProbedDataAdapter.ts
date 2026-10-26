import { MultiSourceDataAdapter, type SourceRoute } from "../../widget/adapters/MultiSourceDataAdapter";
import type { StockDataAdapter, Timeframe } from "../../lib/types/adapter";

/**
 * Health-probed data adapter — the missing trigger for the data-unavailable banner.
 *
 * WHY IT EXISTS. `data_unavailable` resolves to `UnavailableState`
 * (`src/widget/components/CapabilityGate.tsx:133,168`) and its copy ships in both
 * locales, but nothing in the product ever rendered it: `CapabilityProvider` has
 * no non-test call site, and the widget that owns the data hook is a sibling of the
 * demo shell. The adapter is the only object that actually knows whether the data
 * path is alive, so the shell that composes it is where an outage becomes
 * observable. The banner it drives is the REAL `UnavailableState` component, not a
 * look-alike, so the DOM contract (`data-reason="data_unavailable"`) and the
 * shipped `capability.unavailable.*` copy are the ones the gate layer defines.
 *
 * WHAT COUNTS AS AN OUTAGE. Only a real bar fetch REJECTING (network error,
 * timeout, an unhandled 451). An EMPTY array is NOT an outage: "no bars in this
 * window" is a legitimate answer, and calling it unavailable would be announcing a
 * failure the source never reported. The first successful fetch clears the flag,
 * so the banner disappears the moment data comes back.
 *
 * Demo-shell glue (Rule 8): it changes no widget or engine behaviour, it only
 * observes what the adapter already did and re-throws untouched.
 */
export class HealthProbedDataAdapter extends MultiSourceDataAdapter {
	private healthy = true;

	constructor(
		config: { routes: SourceRoute[]; defaultAdapter: StockDataAdapter },
		private readonly onChange: (unavailable: boolean) => void,
	) {
		super(config);
	}

	/** Emit only on a transition, so a storm of fetches cannot loop the parent. */
	private report(ok: boolean): void {
		if (this.healthy === ok) return;
		this.healthy = ok;
		this.onChange(!ok);
	}

	/** Record the outcome, then hand the caller the untouched original result. */
	private async probe<T>(run: () => Promise<T>): Promise<T> {
		try {
			const out = await run();
			this.report(true);
			return out;
		} catch (err) {
			this.report(false);
			throw err;
		}
	}

	override fetchBarsInRange(symbol: string, timeframe: Timeframe, from: Date, to: Date, chartId?: string) {
		return this.probe(() => super.fetchBarsInRange(symbol, timeframe, from, to, chartId));
	}

	override fetchBarsBefore(symbol: string, timeframe: Timeframe, before: Date, limit?: number, chartId?: string) {
		return this.probe(() => super.fetchBarsBefore(symbol, timeframe, before, limit, chartId));
	}
}
