/**
 * Storage access — SSOT cho mọi thao tác `localStorage` trong `src/lib/`.
 *
 * Vì sao tồn tại: ESLint cấm truy cập global trực tiếp (`no-restricted-globals`
 * chặn `window`/`document`/`localStorage`). Nhưng `typeof localStorage === "undefined"`
 * là **guard SSR**, không phải truy cập — vẫn bị rule quy cho lỗi, nên mọi module cần
 * guard lại tự viết, rồi đếm mỗi cái là một lỗi lint mới.
 *
 * Đây là adapter mà chính message của rule yêu cầu: "Use StorageAdapter instead".
 * Việc duy nhất chạm `localStorage` trong `src/lib/` nên nằm ở đây.
 *
 * `credentialStore.ts` từng ghi rằng adapter "không dùng được ở đây vì sẽ thành vòng
 * tròn" — đúng **khi adapter chưa tồn tại**. File này không import gì, nên nay nó dùng
 * được; lý do cũ đã hết hiệu lực và việc tự viết lại guard là chi phí thuần.
 *
 * `getSafeStorage` **không** export: không caller nào cần một handle thô, và export
 * thừa là byte thừa trong bundle (ratchet đo được).
 *
 * Trả về `null` khi không có storage (SSR, hoặc storage bị chặn bởi cookie
 * settings). Kiểm tra bằng try/catch vì Safari private mode **có** `localStorage`
 * nhưng `setItem` ném exception.
 */

/* eslint-disable no-restricted-globals -- Đây là adapter: đây là nơi DUY NHẤT được
   phép chạm global. Mọi module khác gọi readJson()/writeJson().
   Nếu không có disable ở đây thì rule cấm chính file adapter của nó. */
function getSafeStorage(): Storage | null {
	try {
		if (typeof localStorage === "undefined") return null;
		return localStorage;
	} catch {
		// Storage bị chặn (Safari private mode, iframe sandboxed).
		return null;
	}
}
/* eslint-enable no-restricted-globals */

/** Đọc một khóa. Trả `fallback` nếu không có storage, không có khóa, hoặc JSON hỏng. */
export function readJson<T>(key: string, fallback: T): T {
	const store = getSafeStorage();
	if (!store) return fallback;
	try {
		const raw = store.getItem(key);
		return raw ? (JSON.parse(raw) as T) : fallback;
	} catch {
		return fallback;
	}
}

/** Ghi một khóa. Trả `false` nếu không ghi được — không ném, để caller quyết định. */
export function writeJson(key: string, value: unknown): boolean {
	const store = getSafeStorage();
	if (!store) return false;
	try {
		store.setItem(key, JSON.stringify(value));
		return true;
	} catch {
		return false;
	}
}

/** Đọc một khóa dạng chuỗi. Trả `null` nếu không có storage hoặc không có khóa. */
export function readString(key: string): string | null {
	const store = getSafeStorage();
	if (!store) return null;
	try {
		return store.getItem(key);
	} catch {
		return null;
	}
}

/** Ghi một khóa dạng chuỗi. Trả `false` nếu không ghi được. */
export function writeString(key: string, value: string): boolean {
	const store = getSafeStorage();
	if (!store) return false;
	try {
		store.setItem(key, value);
		return true;
	} catch {
		return false;
	}
}

/** Xoá một khóa. Trả `false` nếu không xoá được. */
export function removeKey(key: string): boolean {
	const store = getSafeStorage();
	if (!store) return false;
	try {
		store.removeItem(key);
		return true;
	} catch {
		return false;
	}
}