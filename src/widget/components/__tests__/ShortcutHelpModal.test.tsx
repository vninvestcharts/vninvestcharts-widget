// @vitest-environment jsdom
// BL-16/BL-21 regression lock: shortcut help opens on `?`, not while typing,
// and rows come from the shortcut SSOT.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { ShortcutHelpModal } from "../ShortcutHelpModal";
import { WidgetI18nProvider } from "../../context/WidgetI18nContext";

const SEEN_KEY = "vnsc_seenShortcuts";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

function renderModal(props?: { showHint?: boolean }) {
	act(() => {
		root?.render(
			/* eslint-disable-next-line react/no-children-prop -- required prop: this provider's props type declares `children` as mandatory, so it must be passed in the config object; createElement's 3rd-argument form fails tsc. */
			createElement(
				WidgetI18nProvider,
				{ locale: "en", children: null },
				createElement(ShortcutHelpModal, props ?? {}),
			),
		);
	});
}

/** Dựng N ô chart độc lập (mỗi ô một root riêng) — mô phỏng multicharts. */
function renderModalGrid(count: number, props?: { showHint?: boolean }) {
	const hosts: HTMLElement[] = [];
	const roots: ReturnType<typeof createRoot>[] = [];
	for (let i = 0; i < count; i++) {
		const host = document.createElement("div");
		document.body.appendChild(host);
		hosts.push(host);
		const r = createRoot(host);
		roots.push(r);
	}
	act(() => {
		for (const r of roots) {
			r.render(
				/* eslint-disable-next-line react/no-children-prop -- required prop: this provider's props type declares `children` as mandatory, so it must be passed in the config object; createElement's 3rd-argument form fails tsc. */
				createElement(
					WidgetI18nProvider,
					{ locale: "en", children: null },
					createElement(ShortcutHelpModal, props ?? {}),
				),
			);
		}
	});
	return () => {
		act(() => roots.forEach((r) => r.unmount()));
		hosts.forEach((h) => h.remove());
	};
}

function press(key: string, target?: Element) {
	act(() => {
		(target ?? document.body).dispatchEvent(
			new KeyboardEvent("keydown", { key, bubbles: true }),
		);
	});
}

beforeEach(() => {
	localStorage.clear();
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => {
		root?.unmount();
	});
	container?.remove();
	container = null;
	root = null;
	localStorage.clear();
});

