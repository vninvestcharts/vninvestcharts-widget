import type { LayoutPreset } from "./types";

/**
 * P0 — lưu layout preset do người dùng định nghĩa.
 *
 * Trước P0: `LayoutDesigner.handleSavePreset` build preset rồi gọi
 * `onSaveAsPreset?.(preset)`, mà call site duy nhất là `onSaveAsPreset={() => {}}` +
 * `availablePresets={[]}` (`VNInvestMultiCharts.tsx:1455-1456`). Người dùng đặt tên, bấm
 * Save, modal đóng, **không có gì được lưu và không có báo lỗi** ⇒ vi phạm Rule 15
 * (cấm nuốt im lặng).
 *
 * Hàm thuần, không React, nhận `StorageLike` ⇒ test được trong node. Dùng storage **tiêm
 * vào** (`storageAdapter`) chứ không `localStorage` trực tiếp, khác với
 * `ChartSerializer` — vì raw `localStorage` làm hỏng SSR/iframe/host-injected storage.
 *
 * Capability: `layout_user` là **pro** (`engine capabilities.ts:140`). Vì vậy gate thuộc
 * về call site (`VNInvestMultiCharts`), không gate ở đây — store chỉ lo "lưu/đọc đúng".
 */

export const CUSTOM_PRESETS_KEY = "vnsc.layout.customPresets";

/** Chỉ cần đúng hai phép; `StorageAdapter` của widget thỏa cả hai. */
export interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

/** Chặn preset hỏng làm sập cả danh sách; đồng thời chặn payload bị bày mở rộng vô hạn. */
const MAX_PRESETS = 50;
const MAX_NAME_LENGTH = 80;

export interface StoredPresetShape {
	id: string;
	name: string;
	layout: unknown;
	category?: string;
}

/** Bỏ field lạ (thumbnail/nameKey…) và ép shape; trả null nếu không dùng được. */
function sanitize(raw: unknown): LayoutPreset | null {
	if (typeof raw !== "object" || raw === null) return null;
	const candidate = raw as Partial<StoredPresetShape>;
	if (typeof candidate.id !== "string" || candidate.id.length === 0) return null;
	if (typeof candidate.name !== "string" || candidate.name.trim().length === 0) return null;
	if (typeof candidate.layout !== "object" || candidate.layout === null) return null;
	return {
		id: candidate.id,
		name: candidate.name.slice(0, MAX_NAME_LENGTH),
		layout: candidate.layout as LayoutPreset["layout"],
		// `custom` là preset người dùng tự tạo; ép lại để lọc theo category hoạt động đúng.
		category: "custom",
	};
}

/**
 * Đọc danh sách preset đã lưu. **Luôn trả mảng** — JSON hỏng hoặc storage lỗi thì trả
 * `[]`, không ném. Người dùng phải còn dùng được chart khi storage hỏng.
 */
export function readCustomPresets(storage: StorageLike | null | undefined): LayoutPreset[] {
	if (!storage) return [];
	let parsed: unknown;
	try {
		const raw = storage.getItem(CUSTOM_PRESETS_KEY);
		if (!raw) return [];
		parsed = JSON.parse(raw);
	} catch {
		// Storage hỏng / JSON hỏng ⇒ coi như chưa có preset. Không nuốt lỗi âm thầm trong
		// UI, nhưng cũng không được chặn render chart vì dữ liệu preset hỏng.
		return [];
	}
	if (!Array.isArray(parsed)) return [];
	return parsed.map(sanitize).filter((p): p is LayoutPreset => p !== null);
}

/**
 * Ghi thêm một preset. Trả `false` nếu không lưu được (storage lỗi) — **không** im lặng
 * thành công, vì đó chính là lỗi mà P0 đang sửa.
 */
export function addCustomPreset(storage: StorageLike | null | undefined, preset: LayoutPreset): boolean {
	if (!storage) return false;
	const clean = sanitize(preset);
	if (!clean) return false;
	const next = [clean, ...readCustomPresets(storage)].slice(0, MAX_PRESETS);
	try {
		storage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(next));
		return true;
	} catch {
		return false;
	}
}

/** Xoá preset theo id. Trả `true` nếu thực sự có thay đổi. */
export function removeCustomPreset(storage: StorageLike | null | undefined, id: string): boolean {
	if (!storage) return false;
	const current = readCustomPresets(storage);
	const next = current.filter((p) => p.id !== id);
	if (next.length === current.length) return false;
	try {
		if (next.length === 0) storage.removeItem(CUSTOM_PRESETS_KEY);
		else storage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(next));
		return true;
	} catch {
		return false;
	}
}