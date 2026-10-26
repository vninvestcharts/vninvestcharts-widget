import { AlertCondition } from "./types";
import { AlertEvaluator } from "./AlertEvaluator";
import { buildIndicatorSeriesKey } from "../core/seriesValueResolver";
import type { SeriesConfig, PaneDescriptor } from "../core/types/pane-descriptor";
import { readJson, writeJson } from "../utils/storage";

/**
 * Every series an alert is allowed to reference: those that HAVE a canonical indicator
 * key, i.e. those the evaluator can actually read out of `indicatorValues`.
 *
 * This predicate replaces an eight-entry type blacklist that used to live in
 * `VNInvestCharts.tsx`. That list was a hand-maintained duplicate of what
 * `buildIndicatorSeriesKey` already answers, and it had drifted from the thing it was
 * mirroring: it was applied to `settings.visiblePanes` AND filtered by type, so the
 * demo's six indicators — which live in `momentum`, `orderflow` and `strength`, all
 * three `visible: false` — reduced to an EMPTY list. Every indicator-sourced alert then
 * persisted an instance id nothing could resolve, and no E2E had ever exercised that
 * branch. Measured, not inferred: the resolver logged `seriesCount: 0` on every tick.
 *
 * Spanning every pane is deliberate. A hidden pane is a display concern, not an
 * evaluation one — measured in the browser, `indicatorValues` still carries
 * `RSI:period=14`, `MACD:fast=12:slow=26:signal=9`, `Whale:threshold=50000`, `CVDApprox`
 * and `StrengthElder` while those panes are collapsed.
 *
 * "Has a canonical key" needs no maintenance, unlike the blacklist it replaces: a new
 * chart type or indicator is classified correctly by `buildIndicatorSeriesKey` alone.
 *
 * Module-level and exported so it can be tested directly. It is the whole fix, and a
 * predicate buried in a component's `useMemo` is untestable — which is how the empty
 * list survived three audit rounds.
 */
export function selectAlertableSeries(panes: readonly PaneDescriptor[]): SeriesConfig[] {
	const list: SeriesConfig[] = [];
	for (const pane of panes) {
		for (const series of pane.series || []) {
			if (series.id && buildIndicatorSeriesKey(series)) {
				list.push(series);
			}
		}
	}
	return list;
}

/**
 * How long a webhook delivery may stay in flight before it is abandoned.
 *
 * Without a bound, an endpoint that accepts the connection and never responds leaves the
 * promise pending forever, and one such alert per symbol accumulates them silently. 10s is
 * comfortably longer than a healthy webhook round trip and short enough that a dead endpoint
 * is reported within the same session.
 */
const WEBHOOK_TIMEOUT_MS = 10_000;

export class AlertManager {
	private alerts: AlertCondition[] = [];
	private onAlertTriggeredCallbacks: ((alert: AlertCondition) => void)[] = [];
	/** (alert, side, key) triples already reported by `reportUnreadableSubKey`, so a
	 *  permanently dead alert reports once instead of once per bar for the life of the
	 *  chart. In memory only: a reload re-reports, which is the right behaviour for a
	 *  diagnostic rather than a stored flag the user cannot see. */
	private reportedUnreadable = new Set<string>();

	/**
	 * Whether the current licence is entitled to `webhook`. See `webhookAllowed` on the constructor.
	 * Held as a field rather than a constructor argument copied into a value, because the tier is
	 * resolved ASYNCHRONOUSLY (the licence is verified after mount): the caller hands over a
	 * predicate and keeps updating it, so a customer who validates late is not locked out forever.
	 */
	private webhookAllowedFn: () => boolean = () => false;

