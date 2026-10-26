import { WorkspaceData } from './types';
import type { StorageAdapter } from '@vninvestcharts/engine-react';

export class WorkspaceManager {
	private static VERSION = 2; // Target version
	private static autoSaveTimers = new Map<string, NodeJS.Timeout>();

	// Save workspace using StorageAdapter
	static async save(workspace: WorkspaceData, storageAdapter: StorageAdapter): Promise<void> {
		const workspaceToSave = {
			...workspace,
			updatedAt: Date.now(),
			version: this.VERSION,
		};
		const serialized = JSON.stringify(workspaceToSave);
		storageAdapter.setItem(`workspace:${workspaceToSave.id}`, serialized);
	}

	// Auto-save with debouncing
	static scheduleAutoSave(
		workspaceId: string,
		getWorkspaceData: () => WorkspaceData,
		storageAdapter: StorageAdapter,
		delayMs: number = 30000
	): void {
		// Clear existing timer for this workspace
		const existingTimer = this.autoSaveTimers.get(workspaceId);
		if (existingTimer) {
			clearTimeout(existingTimer);
		}

		// Schedule new auto-save
		const timer = setTimeout(async () => {
			try {
				const workspaceData = getWorkspaceData();
				await this.save(workspaceData, storageAdapter);
				await this.addToIndex({ id: workspaceId, name: workspaceData.name, updatedAt: Date.now() }, storageAdapter);
			} catch (error) {
				console.warn('[WorkspaceManager] Auto-save failed:', error);
			}
			this.autoSaveTimers.delete(workspaceId);
		}, delayMs);

		this.autoSaveTimers.set(workspaceId, timer);
	}

	// Cancel auto-save for a workspace
	static cancelAutoSave(workspaceId: string): void {
		const timer = this.autoSaveTimers.get(workspaceId);
		if (timer) {
			clearTimeout(timer);
			this.autoSaveTimers.delete(workspaceId);
		}
	}

	// Cancel all auto-save timers
	static cancelAllAutoSaves(): void {
		this.autoSaveTimers.forEach(timer => clearTimeout(timer));
		this.autoSaveTimers.clear();
	}

	// Load workspace using StorageAdapter
	static async load(id: string, storageAdapter: StorageAdapter): Promise<WorkspaceData | null> {
		const raw = storageAdapter.getItem(`workspace:${id}`);
		if (!raw) return null;

		try {
			const parsed = JSON.parse(raw);
			return this.validateAndMigrate(parsed);
		} catch (e) {
			console.warn('Failed to parse workspace', e);
			return null;
		}
	}

	// List all workspaces (maintains a simple index in storage)
	static async list(storageAdapter: StorageAdapter): Promise<{ id: string; name: string; updatedAt: number }[]> {
		const indexKey = 'workspace:index';
		const raw = storageAdapter.getItem(indexKey);
		if (!raw) return [];

		try {
			const index = JSON.parse(raw);
			return Array.isArray(index) ? index : [];
		} catch (e) {
			console.error('Failed to parse workspace index', e);
			return [];
		}
	}

	// Add workspace to index
	static async addToIndex(workspace: { id: string; name: string; updatedAt: number }, storageAdapter: StorageAdapter): Promise<void> {
		const indexKey = 'workspace:index';
		const raw = storageAdapter.getItem(indexKey);
		let index: { id: string; name: string; updatedAt: number }[] = [];

		if (raw) {
			try {
				index = JSON.parse(raw);
			} catch (e) {
				console.warn('Failed to parse workspace index', e);
			}
		}

		// Remove existing entry with same id
		index = index.filter(w => w.id !== workspace.id);
		// Add new entry at the beginning
		index.unshift(workspace);
		// Keep only last 50 workspaces
		index = index.slice(0, 50);

		storageAdapter.setItem(indexKey, JSON.stringify(index));
	}

	// Delete workspace
	static async delete(id: string, storageAdapter: StorageAdapter): Promise<void> {
		storageAdapter.removeItem(`workspace:${id}`);

		// Remove from index
		const indexKey = 'workspace:index';
		const raw = storageAdapter.getItem(indexKey);
		if (raw) {
			try {
				const index = JSON.parse(raw);
				const filtered = index.filter((w: any) => w.id !== id);
				storageAdapter.setItem(indexKey, JSON.stringify(filtered));
			} catch (e) {
				console.warn('Failed to update workspace index', e);
			}
		}
	}

	private static validateAndMigrate(data: any): WorkspaceData | null {
		if (!data || typeof data.id !== 'string' || typeof data.name !== 'string') {
			return null;
		}

		// Migration: v1 -> v2
		if (!data.version || data.version < this.VERSION) {
			data.version = this.VERSION;
			if (!data.layout) {
				data.layout = {
					rows: 1,
					cols: 1,
					slots: [{ id: 'chart-1', rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 1 }],
					colSizes: ['1fr'],
					rowSizes: ['1fr']
				};
			}
			if (!data.charts) {
				data.charts = [];
			}
			if (!data.drawings) {
				data.drawings = [];
			}
			if (!data.syncGroups) {
				data.syncGroups = [];
			}
		}

		return data as WorkspaceData;
	}
}
