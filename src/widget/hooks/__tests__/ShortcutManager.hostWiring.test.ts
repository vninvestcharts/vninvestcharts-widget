import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { HeaderShortcuts, type ShortcutAction } from "../ShortcutManager";

/**
 * HOST-WIRING guard: `HeaderShortcuts.<ten>` ma host truyền vao `useShortcuts([...])`
 * phai **ton tai that** tren `HeaderShortcuts`.
 *
 * **Vi sao can, va tsc co bat khong.** Host goi
 * `useShortcuts([HeaderShortcuts.dockToggle(h)])`. Neu ai do go sai ten (typo, rename,
 * xoa factory nhung giu host) thi `HeaderShortcuts.dockToggleg` la `undefined` ⇒ bay len
 * `shortcuts: ShortcutAction[]` ⇒ `useShortcuts` goi `action.keys` tren undefined ⇒
 * **crash runtime khi component render**, khong phai luc bam phim.
 *
 * Da do ky: `tsc` **CO bat** typo nay (do `HeaderShortcuts` la typed object, khong phai
 * index signature). ⇒ File nay **KHONG** lap lao cong cua `tsc`; gia tri cua no:
 *
 * 1. **Cho mot contract ro rang** host dang ky binding nao (HOST-SET). `tsc` khong biet
 *    y do — host sua mat `dockToggle` ma de lai `useShortcuts([HeaderShortcuts.symbolSearchModal(h)])`
 *    thi `tsc` van xanh, shortcut dock bien mat, khong ai biet.
 * 2. **Chot trong thuc** rang buoc thoi gian chay: factory dang ton tai co that tra ve
 *    `ShortcutAction` hop le, `keys` khong rong (HOST-TYPE). File nao can mot bang tich
 *    hop le thi `import` no, va `tsc` khong kiem duoc pham vi runtime.
 *
 * Ky thuc **source-level**: doc source host va doi chieu ten factory voi object that. La
 * kiem tra *source*, khong phai *runtime render* — comment ghi ro de khong ai hieu nham
 * day la bang chung manh hon phai co.
 *
 * **Khong phai** collision guard: `ShortcutManager.collision.test.ts` lo *trung key giua cac
 * binding*. File nay lo *host dang ky binding khong ton tai / mat binding* — hai lo loi
 * khac nhau.
 */

const HOST_SOURCES = [
	// Single-chart host: chi 2 binding duoc dang ky.
	{ file: "src/widget/VNInvestCharts.tsx", expectRegistered: ["dockToggle", "symbolSearchModal"] },
	// Multi-chart host: cung 2 binding.
	{ file: "src/widget/VNInvestMultiCharts.tsx", expectRegistered: ["dockToggle", "symbolSearchModal"] },
] as const;

type FactoryName = keyof typeof HeaderShortcuts;

/** Doc source host, lay danh sach ten factory duoc truyen vao `useShortcuts([...])`. */
function hostFactoryNames(absPath: string): string[] {
	const src = readFileSync(absPath, "utf8");
	// Chi lay trong khoi `useShortcuts([ ... ])`, de khong nham comment/docblock.
	const block = src.match(/useShortcuts\(\[([\s\S]*?)\]\)/);
	if (!block) return [];
	return [...block[1].matchAll(/HeaderShortcuts\.(\w+)/g)].map(m => m[1]);
}

describe("host shortcut wiring (HOST-*)", () => {
	it("HOST-EXISTS: mọi factory host truyền vào đều tồn tại trên HeaderShortcuts", () => {
		for (const host of HOST_SOURCES) {
			const names = hostFactoryNames(resolve(process.cwd(), host.file));
			expect(names.length, `${host.file}: không tìm thấy useShortcuts([...])`).toBeGreaterThan(0);
			for (const name of names) {
				expect(
					HeaderShortcuts,
					`${host.file} gọi HeaderShortcuts.${name} — factory KHÔNG tồn tại ⇒ crash runtime`
				).toHaveProperty(name);
			}
		}
	});

	it("HOST-SET: host đăng ký đúng tập binding mong đợi (chống im lặng bỏ sót)", () => {
		for (const host of HOST_SOURCES) {
			const names = hostFactoryNames(resolve(process.cwd(), host.file)).sort();
			expect([...names].sort(), `${host.file} đăng ký khác kỳ vọng`).toEqual([...host.expectRegistered].sort());
		}
	});

	it("HOST-TYPE: mỗi factory trả về ShortcutAction hợp lệ (không undefined)", () => {
		// Positive control cho HOST-EXISTS: cùng một kiểm tra "có thật là ShortcutAction",
		// nhưng gọi trực tiếp factory thay vì đọc source.
		for (const host of HOST_SOURCES) {
			for (const name of host.expectRegistered) {
				const factory = HeaderShortcuts[name as FactoryName] as (fn: () => void) => ShortcutAction;
				const action = factory(() => {});
				expect(action, `${name} trả về undefined`).toBeTruthy();
				// `keys: string[]` — ví dụ ['Control', 'Shift', 'KeyV']. Rỗng ⇒ phím không bao
				// giờ tới handler, im lặng (loại lỗi từng xảy ra với `Control+KeyR`).
				expect(Array.isArray(action.keys), `${name}.keys phải là string[]`).toBe(true);
				expect(action.keys.length, `${name}.keys rỗng`).toBeGreaterThan(0);
				expect(typeof action.handler).toBe("function");
				expect(typeof action.description).toBe("string");
			}
		}
	});
});