	/**
	 * @param webhookAllowed Entitlement predicate for the `webhook` alert action, which the
	 * capability matrix declares at Enterprise tier.
	 *
	 * FAIL-CLOSED BY DEFAULT (Rule 15). Omitting this argument locks webhook delivery off; the only
	 * way to turn it on is to pass a predicate explicitly. That matters because this class previously
	 * had no entitlement check at all, and `webhook` was simultaneously (a) shipped client-side and
	 * (b) listed in the enforcement gate's DECLARED_NOT_SHIPPED, which meant Pro-tier users got an
	 * Enterprise feature for free.
	 *
	 * Deliberately a predicate and not a boolean: the tier is not known when the manager is built.
	 */
	constructor(webhookAllowed?: () => boolean) {
		if (webhookAllowed) this.webhookAllowedFn = webhookAllowed;
		this.loadAlerts();
	}

	getAlerts(): AlertCondition[] {
		return this.alerts;
	}

	addAlert(alert: AlertCondition) {
		this.alerts.push(alert);
		this.saveAlerts();
	}

	removeAlert(id: string) {
		this.alerts = this.alerts.filter((a) => a.id !== id);
		this.saveAlerts();
	}

	toggleAlert(id: string) {
		const alert = this.alerts.find((a) => a.id === id);
		if (alert) {
			alert.isTriggered = false;
			alert.lastTriggeredBarTime = undefined;
			this.saveAlerts();
		}
	}

	/**
	 * Register a listener. Returns a DISPOSER, and callers are expected to call it.
	 *
	 * This used to be push-only, so a React effect that subscribed without
	 * unsubscribing accumulated one listener per mount. The demo wraps the widget in
	 * `StrictMode` (`src/demo/index.tsx:37`), which mounts effects twice on the same
	 * instance, so ONE alert firing invoked every listener twice — measured in the
	 * browser as `DIALOG COUNT: 2` with two sounds. `indexOf` + `splice` (not
	 * `filter`) keeps repeated subscribe/unsubscribe cycles stable, and `indexOf`
	 * returning -1 makes a double-dispose a no-op rather than a removal of a
	 * different listener.
	 */
	onAlertTriggered(cb: (alert: AlertCondition) => void): () => void {
		this.onAlertTriggeredCallbacks.push(cb);
		return () => {
			const i = this.onAlertTriggeredCallbacks.indexOf(cb);
			if (i >= 0) this.onAlertTriggeredCallbacks.splice(i, 1);
		};
	}

	checkAlerts(
		symbol: string,
		timeframe: string,
		current: any,
		previous: any,
		activeSeries: SeriesConfig[]
	) {
		if (!current || !previous) return;

		const currentBarTime = current.date ? new Date(current.date).getTime() : 0;

		// Scope is SYMBOL ONLY.
		//
		// `timeframe` used to gate evaluation, which made the feature inert: the create
		// form has no timeframe control — `AlertsModal.tsx:15` takes it as a prop and
		// `VNInvestCharts.tsx:2822` fills it from whatever chart the user happened to be
		// on — and the list at `AlertsModal.tsx:505-546` renders every alert labelled
		// "Active". So the UI asserted armed while the code guaranteed it could never be
		// evaluated. Switching the chart's timeframe silently killed the alert, and a
		// user watching `close > 0` would never hear from it.
		//
		// `alert.timeframe` is provenance — "which chart was I on when I set this" — and
		// still ships as webhook metadata beside symbol/message/timestamp
		// (`AlertManager.ts:116`). Symbol is different in kind and stays gated: a BTC
		// alert must not fire on VN30.
		const activeAlerts = this.alerts.filter((a) => a.symbol === symbol && !a.isTriggered);

		for (const alert of activeAlerts) {
			// Skip if already triggered on this bar for "once_per_bar_close" or "once_per_bar"
			if (
				(alert.frequency === "once_per_bar" || alert.frequency === "once_per_bar_close") &&
				alert.lastTriggeredBarTime === currentBarTime
			) {
				continue;
			}

			// Map instance ID of indicator to its canonical key in indicatorValues
			const mappedAlert = this.resolveCanonicalKeys(alert, activeSeries);

			this.reportUnreadableSubKey(alert, mappedAlert, current);

			const conditionMet = AlertEvaluator.evaluate(current, previous, mappedAlert);

			// `continuous` fires on a TRANSITION, not on every evaluation.
			//
			// `checkAlerts` runs on every `enrichedData` change, which with a live feed is
			// every few seconds. Firing on each evaluation turned a price alert into a native
			// dialog plus a sound every tick — measured at 10 fires over 10 same-bar ticks.
			// No reading of "continuous" means "tell me again whenever the page re-renders", and
			// the useful meaning is "tell me each time it crosses", which is false → true.
			if (alert.frequency === "continuous") {
				const wasMet = alert.lastConditionMet === true;
				// Persist the new state only when it CHANGES, so a live feed re-evaluating an
				// unchanged condition does not write localStorage on every tick.
				if (alert.lastConditionMet !== conditionMet) {
					alert.lastConditionMet = conditionMet;
					this.saveAlerts();
				}
				if (conditionMet && !wasMet) {
					this.triggerAlert(alert, currentBarTime);
				}
				continue;
			}

			if (conditionMet) {
				this.triggerAlert(alert, currentBarTime);
			}
		}
	}

