import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createElement } from "react";
import { LayoutDesigner } from "../LayoutDesigner";
import type { GridLayout, LayoutPreset } from "../../grid/types";
import {
	addCustomPreset,
	readCustomPresets,
	removeCustomPreset,
	CUSTOM_PRESETS_KEY,
	type StorageLike,
} from "../../grid/customPresets";

/**
 * P0 regression lock — preset bố cục do người dùng định nghĩa không được bị nuốt im lặng.
 *
 * Trước P0: `handleSavePreset` gọi `onSaveAsPreset?.(preset)` rồi **đóng modal không điều
 * kiện**, mà call site duy nhất là `onSaveAsPreset={() => {}}`. Người dùng đặt tên, bấm
 * Save, modal đóng, không có gì được lưu, không có báo lỗi ⇒ Rule 15 (cấm nuốt im lặng).
 *
 * Test bên dưới khoá **cả hai vế**: vế "lưu được thì đóng" và — quan trọng hơn — vế
 * "KHÔNG lưu được thì không đóng và phải báo".
 */

const layout: GridLayout = {
	rows: 2,
	cols: 2,
	slots: [
		{ id: "chart-1", rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 2 },
		{ id: "chart-2", rowStart: 1, rowEnd: 1, colStart: 2, colEnd: 2 },
	],
	rowSizes: ["1fr", "1fr"],
	colSizes: ["1fr", "1fr"],
};

function memoryStorage(): StorageLike & { raw: Map<string, string> } {
	const raw = new Map<string, string>();
	return {
		raw,
		getItem: (k) => raw.get(k) ?? null,
		setItem: (k, v) => void raw.set(k, v),
		removeItem: (k) => void raw.delete(k),
	};
}

function renderDesigner(
	handler?: (p: LayoutPreset) => boolean | void,
	extra?: Partial<React.ComponentProps<typeof LayoutDesigner>>,
) {
	return render(
		<LayoutDesigner
			layout={layout}
			onLayoutChange={() => {}}
			onSaveAsPreset={handler}
			{...extra}
			isOpen={true}
			onClose={() => {}}
		/>,
	);
}

function openPresetModal() {
	fireEvent.click(screen.getByTestId("layout-designer-save-as-preset"));
}

function typeNameAndSave(name: string) {
	const input = screen.getByTestId("layout-designer-preset-name");
	fireEvent.change(input, { target: { value: name } });
	fireEvent.click(screen.getByTestId("layout-designer-preset-save"));
}

describe("P0: preset lưu thật, không nuốt im lặng", () => {
	it("handler trả false (storage lỗi) => modal KHÔNG đóng và có thông báo lỗi", () => {
		renderDesigner(() => false);
		openPresetModal();
		typeNameAndSave("Layout cua toi");

		// Modal phải còn mở — bằng chứng trực tiếp rằng chưa lưu thì không được báo xong.
		expect(screen.getByTestId("layout-designer-preset-name")).toBeDefined();
		expect(screen.getByRole("alert")).toBeDefined();
		// Tên người dùng gõ không bị mất.
		expect((screen.getByTestId("layout-designer-preset-name") as HTMLInputElement).value).toBe(
			"Layout cua toi",
		);
	});

	it("KHÔNG có handler => coi như thất bại, không đóng modal im lặng", () => {
		renderDesigner(undefined);
		openPresetModal();
		typeNameAndSave("Khong co handler");
		expect(screen.getByRole("alert")).toBeDefined();
	});

	it("handler trả true => modal đóng và không còn thông báo lỗi", () => {
		const saved: LayoutPreset[] = [];
		renderDesigner((p) => {
			saved.push(p);
			return true;
		});
		openPresetModal();
		typeNameAndSave("Layout xanh");
		expect(saved).toHaveLength(1);
		expect(saved[0].name).toBe("Layout xanh");
		expect(screen.queryByTestId("layout-designer-preset-name")).toBeNull();
	});
});

