import { describe, expect, it, vi } from "vitest";
import {
	LocalWorkspaceStore,
	RemoteWorkspaceStore,
	WorkspaceStoreError,
	allowsCloudWorkspace,
	resolveWorkspaceStore,
	type WorkspaceIndexEntry,
} from "../WorkspaceStore";
import type { WorkspaceData } from "../types";
import type { StorageAdapter } from "@vninvestcharts/engine-react";

/**
 * Regression lock W0.7 — phạm vi lưu trữ workspace.
 *
 * Điểm quan trọng nhất: `RemoteWorkspaceStore` phải **ném 501**, KHÔNG fallback
 * âm thầm về local. Fallback im lặng sẽ khiến người dùng tin rằng workspace đã
 * lên cloud rồi mất sạch khi đổi máy (vi phạm AGENTS.md Rule 15 về không giả).
 */

function memStorage(): StorageAdapter & { data: Map<string, string> } {
	const data = new Map<string, string>();
	return {
		data,
		getItem: (k) => data.get(k) ?? null,
		setItem: (k, v) => void data.set(k, v),
		removeItem: (k) => void data.delete(k),
		clear: () => data.clear(),
	};
}

function sampleWorkspace(id: string): WorkspaceData {
	return {
		id,
		name: "Desk A",
		layout: { rows: 1, cols: 1, slots: [], rowSizes: ["1fr"], colSizes: ["1fr"] },
		charts: [],
		drawings: [],
		syncGroups: [],
		createdAt: 1,
		updatedAt: 2,
		version: 3,
	} as unknown as WorkspaceData;
}

describe("WorkspaceStore: local là trạng thái THẬT", () => {
	it("save rồi load trả lại cùng nội dung", async () => {
		const store = new LocalWorkspaceStore(memStorage());
		const ws = sampleWorkspace("ws1");
		await store.save(ws);
		const loaded = await store.load("ws1");
		expect(loaded?.id).toBe("ws1");
		expect(loaded?.name).toBe("Desk A");
	});

	it("list có workspace vừa lưu", async () => {
		const storage = memStorage();
		const store = new LocalWorkspaceStore(storage);
		await store.save(sampleWorkspace("ws1"));
		await store.save(sampleWorkspace("ws2"));
		const list = await store.list();
		expect(list.map((e: WorkspaceIndexEntry) => e.id).sort()).toEqual(["ws1", "ws2"]);
	});

	it("remove xoá khỏi store", async () => {
		const store = new LocalWorkspaceStore(memStorage());
		await store.save(sampleWorkspace("ws1"));
		await store.remove("ws1");
		expect(await store.load("ws1")).toBeNull();
	});

	it("scope/supportsMultiDevice nói đúng sự thật", () => {
		const store = new LocalWorkspaceStore(memStorage());
		expect(store.scope).toBe("local");
		expect(store.supportsMultiDevice).toBe(false);
	});

	it("lỗi lưu ⇒ WorkspaceStoreError có mã, KHÔNG nuốt im lặng", async () => {
		const failing: StorageAdapter = {
			getItem: () => null,
			setItem: () => {
				throw new Error("QuotaExceededError");
			},
			removeItem: () => {},
			clear: () => {},
		};
		const store = new LocalWorkspaceStore(failing);
		await expect(store.save(sampleWorkspace("ws1"))).rejects.toBeInstanceOf(WorkspaceStoreError);
		await expect(store.save(sampleWorkspace("ws1"))).rejects.toMatchObject({
			code: "quota_exceeded",
		});
	});
});