	/**
	 * Rewrite an alert's indicator instance ids into the canonical keys that
	 * `indicatorValues` is keyed by.
	 *
	 * Both failure branches below used to be silent, which is why this class of bug
	 * survived: an alert whose id could not be resolved kept the raw uuid, evaluated to
	 * `null`, never fired, and stayed in the list labelled "Active" with no trace of
	 * why. The two ids that reached here — a uuid belonging to a series the caller did
	 * not pass, and a uuid whose series has no canonical key at all — are both real
	 * states, so they are reported rather than swallowed.
	 *
	 * Measured on the demo layout, `strength/StrengthRelative` resolves to
	 * `StrengthRelative:compareSymbol=VNINDEX:period=14`, which no bar ever carries, so
	 * it hits the second branch. That is correct reporting of a genuine defect, not a
	 * new failure introduced here.
	 */
	/**
	 * Report an indicator alert whose SUB-KEY cannot be read, which `resolveCanonicalKeys`
	 * cannot see and `AlertEvaluator` cannot express.
	 *
	 * An indicator alert has three distinct failure modes and only two were reported. The
	 * instance id may be unresolvable (C2), or its series may have no canonical key (C3) —
	 * both visible in `resolveCanonicalKeys`. But an alert can resolve perfectly and still
	 * be dead: the canonical key IS present in `indicatorValues`, its value IS an object,
	 * and the requested member is not on it — or the member is an array or boolean, or the
	 * key is blank. `getValue` then reads `val[key]` (or `val[""]`), gets undefined, and
	 * `evaluate` returns false on every bar forever with nothing logged anywhere. That is
	 * exactly how the old map's `StrengthElder: ["bull"]` stayed invisible: it offered a
	 * confident choice against a `{bullPower, bearPower}` value.
	 *
	 * Fires only when the value is present AND is an object, so it never duplicates the
	 * id-resolution reports and never fires for a SCALAR — there `getValue` ignores the
	 * sub-key entirely, which is why a blank key is correct rather than broken for RSI.
	 *
	 * Reported once per (alert, side, key). The condition is re-checked on every bar for
	 * the life of the alert, so reporting per evaluation would be a console flood rather
	 * than a diagnostic.
	 */
	private reportUnreadableSubKey(alert: AlertCondition, mapped: AlertCondition, current: any) {
		const dict = current?.indicatorValues;
		if (!dict || typeof dict !== "object") return;

		for (const [side, src] of [["sourceA", mapped.sourceA], ["sourceB", mapped.sourceB]] as const) {
			const s = src as any;
			if (s?.type !== "indicator" || !s.indicatorId) continue;

			const val = dict[s.indicatorId];
			// Absent key is not this function's business: that is the id-resolution path, or
			// an indicator the current computation plan does not produce.
			if (val === undefined || val === null) continue;
			// A scalar ignores its sub-key entirely, so nothing is broken here.
			if (typeof val !== "object") continue;

			const key = typeof s.key === "string" ? s.key : "";
			const sub = (val as Record<string, unknown>)[key];
			if (typeof sub === "number" && Number.isFinite(sub)) continue;

			const fingerprint = `${alert.id}:${side}:${s.indicatorId}:${key}`;
			if (this.reportedUnreadable.has(fingerprint)) continue;
			this.reportedUnreadable.add(fingerprint);

			const available = Object.keys(val as Record<string, unknown>).join(", ") || "(none)";
			console.error(
				`Alert "${alert.message}" (${side}): ${s.indicatorId} stores an object but ` +
					`${key === "" ? "no sub-key" : `sub-key "${key}"`} is not a number on it, so the ` +
					`condition can never be met and the alert will never fire. Readable members: ` +
					`${available}.`,
			);
		}
	}

