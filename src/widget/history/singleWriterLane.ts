export interface SingleWriterLane {
	run<T>(writer: () => T | Promise<T>): Promise<T>;
}

export function createSingleWriterLane(): SingleWriterLane {
	type QueueItem = {
		writer: () => unknown | Promise<unknown>;
		resolve: (value: unknown) => void;
		reject: (reason?: unknown) => void;
	};

	const queue: QueueItem[] = [];
	let running = false;

	const drainQueue = (): void => {
		if (running) {
			return;
		}

		const next = queue.shift();
		if (!next) {
			return;
		}

		running = true;

		let output: unknown;
		try {
			output = next.writer();
		} catch (error) {
			next.reject(error);
			running = false;
			drainQueue();
			return;
		}

		Promise.resolve(output)
			.then((value) => {
				next.resolve(value);
			})
			.catch((error) => {
				next.reject(error);
			})
			.finally(() => {
				running = false;
				drainQueue();
			});
	};

	return {
		run<T>(writer: () => T | Promise<T>): Promise<T> {
			return new Promise<T>((resolve, reject) => {
				queue.push({
					writer: writer as () => unknown | Promise<unknown>,
					resolve: resolve as (value: unknown) => void,
					reject,
				});
				drainQueue();
			});
		},
	};
}
