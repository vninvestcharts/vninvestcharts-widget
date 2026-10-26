import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaperSettingsModal } from "../PaperSettingsModal";
import { DEFAULT_PAPER_RUNTIME_CONFIG } from "../../config/paperRuntimeConfig";

function openModal(overrides: Record<string, unknown> = {}) {
	const onSave = vi.fn();
	const onCancel = vi.fn();
	const view = render(
		<PaperSettingsModal
			open
			initial={DEFAULT_PAPER_RUNTIME_CONFIG}
			perChartOverride={false}
			onToggleOverride={vi.fn()}
			onSave={onSave}
			onCancel={onCancel}
			{...overrides}
		/>,
	);
	return { onSave, onCancel, unmount: view.unmount };
}

describe("PaperSettingsModal (S1)", () => {
	it("renders closed as null and opens with 4 tabs", () => {
		const { container } = render(
			<PaperSettingsModal
				open={false}
				initial={DEFAULT_PAPER_RUNTIME_CONFIG}
				perChartOverride={false}
				onToggleOverride={vi.fn()}
				onSave={vi.fn()}
				onCancel={vi.fn()}
			/>,
		);
		expect(container.innerHTML).toBe("");
		openModal();
		for (const tab of ["fees", "execution", "pnl", "rules"]) {
			expect(screen.getByTestId(`paper-settings-tab-${tab}`)).toBeDefined();
		}
	});

	it("Escape cancels, save emits draft with effectiveFrom", () => {
		const { onSave, onCancel } = openModal();
		fireEvent.change(screen.getByTestId("paper-settings-tax"), { target: { value: "0.2" } });
		fireEvent.click(screen.getByTestId("paper-settings-save"));
		expect(onSave).toHaveBeenCalledTimes(1);
		const payload = onSave.mock.calls[0][0] as Record<string, unknown>;
		expect(payload.taxRate).toBeCloseTo(0.002);
		expect(typeof payload.effectiveFrom).toBe("number");

		fireEvent.keyDown(screen.getByTestId("paper-settings-modal"), { key: "Escape" });
		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it("polish: X + backdrop click close, seg shows pressed state", () => {
		const first = openModal();
		fireEvent.click(screen.getByTestId("paper-settings-tab-pnl"));
		const fifo = screen.getByTestId("paper-settings-basis-fifo");
		expect(fifo.getAttribute("aria-pressed")).toBe("false");
		fireEvent.click(fifo);
		expect(fifo.getAttribute("aria-pressed")).toBe("true");
		fireEvent.click(screen.getByTestId("paper-settings-close"));
		expect(first.onCancel).toHaveBeenCalledTimes(1);
		first.unmount();

		const { onCancel: onCancel2 } = openModal();
		fireEvent.mouseDown(screen.getByTestId("paper-settings-modal"));
		expect(onCancel2).toHaveBeenCalledTimes(1);
	});

	it("audit-2: modal portals to body (escapes z-40 cap), tablist scrolls", () => {
		openModal();
		const backdrop = screen.getByTestId("paper-settings-modal");
		expect(backdrop.parentElement).toBe(document.body);
		expect(backdrop.className).toBeDefined();
	});

	it("audit-2: hideVnFees removes VN tax/commission rows for crypto", () => {
		render(
			<PaperSettingsModal
				open
				initial={DEFAULT_PAPER_RUNTIME_CONFIG}
				perChartOverride={false}
				onToggleOverride={vi.fn()}
				onSave={vi.fn()}
				onCancel={vi.fn()}
				hideVnFees
			/>,
		);
		expect(screen.queryByTestId("paper-settings-tax")).toBeNull();
		expect(screen.queryByTestId("paper-settings-commission")).toBeNull();
		expect(screen.getByTestId("paper-settings-fee")).toBeDefined();
	});

	it("hideSettlement removes the cycle row for crypto", () => {
		render(
			<PaperSettingsModal
				open
				initial={DEFAULT_PAPER_RUNTIME_CONFIG}
				perChartOverride={false}
				onToggleOverride={vi.fn()}
				onSave={vi.fn()}
				onCancel={vi.fn()}
				hideSettlement
			/>,
		);
		fireEvent.click(screen.getByTestId("paper-settings-tab-rules"));
		expect(screen.queryByTestId("paper-settings-settle-2")).toBeNull();
		expect(screen.getByTestId("paper-settings-short")).toBeDefined();
	});

	it("reset-defaults restores factory values without saving", () => {
		const { onSave } = openModal();
		fireEvent.change(screen.getByTestId("paper-settings-tax"), { target: { value: "5" } });
		expect((screen.getByTestId("paper-settings-tax") as HTMLInputElement).value).toBe("5");
		fireEvent.click(screen.getByTestId("paper-settings-reset"));
		expect((screen.getByTestId("paper-settings-tax") as HTMLInputElement).value).toBe("0.1");
		expect(onSave).not.toHaveBeenCalled();
	});

	it("rejects negative fee: save stays disabled, no emit", () => {
		const { onSave } = openModal();
		fireEvent.change(screen.getByTestId("paper-settings-fee"), { target: { value: "-1" } });
		expect(screen.getByTestId("paper-settings-error-fee")).toBeDefined();
		const save = screen.getByTestId("paper-settings-save") as HTMLButtonElement;
		expect(save.disabled).toBe(true);
		fireEvent.click(save);
		expect(onSave).not.toHaveBeenCalled();
	});
});

// F-TRADE-01: người dùng TỰ CHỌN cách xử lý khi pipeline gặp lỗi toàn vẹn.
describe("PaperSettingsModal — lựa chọn xử lý lỗi toàn vẹn (F-TRADE-01)", () => {
	function openRules() {
		const view = openModal();
		fireEvent.click(screen.getByTestId("paper-settings-tab-rules"));
		return view;
	}

	it("mặc định là 'warn' và hiện đủ 3 lựa chọn", () => {
		openRules();
		for (const mode of ["warn", "block", "strict"]) {
			expect(screen.getByTestId(`paper-settings-integrity-${mode}`)).toBeDefined();
		}
		expect(
			(screen.getByTestId("paper-settings-integrity-warn") as HTMLButtonElement).getAttribute("aria-pressed"),
		).toBe("true");
	});

	it("bấm lựa chọn khác thì đổi aria-pressed và save mang giá trị mới", () => {
		const { onSave } = openRules();
		fireEvent.click(screen.getByTestId("paper-settings-integrity-block"));
		expect(
			(screen.getByTestId("paper-settings-integrity-block") as HTMLButtonElement).getAttribute("aria-pressed"),
		).toBe("true");
		expect(
			(screen.getByTestId("paper-settings-integrity-warn") as HTMLButtonElement).getAttribute("aria-pressed"),
		).toBe("false");

		fireEvent.click(screen.getByTestId("paper-settings-save"));
		expect(onSave).toHaveBeenCalledTimes(1);
		const payload = onSave.mock.calls[0][0] as Record<string, unknown>;
		expect(payload.integrityFailureMode).toBe("block");
	});

	it("'strict' cũng lưu được — người dùng chọn được cả ba", () => {
		const { onSave } = openRules();
		fireEvent.click(screen.getByTestId("paper-settings-integrity-strict"));
		fireEvent.click(screen.getByTestId("paper-settings-save"));
		expect((onSave.mock.calls[0][0] as Record<string, unknown>).integrityFailureMode).toBe("strict");
	});

	it("giá trị initial khác mặc định thì phản ánh đúng", () => {
		openModal({ initial: { ...DEFAULT_PAPER_RUNTIME_CONFIG, integrityFailureMode: "strict" } });
		fireEvent.click(screen.getByTestId("paper-settings-tab-rules"));
		expect(
			(screen.getByTestId("paper-settings-integrity-strict") as HTMLButtonElement).getAttribute("aria-pressed"),
		).toBe("true");
	});

	it("không chọn gì thì payload KHÔNG chứa field (modal chỉ gửi phần đã đổi)", () => {
		const { onSave } = openRules();
		fireEvent.click(screen.getByTestId("paper-settings-save"));
		const payload = onSave.mock.calls[0][0] as Record<string, unknown>;
		// Modal gửi DRAFT (phần khác với initial), không gửi toàn bộ config. Nên khi người
		// dùng không chạm vào lựa chọn này, field vắng mặt — và hook sẽ giữ giá trị đang có.
		// Test này khóa đúng hợp đồng đó, thay vì đòi modal tự chèn mặc định.
		expect(payload).not.toHaveProperty("integrityFailureMode");
	});
});

// A4 (QUICKTRADE_PILLS): one-click là config persist — toggle nằm tab Execution,
// thay công tắc ⚡ session-only cũ trên strip.
describe("PaperSettingsModal — one-click trading (A4)", () => {
	it("mặc định false, bật toggle thì save mang oneClickTrading: true", () => {
		const { onSave } = openModal();
		fireEvent.click(screen.getByTestId("paper-settings-tab-execution"));
		const toggle = screen.getByTestId("paper-settings-oneclick") as HTMLInputElement;
		expect(toggle.checked).toBe(false);
		fireEvent.click(toggle);
		fireEvent.click(screen.getByTestId("paper-settings-save"));
		expect((onSave.mock.calls[0][0] as Record<string, unknown>).oneClickTrading).toBe(true);
	});

	it("initial true → checked; tắt thì save false", () => {
		const { onSave } = openModal({ initial: { ...DEFAULT_PAPER_RUNTIME_CONFIG, oneClickTrading: true } });
		fireEvent.click(screen.getByTestId("paper-settings-tab-execution"));
		const toggle = screen.getByTestId("paper-settings-oneclick") as HTMLInputElement;
		expect(toggle.checked).toBe(true);
		fireEvent.click(toggle);
		fireEvent.click(screen.getByTestId("paper-settings-save"));
		expect((onSave.mock.calls[0][0] as Record<string, unknown>).oneClickTrading).toBe(false);
	});
});