	private resolveCanonicalKeys(alert: AlertCondition, activeSeries: SeriesConfig[]): AlertCondition {
		const clone = JSON.parse(JSON.stringify(alert)) as AlertCondition;

		const resolveSource = (src: any) => {
			if (src.type === "indicator" && src.indicatorId) {
				const series = activeSeries.find((s) => s.id === src.indicatorId);
				if (!series) {
					console.error(
						`Alert "${alert.message}": indicator id ${src.indicatorId} is not among the ` +
							`${activeSeries.length} series the evaluator was given. The alert cannot be ` +
							`evaluated and will never fire. The pane layout most likely changed since the ` +
							`alert was created, or the source was written by a build with a different ` +
							`series predicate.`,
					);
					return;
				}
				const canonical = buildIndicatorSeriesKey(series);
				if (!canonical) {
					console.error(
						`Alert "${alert.message}": series ${series.type} (${series.id}) has no canonical ` +
							`indicator key, so it cannot be read from indicatorValues. The alert cannot ` +
							`be evaluated and will never fire.`,
					);
					return;
				}
				src.indicatorId = canonical;
			}
		};

		resolveSource(clone.sourceA);
		resolveSource(clone.sourceB);

		return clone;
	}

	private triggerAlert(alert: AlertCondition, barTime: number) {
		if (alert.frequency === "once") {
			alert.isTriggered = true;
		}
		alert.lastTriggeredBarTime = barTime;
		this.saveAlerts();

		// Dispatch callbacks
		this.onAlertTriggeredCallbacks.forEach((cb) => cb(alert));

		// Webhook delivery. Deliberately not awaited: this runs inside the tick loop, and a
		// slow endpoint must never stall chart evaluation. Failures are reported, not thrown.
		//
		// Entitled check (P0-a): `webhook` is Enterprise in the capability matrix but shipped
		// client-side with no gate at all, so every paid tier could fire one. Fail-closed default
		// means an unentitled chart simply does not deliver. It does NOT throw and does NOT report
		// through `reportUnreadableSubKey` — a missing entitlement is not a dead series, and
		// silently withholding is the intended behaviour (the UI already shows the locked state,
		// so there is nothing for the user to act on here).
		if (alert.actions.webhook && this.webhookAllowedFn()) {
			void this.postWebhook(alert).catch((err) => console.error("Alert Webhook failed:", err));
		}
	}

