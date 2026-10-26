/**
 * OB-M01 — HistoryFetchQueue
 * Priority queue for managing history backfill jobs.
 * Pure class — no React dependency.
 */

export type FetchSide = "left" | "right";

export type StopReason =
	| "TARGET_REACHED"
	| "EMPTY_PAGE"
	| "NO_PROGRESS"
	| "MAX_PAGES"
	| "ERROR";

export interface EnqueueFetchJob {
	/** Unique key for this job: `${adapterName}:${symbol}:${timeframe}` */
	key: string;
	side: FetchSide;
	/** Unix ms — target timestamp to fetch toward */
	targetTs: number;
	/** Higher number = higher priority */
	priority: number;
	/** Increases each time symbol/timeframe changes; allows invalidating stale jobs */
	generation: number;
}

export interface FetchJob extends EnqueueFetchJob {
	/** Unique job ID for use with complete() */
	id: string;
	createdAt: number;
}

function makeId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export class HistoryFetchQueue {
	private _pending: FetchJob[] = [];
	private _inflight: FetchJob | null = null;

	/**
	 * Enqueue a job. If a job with the same key+side+generation already exists,
	 * merges targetTs (min for left, max for right) and takes the higher priority.
	 */
	enqueue(input: EnqueueFetchJob): FetchJob {
		const existing = this._pending.find(
			(j) =>
				j.key === input.key &&
				j.side === input.side &&
				j.generation === input.generation,
		);

		if (existing) {
			existing.targetTs =
				input.side === "left"
					? Math.min(existing.targetTs, input.targetTs)
					: Math.max(existing.targetTs, input.targetTs);
			existing.priority = Math.max(existing.priority, input.priority);
			return existing;
		}

		const job: FetchJob = {
			...input,
			id: makeId(),
			createdAt: Date.now(),
		};
		this._pending.push(job);
		return job;
	}

	/**
	 * Dequeue the highest-priority job for the given generation.
	 * Returns null if there is already an inflight job.
	 */
	dequeue(generation: number): FetchJob | null {
		if (this._inflight !== null) {
			return null;
		}

		const candidates = this._pending.filter((j) => j.generation === generation);
		if (candidates.length === 0) {
			return null;
		}

		// Sort: priority desc, createdAt asc
		candidates.sort((a, b) => {
			if (b.priority !== a.priority) return b.priority - a.priority;
			return a.createdAt - b.createdAt;
		});

		const job = candidates[0];
		this._pending = this._pending.filter((j) => j.id !== job.id);
		this._inflight = job;
		return job;
	}

	/** Mark a job as completed, clearing the inflight slot. */
	complete(id: string): void {
		if (this._inflight?.id === id) {
			this._inflight = null;
		}
	}

	/** Whether there are pending jobs (optionally filtered by generation). */
	hasPending(generation?: number): boolean {
		if (generation === undefined) {
			return this._pending.length > 0;
		}
		return this._pending.some((j) => j.generation === generation);
	}

	/** Remove all pending jobs for a specific generation. */
	clearGeneration(generation: number): void {
		this._pending = this._pending.filter((j) => j.generation !== generation);
		if (this._inflight?.generation === generation) {
			this._inflight = null;
		}
	}

	/** Remove all pending jobs and clear inflight. */
	clearAll(): void {
		this._pending = [];
		this._inflight = null;
	}

	/** Snapshot of current queue state for debugging. */
	snapshot(): { pending: number; inflight: FetchJob | null } {
		return {
			pending: this._pending.length,
			inflight: this._inflight,
		};
	}
}
