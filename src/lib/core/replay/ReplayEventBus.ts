/**
 * ReplayEventBus — cross-instance replay synchronization via CustomEvent.
 *
 * Protocol (active types only):
 * - MASTER_ANNOUNCE: chart announces itself as master
 * - REPLAY_SEEK: master seeked to a specific barIndex+timestamp
 * - REPLAY_START: master started playing from a bar (slaves catch up at once)
 * - REPLAY_TOGGLE: replay was toggled on/off
 * - REPLAY_END: replay session ended or sync toggled off
 *
 * Channel namespace: "vninvestcharts-widget-replay-"
 * Transport: window CustomEvent
 */

export const REPLAY_EVENT_NS = "vninvestcharts-widget-replay" as const;

export type ReplayEventType =
  | "MASTER_ANNOUNCE"
  | "REPLAY_SEEK"
  | "REPLAY_START"
  | "REPLAY_TOGGLE"
  | "REPLAY_END";

export interface ReplayEventBase {
  type: ReplayEventType;
  chartId: string;
  timestamp: number;
  /** F-S2: Alt+click forceBroadcast — slave handler treats this as authoritative master regardless of election. */
  forceBroadcast?: boolean;
}

export interface MasterAnnounceEvent extends ReplayEventBase {
  type: "MASTER_ANNOUNCE";
  tf: string;
  barIndex: number;
}

export interface ReplaySeekEvent extends ReplayEventBase {
  type: "REPLAY_SEEK";
  barIndex: number;
  currentBarDate: number;
}

/**
 * R1-c: master started playing — slaves catch up immediately (cursor +
 * camera) instead of waiting for the first tick. Fire-and-forget.
 */
export interface ReplayStartEvent extends ReplayEventBase {
  type: "REPLAY_START";
  startTimestamp: number;
}

export interface ReplayToggleEvent extends ReplayEventBase {
  type: "REPLAY_TOGGLE";
  playing: boolean;
}

export interface ReplayEndEvent extends ReplayEventBase {
  type: "REPLAY_END";
}

export type ReplayBusEvent =
  | MasterAnnounceEvent
  | ReplaySeekEvent
  | ReplayStartEvent
  | ReplayToggleEvent
  | ReplayEndEvent;

export type ReplayEventHandler = (event: ReplayBusEvent) => void;

// F-12: namespace events by instanceId so multiple widgets on one page do not collide.
// Backward-compat: instanceId omitted → falls back to the shared NS (single-instance behaviour).
function eventTypeToName(type: ReplayEventType, instanceId?: string): string {
	return instanceId
		? `${REPLAY_EVENT_NS}:${instanceId}:${type}`
		: `${REPLAY_EVENT_NS}:${type}`;
}

/**
 * Parse timeframe string to minutes for master election (lower = more granular = master).
 */
export function parseReplayTimeframeToMinutes(tf: string): number {
	if (!tf) return Infinity;
	const match = tf.match(/^(\d+)?([a-zA-Z]+)$/);
	if (!match) return Infinity;
	const num = match[1] ? parseInt(match[1], 10) : 1;
	const rawUnit = match[2];
	const unitLower = rawUnit.toLowerCase();
	if (rawUnit === "M" || unitLower === "mo") return num * 43200;
	switch (unitLower) {
		case "s": return num / 60;
		case "m": return num;
		case "h": return num * 60;
		case "d": return num * 1440;
		case "w": return num * 10080;
		default: return Infinity;
	}
}

/**
 * Subscribe to a specific replay event type on the window.
 * Returns an unsubscribe function.
 */
export function onReplayEvent(
	type: ReplayEventType,
	handler: ReplayEventHandler,
	instanceId?: string,
): () => void {
	const eventName = eventTypeToName(type, instanceId);
	const listener = (e: Event) => {
		const custom = e as CustomEvent<ReplayBusEvent>;
		handler(custom.detail);
	};
	window.addEventListener(eventName, listener);
	return () => window.removeEventListener(eventName, listener);
}

/**
 * Emit a replay event on the window.
 * The event payload is serialized as CustomEvent.detail.
 */
export function emitReplayEvent(event: ReplayBusEvent, instanceId?: string): void {
	const eventName = eventTypeToName(event.type, instanceId);
	window.dispatchEvent(
		new CustomEvent(eventName, { detail: event }),
	);
}

/**
 * Subscribe to ALL replay event types on the window.
 * Returns an unsubscribe function.
 */
export function onAnyReplayEvent(handler: ReplayEventHandler, instanceId?: string): () => void {
	const types: ReplayEventType[] = [
		"MASTER_ANNOUNCE",
		"REPLAY_SEEK",
		"REPLAY_START",
		"REPLAY_TOGGLE",
		"REPLAY_END",
	];
	const unsubs = types.map((t) => onReplayEvent(t, handler, instanceId));
	return () => unsubs.forEach((u) => u());
}