	/**
	 * POST one webhook delivery, reporting the three ways it can silently fail today.
	 *
	 * The old call was `fetch(url, {...}).catch(console.error)`, which has three holes that
	 * all look like success to the user, whose alert list still reads "Active":
	 *
	 *   - `fetch` only REJECTS on a network error. A webhook answering 404 or 500 resolves
	 *     normally, so the request was treated as delivered and nothing was logged. This is
	 *     the worst one: a mistyped or dead endpoint fails silently for the life of the alert.
	 *   - No timeout. An endpoint that accepts the connection and never responds leaves the
	 *     promise pending forever, and one such alert per symbol accumulates them.
	 *   - No `keepalive`, so a page that unloads right after firing — exactly when the user
	 *     most expects delivery — cancels the request in flight.
	 *
	 * The URL is validated before anything is sent, so a malformed value fails immediately
	 * and legibly instead of becoming a network error nobody can attribute.
	 *
	 * Every failure path also RECORDS on the alert (`lastDeliveryError`) and persists it.
	 * The console line is for a developer; the recorded state is for the user, who otherwise
	 * has no way to learn that their endpoint is rejecting deliveries. Both are kept: the
	 * console keeps the stack, the record survives a reload so the alerts list can still
	 * show it later. A successful delivery clears it.
	 */
	private async postWebhook(alert: AlertCondition): Promise<void> {
		const url = alert.actions.webhook;
		if (!url) return;

		const fail = (reason: string, status?: number) => {
			console.error(`Alert "${alert.message}": ${reason}`);
			alert.lastDeliveryError = { at: Date.now(), reason, ...(status !== undefined ? { status } : {}) };
			this.saveAlerts();
		};

		let parsed: URL;
		try {
			parsed = new URL(url);
		} catch {
			fail(`webhook URL ${JSON.stringify(url)} is not a valid absolute URL — nothing was sent`);
			return;
		}
		if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
			fail(`webhook scheme ${parsed.protocol} is not http(s) — nothing was sent`);
			return;
		}

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
		try {
			const res = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					event: "ALERT_TRIGGERED",
					alertId: alert.id,
					symbol: alert.symbol,
					timeframe: alert.timeframe,
					message: alert.message,
					timestamp: Date.now(),
				}),
				keepalive: true,
				signal: controller.signal,
			});
			if (!res.ok) {
				fail(`webhook returned HTTP ${res.status} — the alert was NOT delivered`, res.status);
				return;
			}
			// Delivered: clear any previous failure so a repaired endpoint stops showing stale
			// red text. Only write when something was actually there — this path runs on every
			// firing and localStorage writes are not free.
			if (alert.lastDeliveryError) {
				delete alert.lastDeliveryError;
				this.saveAlerts();
			}
		} catch (err) {
			// Network error, abort (the 10s bound above), or anything else fetch throws.
			const reason = controller.signal.aborted
				? `webhook timed out after ${WEBHOOK_TIMEOUT_MS}ms — the alert was NOT delivered`
				: `webhook failed (${err instanceof Error ? err.message : String(err)})`;
			console.error(`Alert "${alert.message}": ${reason}`);
			alert.lastDeliveryError = { at: Date.now(), reason };
			this.saveAlerts();
			throw err;
		} finally {
			clearTimeout(timer);
		}
	}

	private loadAlerts() {
		// No storage on the server. `localStorage` is not merely empty there, the
		// identifier does not resolve at all, so this used to throw ReferenceError and
		// log "Failed to load alerts" on every renderToString - once per chart.
		//
		// Guarding the environment beats relying on the catch below: that catch exists
		// for corrupt JSON and a full quota, and folding "there is no storage here" into
		// it reports a real-looking storage failure for what is just the server.
		//
		// readJson already distinguishes the three cases: no storage, no key, bad JSON.
		this.alerts = readJson<AlertCondition[]>("vninvestcharts-widget_alerts", []);
	}

	private saveAlerts() {
		// Same reason as loadAlerts: nothing to persist server-side, and the ReferenceError
		// would land in the catch as a bogus failure.
		//
		// No log on purpose. Locked by AlertManager.noStorage.test.ts: on the server
		// every state change routed through here, so logging would print once per chart
		// per render. "No storage" is a normal environment, not a failure. A store that
		// exists but refuses to write is the real failure, and writeJson swallows that
		// too - accepted here because the next loadAlerts would surface a wrong count.
		writeJson("vninvestcharts-widget_alerts", this.alerts);
	}
}