describe("ShortcutHelpModal (BL-16)", () => {
	it("MẶC ĐỊNH ẨN hint (multicharts lặp chip trên mọi ô) — `?` vẫn mở modal", () => {
		renderModal();
		// Không chip: đây chính là điều gây phiền khi 4 ô chart hiện 4 chip "? Phím tắt".
		expect(container?.querySelector("button")).toBeNull();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		// Nhưng đường vào bằng bàn phím phải còn nguyên — ẩn hint không được mất khả năng dùng.
		press("?");
		expect(document.querySelector('[role="dialog"]')).not.toBeNull();
		expect(localStorage.getItem(SEEN_KEY)).toBe("1");
		press("Escape");
		expect(document.querySelector('[role="dialog"]')).toBeNull();
	});

	it("showHint bật lại được hint non-blocking (cho bề mặt muốn giữ discoverability)", () => {
		renderModal({ showHint: true });
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		const hint = container?.querySelector("button");
		expect(hint?.textContent).toContain("?");
		expect(localStorage.getItem(SEEN_KEY)).toBeNull();
		act(() => {
			hint?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(document.querySelector('[role="dialog"]')).not.toBeNull();
	});

	it("multi-grid: KHÔNG lặp chip trên nhiều ô (mặc định ẩn ở mọi ô)", () => {
		// 3 ô chart = 3 ChartFooter = 3 ShortcutHelpModal. Mặc định ẩn ⇒ 0 chip.
		const cleanup = renderModalGrid(3);
		expect(document.body.querySelectorAll("button[aria-label]").length).toBe(0);
		// Một modal duy nhất cho cả grid: `?` trên ô bất kỳ chỉ mở 1 dialog.
		press("?");
		expect(document.querySelectorAll('[role="dialog"]').length).toBe(1);
		press("Escape");
		cleanup();
	});

	it("shows nothing at all for returning visitors, but `?` reopens", () => {
		localStorage.setItem(SEEN_KEY, "1");
		renderModal();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		expect(container?.querySelector("button")).toBeNull();
		press("?");
		expect(document.querySelector('[role="dialog"]')).not.toBeNull();
	});

	it("does not hijack `?` while typing", () => {
		localStorage.setItem(SEEN_KEY, "1");
		renderModal();
		const input = document.createElement("input");
		container?.appendChild(input);
		press("?", input);
		expect(document.querySelector('[role="dialog"]')).toBeNull();
	});

	it("MULTI-GRID: one `?` opens exactly one dialog across cells, `?` again closes it", () => {
		localStorage.setItem(SEEN_KEY, "1");
		const second = document.createElement("div");
		document.body.appendChild(second);
		const root2 = createRoot(second);
		act(() => {
			root?.render(
				/* eslint-disable-next-line react/no-children-prop -- required prop: this provider's props type declares `children` as mandatory, so it must be passed in the config object; createElement's 3rd-argument form fails tsc. */
				createElement(
					WidgetI18nProvider,
					{ locale: "en", children: null },
					createElement(ShortcutHelpModal),
				),
			);
			root2.render(
				/* eslint-disable-next-line react/no-children-prop -- required prop: this provider's props type declares `children` as mandatory, so it must be passed in the config object; createElement's 3rd-argument form fails tsc. */
				createElement(
					WidgetI18nProvider,
					{ locale: "en", children: null },
					createElement(ShortcutHelpModal),
				),
			);
		});
		try {
			press("?");
			expect(document.querySelectorAll('[role="dialog"]').length).toBe(1);
			press("?");
			expect(document.querySelectorAll('[role="dialog"]').length).toBe(0);
			press("?");
			expect(document.querySelectorAll('[role="dialog"]').length).toBe(1);
			press("Escape");
			expect(document.querySelectorAll('[role="dialog"]').length).toBe(0);
		} finally {
			act(() => {
				root2.unmount();
			});
			second.remove();
		}
	});

	it("lists SSOT bindings (Alt tools + core actions)", () => {
		localStorage.setItem(SEEN_KEY, "1");
		renderModal();
		press("?");
		const text = document.querySelector('[role="dialog"]')?.textContent ?? "";
		expect(text).toContain("Alt+T");
		expect(text).toContain("Trend Line");
		expect(text).toContain("Ctrl+Z / Ctrl+Y");
		expect(text).toContain("Shift+M");
	});
});

describe("ShortcutHelpModal help-quality (HELP-*)", () => {
	function dialogText() {
		localStorage.setItem(SEEN_KEY, "1");
		renderModal();
		press("?");
		const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null;
		return { dialog, text: dialog?.textContent ?? "" };
	}

	it("renders no raw i18n keys (drawingTool.* resolved)", () => {
		const { text } = dialogText();
		expect(text).not.toMatch(/drawingTool\.[a-zA-Z]+/);
		expect(text).toContain("Polygon");
		expect(text).toContain("Long Position");
		expect(text).toContain("Toggle magnet");
	});

	it("groups Alt+letter and single-letter twins into one row per action", () => {
		const { text } = dialogText();
		expect(text).toContain("Alt+T / L");
		// Pitchfork pair merged; Shift+M magnet appears exactly once.
		expect(text).toContain("P / Shift+P");
		expect(text.match(/Shift\+M/g)?.length).toBe(1);
	});

	it("uses theme-aware tokens (no white box in dark mode)", () => {
		const { dialog } = dialogText();
		const box = dialog?.querySelector("div");
		expect(box?.getAttribute("style")).toContain("--vnsc-bg-primary");
		expect(box?.getAttribute("style")).not.toContain("#ffffff");
	});

	it("HELP-PORTAL: dialog portals to document.body, fixed over the viewport", () => {
		const { dialog } = dialogText();
		expect(dialog?.parentElement).toBe(document.body);
		expect(container?.contains(dialog)).toBe(false);
		expect(dialog?.getAttribute("style")).toContain("position: fixed");
	});

	it("HELP-COMPACT: all rows render in one multi-column list (no split tables)", () => {
		const { dialog } = dialogText();
		const list = dialog?.querySelector('[role="list"]') as HTMLElement | null;
		expect(list).not.toBeNull();
		expect(list?.getAttribute("style")).toContain("columns:");
		const items = list?.querySelectorAll('[role="listitem"]') ?? [];

		// Yêu cầu gốc của case này là **mọi dòng phải còn nguyên** (dedupe/filter không
		// được âm thầm nuốt dòng).
		//
		// ⚠️ Danh sách kỳ vọng ở đây phải **CỐ TÌNH sao chép độc lập**, KHÔNG import
		// `CORE_ROWS` từ component. Lần đầu tôi import nó — mutation xoá một dòng khỏi
		// `CORE_ROWS` vẫn cho 12/12 XANH, vì xoá khỏi khai báo cũng xoá luôn khỏi kỳ vọng.
		// Đó là test vô định: nó kiểm "mọi dòng khai báo được render" bằng chính bộ khai báo
		// cần kiểm. Nay kỳ vọng là một bản chép độc lập, nên thêm/xoá shortcut mà không
		// cập nhật test sẽ đỏ — đúng ý: phải có ý thức xác nhận shortcut mới đã được tài liệu hoá.
		const EXPECTED_CORE_KEYS = [
			"Ctrl+Z / Ctrl+Y",
			"Delete / Backspace",
			"Ctrl+C / Ctrl+V",
			"Ctrl+L / Ctrl+H",
			"Ctrl+K",
			"Ctrl+Shift+L",
			"Ctrl+Shift+H / Ctrl+Shift+V",
			"Alt+S",
			"Shift+B / Shift+S / Shift+C",
			"Space / ← / →",
			"Alt+Enter",
			"Esc",
			"?",
		];
		for (const keys of EXPECTED_CORE_KEYS) {
			expect(dialog?.textContent, `core row missing: ${keys}`).toContain(keys);
		}

		// Không dòng nào dư (render trùng) và modal không phình vô hạn.
		expect(items.length).toBeGreaterThanOrEqual(EXPECTED_CORE_KEYS.length);
		expect(items.length).toBeLessThanOrEqual(40);
	});
});
