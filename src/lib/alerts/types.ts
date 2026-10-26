export type AlertConditionType =
	| "crossing"
	| "crossing_up"
	| "crossing_down"
	| "greater_than"
	| "less_than";

export interface AlertSource {
	type: "price" | "indicator" | "value";
	indicatorId?: string; // id of the indicator series instance
	key?: string;          // sub-key e.g. "close", "macd", "rsi", or "top"
	value?: number;        // static numerical value if type is "value" (for sourceB)
}

export interface AlertCondition {
	id: string;
	symbol: string;
	timeframe: string;
	sourceA: AlertSource;
	condition: AlertConditionType;
	sourceB: AlertSource;
	frequency: "once" | "once_per_bar" | "once_per_bar_close" | "continuous";
	actions: {
		popup: boolean;
		sound: boolean;
		email: boolean;
		webhook?: string;
	};
	message: string;
	createdAt: number;
	isTriggered: boolean;
	lastTriggeredBarTime?: number;
	/**
	 * Whether the condition was satisfied at the previous evaluation. Only used by
	 * `frequency: "continuous"`, which fires on a false → true TRANSITION rather than on
	 * every evaluation.
	 *
	 * Persisted deliberately: without it, reloading a tab while the condition happens to be
	 * true would re-fire every continuous alert once on the first tick, which is the same
	 * storm in a smaller window. Only written when the value changes, so a live feed
	 * re-evaluating the same bar does not hammer localStorage.
	 */
	lastConditionMet?: boolean;
	/**
	 * Why the last webhook delivery failed, or `undefined` when the last attempt
	 * succeeded or there is no webhook configured.
	 *
	 * Persisted, and deliberately so. A delivery failure is not something the user can
	 * act on inside an eight-second toast — they need to open the alerts list later and
	 * still see that their endpoint is rejecting. Keeping it on the alert itself is what
	 * makes the failure discoverable at all: before this, a 500 from a user's webhook was
	 * indistinguishable from working, because `fetch` only rejects on a network error.
	 *
	 * Cleared on the next successful delivery, so a fixed endpoint does not leave a stale
	 * failure behind.
	 */
	lastDeliveryError?: {
		/** epoch ms */
		at: number;
		/** HTTP status when the endpoint answered; absent for network/invalid-URL failures. */
		status?: number;
		/** Short reason, already localised-agnostic — the UI formats it. */
		reason: string;
	};
}
