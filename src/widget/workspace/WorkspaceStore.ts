import { hasCapability, type PatTier } from "@vninvestcharts/engine-core";
import type { StorageAdapter } from "@vninvestcharts/engine-react";
import { defaultAdapters } from "@vninvestcharts/engine-react";
import { WorkspaceManager } from "./WorkspaceManager";
import type { WorkspaceData } from "./types";

/**
 * WorkspaceStore — lớp trừu tượng duy nhất cho **phạm vi lưu trữ workspace**
 * (W0.7, PLAN_FRONTEND_PROPLUS_TRACKA §2.6).
 *
 * Vì sao cần: hiện `useMultiWorkspacePersistence.ts:109,116` gọi thẳng
 * `WorkspaceManager.save/load` với `storageAdapter` (localStorage). UI **không có
 * cách nào biết** dữ liệu đang nằm ở đâu ⇒ không thể trung thực với người dùng,
 * và khi backend có workspace API (EP-8) thì phải sửa lại mọi call site.
 *
 * Nguyên tắc (AGENTS.md Rule 15 — cấm fake):
 * - `scope: "local"` là **trạng thái thật**, không phải placeholder.
 * - `RemoteWorkspaceAdapter` **ném 501**, KHÔNG fallback âm thầm về local
 *   (fallback im lặng sẽ khiến người dùng tưởng đã sync lên cloud).
 * - Đổi từ local sang cloud khi EP-8 tới = sửa **một dòng** factory.
 */

export type WorkspaceScope = "local" | "cloud";

export interface WorkspaceIndexEntry {
	id: string;
	name: string;
	updatedAt: number;
}

export interface WorkspaceStore {
	readonly scope: WorkspaceScope;
	list(): Promise<WorkspaceIndexEntry[]>;
	load(id: string): Promise<WorkspaceData | null>;
	save(data: WorkspaceData): Promise<void>;
	remove(id: string): Promise<void>;
	/** Đồng bộ nhiều thiết bị chưa có backend (EP-8). */
	readonly supportsMultiDevice: boolean;
}

/** Lỗi có mã để UI hiển thị đúng thay vì nuốt im lặng. */
export class WorkspaceStoreError extends Error {
	constructor(
		message: string,
		readonly code: "not_implemented" | "conflict" | "quota_exceeded" | "unavailable",
	) {
		super(message);
		this.name = "WorkspaceStoreError";
	}
}

// ---------------------------------------------------------------------------
// Local — bọc WorkspaceManager + StorageAdapter (localStorage mặc định)
// ---------------------------------------------------------------------------

export class LocalWorkspaceStore implements WorkspaceStore {
	readonly scope = "local" as const;
	readonly supportsMultiDevice = false;

	constructor(private readonly storage: StorageAdapter = defaultAdapters.storageAdapter) {}

	list(): Promise<WorkspaceIndexEntry[]> {
		return WorkspaceManager.list(this.storage);
	}

	load(id: string): Promise<WorkspaceData | null> {
		return WorkspaceManager.load(id, this.storage);
	}

	async save(data: WorkspaceData): Promise<void> {
		try {
			await WorkspaceManager.save(data, this.storage);
			await WorkspaceManager.addToIndex(
				{ id: data.id, name: data.name, updatedAt: data.updatedAt },
				this.storage,
			);
		} catch (err) {
			// localStorage đầy (quota) là lỗi thật, không phải "không lưu được im lặng".
			throw new WorkspaceStoreError(
				err instanceof Error ? err.message : "local save failed",
				"quota_exceeded",
			);
		}
	}

	remove(id: string): Promise<void> {
		return WorkspaceManager.delete(id, this.storage);
	}
}

// ---------------------------------------------------------------------------
// Remote — STUB. Chỉ dùng được sau EP-8 (`/core/v1/workspace/v1/*`).
// ---------------------------------------------------------------------------

export class RemoteWorkspaceStore implements WorkspaceStore {
	readonly scope = "cloud" as const;
	readonly supportsMultiDevice = true;

	/**
	 * Ném **promise bị từ chối**, không throw đồng bộ.
	 *
	 * Lý do: interface khai `Promise<T>`, nên caller viết `store.list().catch(...)`
	 * phải bắt được. `throw` đồng bộ sẽ vượt qua `.catch` và làm hỏng luồng
	 * async của người gọi.
	 */
	private unavailable(): Promise<never> {
		return Promise.reject(
			new WorkspaceStoreError(
				"Cloud workspace needs the backend workspace API (EP-8), which is not deployed yet.",
				"not_implemented",
			),
		);
	}

	list(): Promise<WorkspaceIndexEntry[]> {
		return this.unavailable();
	}
	load(_id: string): Promise<WorkspaceData | null> {
		return this.unavailable();
	}
	save(_data: WorkspaceData): Promise<void> {
		return this.unavailable();
	}
	remove(_id: string): Promise<void> {
		return this.unavailable();
	}
}

// ---------------------------------------------------------------------------
// Factory — sửa đúng chỗ này khi EP-8 tới
// ---------------------------------------------------------------------------

export interface ResolveStoreInput {
	/** Có capability `server_workspace` không (đã bao gồm narrowing của license). */
	allowsCloud: boolean;
	storageAdapter?: StorageAdapter | null;
	/**
	 * Backend đã sẵn sàng chưa (probe `/core/v1/health`).
	 *
	 * Đây là điều kiện **thứ hai** bên cạnh `allowsCloud`. Cần cả hai vì:
	 * khách enterprise mà backend workspace (EP-8) chưa triển khai sẽ nhận
	 * `501` và **mất hoàn toàn tính năng lưu workspace**. Tệ hơn nhiều so với
	 * lưu local kèm badge trung thực "Chỉ lưu trên thiết bị này — dịch vụ
	 * cloud chưa sẵn sàng". Vì vậy thiếu backend ⇒ **local + badge**, không phải
	 * lỗi. Đây là degrade có kiểm soát (không phải giả lập cloud).
	 */
	backendReady?: boolean;
	/** Chỉ dùng cho test. */
	forceRemote?: boolean;
}

export function resolveWorkspaceStore(input: ResolveStoreInput): WorkspaceStore {
	const local = () => new LocalWorkspaceStore(input.storageAdapter ?? defaultAdapters.storageAdapter);
	if (input.forceRemote === true) return new RemoteWorkspaceStore();
	if (input.forceRemote === false) return local();
	// Cần CẢ HAI: đủ quyền (enterprise) + backend thật (EP-8 đã deploy).
	if (input.allowsCloud && input.backendReady === true) return new RemoteWorkspaceStore();
	return local();
}

/** Rút gọn: suy ra `allowsCloud` từ tier + narrowing license. */
export function allowsCloudWorkspace(
	tier: PatTier | null | undefined,
	narrowing?: readonly string[],
): boolean {
	if (!hasCapability(tier, "server_workspace")) return false;
	return !narrowing || narrowing.length === 0 || narrowing.includes("server_workspace");
}