describe("P0: preset phai đọc lại được, không phải write-only", () => {
	it("preset đã lưu ĐƯỢC render kèm nút áp dụng và xoá", () => {
		// Trước đây `availablePresets` chỉ tồn tại ở type + default ⇒ lưu được rồi
		// không ai thấy, không áp dụng, không xoá được. Test này đỏ nếu vùng liệt kê bị gỡ.
		renderDesigner(undefined, {
			availablePresets: [{ id: "p1", name: "Hai cot", layout, category: "custom" }],
			onApplyPreset: () => {},
			onDeletePreset: () => {},
		});
		expect(screen.getByTestId("layout-designer-saved-presets")).toBeDefined();
		expect(screen.getByTestId("layout-preset-apply-p1")).toBeDefined();
		expect(screen.getByTestId("layout-preset-delete-p1")).toBeDefined();
	});

	it("KHÔNG có onDeletePreset thì không hiện nút xoá (không hứa cái không làm được)", () => {
		renderDesigner(undefined, {
			availablePresets: [{ id: "p4", name: "Khong xoa duoc", layout, category: "custom" }],
		});
		expect(screen.getByTestId("layout-designer-saved-presets")).toBeDefined();
		expect(screen.queryByTestId("layout-preset-delete-p4")).toBeNull();
	});

	it("bấm áp dụng gọi onApplyPreset với đúng preset", () => {
		const onApplyPreset = vi.fn();
		const preset = { id: "p2", name: "Ba hang", layout, category: "custom" } as LayoutPreset;
		renderDesigner(undefined, { availablePresets: [preset], onApplyPreset });
		fireEvent.click(screen.getByTestId("layout-preset-apply-p2"));
		expect(onApplyPreset).toHaveBeenCalledWith(preset);
	});

	it("bấm xoá gọi onDeletePreset với đúng preset", () => {
		const onDeletePreset = vi.fn();
		const preset = { id: "p3", name: "Xoá toi", layout, category: "custom" } as LayoutPreset;
		renderDesigner(undefined, { availablePresets: [preset], onDeletePreset });
		fireEvent.click(screen.getByTestId("layout-preset-delete-p3"));
		expect(onDeletePreset).toHaveBeenCalledWith(preset);
	});

	it("không có preset nào thì không render vùng liệt kê (tránh dấu rỗng)", () => {
		renderDesigner(undefined, { availablePresets: [] });
		expect(screen.queryByTestId("layout-designer-saved-presets")).toBeNull();
	});
});

describe("P0: store preset (thuần, không React)", () => {
	it("round-trip: ghi rồi đọc lại được", () => {
		const s = memoryStorage();
		const preset: LayoutPreset = {
			id: "preset-1",
			name: "Hai cot",
			layout,
			category: "custom",
		};
		expect(addCustomPreset(s, preset)).toBe(true);
		expect(readCustomPresets(s)).toHaveLength(1);
		expect(readCustomPresets(s)[0].name).toBe("Hai cot");
	});

	it("storage null => trả [] và add trả false (KHÔNG báo thành công)", () => {
		expect(readCustomPresets(null)).toEqual([]);
		expect(addCustomPreset(null, { id: "x", name: "y", layout } as LayoutPreset)).toBe(false);
	});

	it("storage ném lỗi khi setItem => add trả false, không ném ra ngoài", () => {
		const s = memoryStorage();
		s.setItem = () => {
			throw new Error("quota exceeded");
		};
		expect(addCustomPreset(s, { id: "p", name: "n", layout } as LayoutPreset)).toBe(false);
	});

	it("JSON hỏng => trả [] thay vì ném (chart phải dùng được)", () => {
		const s = memoryStorage();
		s.setItem(CUSTOM_PRESETS_KEY, "{not json");
		expect(readCustomPresets(s)).toEqual([]);
	});

	it("preset thiếu field bắt buộc bị loại, không làm hỏng cả danh sách", () => {
		const s = memoryStorage();
		s.setItem(
			CUSTOM_PRESETS_KEY,
			JSON.stringify([{ id: "ok", name: "Valid", layout }, { id: "", name: "x" }, { name: "no id" }]),
		);
		const read = readCustomPresets(s);
		expect(read).toHaveLength(1);
		expect(read[0].id).toBe("ok");
	});

	it("xoá theo id; xoá preset cuối thì dọn luôn key", () => {
		const s = memoryStorage();
		addCustomPreset(s, { id: "p1", name: "A", layout } as LayoutPreset);
		expect(removeCustomPreset(s, "p1")).toBe(true);
		expect(s.getItem(CUSTOM_PRESETS_KEY)).toBeNull();
		expect(removeCustomPreset(s, "khong-ton-tai")).toBe(false);
	});
});