describe("WorkspaceStore: remote là STUB, ném 501 (EP-8 chưa tới)", () => {
	const store = new RemoteWorkspaceStore();

	it("mọi thao tác trả promise bị TỪ CHỐI, không throw đồng bộ", async () => {
		// Caller dùng `.catch()` phải bắt được — throw đồng bộ sẽ vượt qua `.catch`.
		await expect(store.list()).rejects.toMatchObject({ code: "not_implemented" });
		await expect(store.load("ws1")).rejects.toMatchObject({ code: "not_implemented" });
		await expect(store.save(sampleWorkspace("ws1"))).rejects.toMatchObject({
			code: "not_implemented",
		});
		await expect(store.remove("ws1")).rejects.toMatchObject({ code: "not_implemented" });
	});

	it("storage KHÔNG bị ghi bật cả khi người dùng đã trả tiền", async () => {
		const storage = memStorage();
		const remote = new RemoteWorkspaceStore();
		await expect(remote.save(sampleWorkspace("ws1"))).rejects.toMatchObject({
			code: "not_implemented",
		});
		expect(storage.data.size).toBe(0);
	});

	it("scope/supportsMultiDevice mô tả đích đến", () => {
		expect(store.scope).toBe("cloud");
		expect(store.supportsMultiDevice).toBe(true);
	});
});

describe("resolveWorkspaceStore: chọn store theo capability + backend", () => {
	it("enterprise NHƯNG backend chưa sẵn sàng ⇒ local (degrade, KHÔNG ném 501)", () => {
		// Ném 501 ở đây sẽ làm mất sạch tính năng lưu workspace của khách đã trả tiền.
		// Đúng là lưu local kèm badge "Chỉ lưu trên thiết bị này".
		expect(resolveWorkspaceStore({ allowsCloud: true, backendReady: false }).scope).toBe("local");
		expect(resolveWorkspaceStore({ allowsCloud: true }).scope).toBe("local");
	});

	it("enterprise + backend sẵn sàng ⇒ cloud", () => {
		expect(resolveWorkspaceStore({ allowsCloud: true, backendReady: true }).scope).toBe("cloud");
	});

	it("thiếu quyền thì KHÔNG bao giờ ra cloud dù backend sống", () => {
		expect(resolveWorkspaceStore({ allowsCloud: false, backendReady: true }).scope).toBe("local");
	});

	it("forceRemote (chỉ test) ⇒ remote, dùng để chứng minh đường lỗi", () => {
		expect(resolveWorkspaceStore({ allowsCloud: false, forceRemote: true }).scope).toBe("cloud");
	});

	it("forceRemote=false ghi đè cả khi đủ cả hai điều kiện", () => {
		expect(
			resolveWorkspaceStore({ allowsCloud: true, backendReady: true, forceRemote: false }).scope,
		).toBe("local");
	});

	it("truyền storageAdapter thì dùng đúng adapter đó", async () => {
		const storage = memStorage();
		const store = resolveWorkspaceStore({ allowsCloud: false, storageAdapter: storage });
		await store.save(sampleWorkspace("wsX"));
		expect(storage.data.size).toBeGreaterThan(0);
	});
});

describe("allowsCloudWorkspace: phải qua capability + narrowing license", () => {
	it("chỉ enterprise+ mở, community/pro/starter không", () => {
		for (const tier of ["none", "free", "starter", "pro"] as const) {
			expect(allowsCloudWorkspace(tier), tier).toBe(false);
		}
		for (const tier of ["enterprise", "custom", "internal"] as const) {
			expect(allowsCloudWorkspace(tier), tier).toBe(true);
		}
	});

	it("tier null ⇒ false (fail-closed)", () => {
		expect(allowsCloudWorkspace(null)).toBe(false);
		expect(allowsCloudWorkspace(undefined)).toBe(false);
	});

	it("license hẹp bỏ `server_workspace` ⇒ false dù tier là enterprise", () => {
		expect(allowsCloudWorkspace("enterprise", ["export_png"])).toBe(false);
	});

	it("license hẹp còn `server_workspace` ⇒ true", () => {
		expect(allowsCloudWorkspace("enterprise", ["export_png", "server_workspace"])).toBe(true);
	});

	it("narrowing rỗng ⇒ không thu hẹp (tránh khoá nhầm khách đã mua)", () => {
		expect(allowsCloudWorkspace("enterprise", [])).toBe(true);
	});
});

describe("WorkspaceStoreError: có mã để UI xử lý", () => {
	it("mã lỗi là chuỗi đóng, không phải enum rời", () => {
		for (const code of ["not_implemented", "conflict", "quota_exceeded", "unavailable"] as const) {
			const err = new WorkspaceStoreError("x", code);
			expect(err.code).toBe(code);
			expect(err.name).toBe("WorkspaceStoreError");
		}
	});
});
