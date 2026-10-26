// Task 06: thin async wrapper quanh engine createMemoryStorage() cho Vitest/SSR.
// KHÔNG viết store mới — mọi logic lưu trữ nằm trong engine adapter.
import { createMemoryStorage } from "@vninvestcharts/engine-react";
import type { AsyncStorageAdapter } from "@vninvestcharts/engine-react";

export class InMemoryStorageAdapter implements AsyncStorageAdapter {
	private readonly store = createMemoryStorage();

	async getItem(key: string): Promise<string | null> {
		return this.store.getItem(key);
	}

	async setItem(key: string, value: string): Promise<void> {
		this.store.setItem(key, value);
	}

	async removeItem(key: string): Promise<void> {
		this.store.removeItem(key);
	}

	async clear(): Promise<void> {
		this.store.clear();
	}

	async getAllKeys(): Promise<string[]> {
		const keys: string[] = [];
		for (let i = 0; i < this.store.length; i += 1) {
			const key = this.store.key(i);
			if (key != null) keys.push(key);
		}
		return keys;
	}

	async getSize(): Promise<number> {
		let size = 0;
		for (const key of await this.getAllKeys()) {
			size += (this.store.getItem(key) ?? "").length;
		}
		return size;
	}
}
