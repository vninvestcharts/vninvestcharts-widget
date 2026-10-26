import { describe, expect, it } from "vitest";
import { HeaderShortcuts, type ShortcutAction } from "../ShortcutManager";

/**
 * Guard chống trùng phím tắt — chặn class lỗi làm nổ A18.
 *
 * Bối cảnh (2026-09-30): `toggleSyncCrosshair` khai `Control+KeyH`, **trùng** với binding
 * **đang chạy** của drawing visibility (`useWidgetDrawings.ts` — `ctrl+h`). Hai cơ chế phân
 * phối độc lập: combo map của `KeyboardAdapter` vs listener `window` của `ShortcutManager`
 * (`:106`). Không dedupe, không `stopImmediatePropagation` chung ⇒ một lần nhấn, **cả hai
 * handler chạy**, cả hai `preventDefault()`.
 *
 * Chỉ "phát hiện" thì chưa đủ — phải **chặn** trước khi đăng ký. Test này assert mọi combo
 * trong `HeaderShortcuts` là duy nhất và không đụng các combo do module khác sở hữu, nên khi
 * ai đó nối `useHeaderShortcuts` (đang 0 caller) hoặc thêm binding A18 thì **CI đỏ trước khi
 * ship**, thay vì để va chạp nổ trong tay người dùng.
 *
 * Lưu ý: `'ctrl'` trong `ShortcutManager` khớp **cả** `metaKey` (Cmd), nên chuẩn hoá phải
 * gộp ctrl+meta về một giá trị — nếu không, `Control+KeyK` và `Meta+KeyK` bị coi là khác nhau
 * trong khi thực tế là cùng một phím trên Mac.
 */

/** Combo do module KHÁC sở hữu, lấy từ `useWidgetDrawings` + `useTradingHotkeys`. */
const FOREIGN_COMBOS = [
	"ctrl+c",
	"ctrl+v",
	"ctrl+l",
	"ctrl+h",
	"shift+b",
	"shift+s",
	"shift+c",
] as const;

/** Combo bị trình duyệt chiếm — phím này không dùng được cho tính năng. */
const BROWSER_RESERVED = ["control+r", "control+shift+r", "control+shift+t", "control+shift+n", "control+shift+w", "control+shift+delete"] as const;

/**
 * Key TRẦN do công cụ vẽ sở hữu (`TOOL_SHORTCUT_KEYS`) — cần so với key trần của
 * `HeaderShortcuts` vì hai listener cùng `window` và không dedupe: `KeyM` của
 * `openSystemMenu` từng trùng `M: "toggleMagnet"`.
 */
const DRAWING_BARE_KEYS = ["l", "y", "h", "v", "f", "p", "g", "r", "e", "x", "a", "b", "o", "L", "S", "P", "M", "Escape"] as const;

/**
 * Chuẩn hoá danh sách trên **theo đúng hàm `normalize`** — nếu không, `KeyM` ra `"keym"`
 * còn `"M"` ra `"m"` và so sánh luôn lệch, khiến test xanh **vì lý do sai**. Đã mắc lỗi
 * này và mutation (trả `openSystemMenu` về `KeyM`) **sống sót**.
 */
const normalizeDrawingKey = (k: string): string =>
	k === "Escape" ? "escape" : normalize([`Key${k}`]);

/** Chuẩn hoá: gộp ctrl+meta (trình duyệt khớp cả hai), sort, lowercase. */
function normalize(keys: readonly string[]): string {
	const mods = new Set(keys.map(k => k.toLowerCase()));
	if (mods.has("meta") || mods.has("cmd")) mods.add("ctrl");
	if (mods.has("control")) mods.add("ctrl");
	const named = [...keys]
		.map(k => k.toLowerCase())
		.filter(k => !["control", "ctrl", "meta", "cmd", "shift", "alt"].includes(k));
	return [...mods].filter(m => ["ctrl", "shift", "alt"].includes(m)).sort().concat(named.sort()).join("+");
}

/** Mọi factory trong `HeaderShortcuts`, dựng với handler no-op. */
function allHeaderActions(): ShortcutAction[] {
	const noop = () => {};
	return Object.values(HeaderShortcuts).map(f => (f as (h: () => void) => ShortcutAction)(noop));
}

describe("Guard: không có phím tắt nào bị chiếm hai lần", () => {
	const actions = allHeaderActions();

	it("mọi combo trong HeaderShortcuts là DUY NHẤT", () => {
		const seen = new Map<string, string[]>();
		for (const a of actions) {
			const key = normalize(a.keys);
			seen.set(key, [...(seen.get(key) ?? []), a.id]);
		}
		const dupes = [...seen.entries()].filter(([, ids]) => ids.length > 1);
		expect(dupes, `combo bị khai hai lần: ${JSON.stringify(dupes)}`).toEqual([]);
	});

	it("không combo nào của HeaderShortcuts trùng combo do module khác sở hữu", () => {
		const foreign = new Set<string>(FOREIGN_COMBOS.map(k => normalize(k.split("+"))));
		const clashes = actions
			.map(a => ({ id: a.id, keys: a.keys, combo: normalize(a.keys) }))
			.filter(x => foreign.has(x.combo));
		expect(
			clashes,
			`trùng với binding đang chạy ở module khác: ${JSON.stringify(clashes)}. ` +
				`Hai cơ chế phân phối độc lập nên cả hai handler sẽ chạy.`,
		).toEqual([]);
	});

	it("không dùng combo bị trình duyệt chiếm (Ctrl+R reload, Ctrl+Shift+T mở lại tab...)", () => {
		const reserved = new Set<string>(BROWSER_RESERVED.map(k => normalize(k.split("+"))));
		const bad = actions
			.map(a => ({ id: a.id, keys: a.keys, combo: normalize(a.keys) }))
			.filter(x => reserved.has(x.combo));
		expect(bad, `combo bị browser chiếm: ${JSON.stringify(bad)}`).toEqual([]);
	});

	it("toggleSyncCrosshair KHÔNG dùng ctrl+h (đã chiếm cho drawing visibility)", () => {
		const a = HeaderShortcuts.toggleSyncCrosshair(() => {});
		expect(normalize(a.keys)).not.toBe(normalize(["Control", "KeyH"]));
	});

	it("key TRẦN của HeaderShortcuts không trùng key trần của công cụ vẽ", () => {
		const drawing = new Set<string>(DRAWING_BARE_KEYS.map(normalizeDrawingKey));
		const bad = actions
			.filter(a => a.keys.length === 1)
			.map(a => ({ id: a.id, combo: normalize(a.keys) }))
			.filter(x => drawing.has(x.combo));
		expect(
			bad,
			`key trần bị chiếm: ${JSON.stringify(bad)} — cùng window listener, không dedupe.`,
		).toEqual([]);
	});

	it("cặp phím sync là C+H và C+V (dễ nhớ, không bị browser chiếm)", () => {
		expect(normalize(HeaderShortcuts.toggleSyncCrosshair(() => {}).keys)).toBe("ctrl+shift+keyh");
		expect(normalize(HeaderShortcuts.toggleSyncVisibleRange(() => {}).keys)).toBe("ctrl+shift+keyv");
	});
});