import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { useWidgetSettings } from "../useWidgetSettings";
import type { UseWidgetSettingsOptions } from "../useWidgetSettings";
import { VNInvestChartsStateProvider } from "../../context/VNInvestChartsContext";

/**
 * A4 regression — khoá **call site**, không phải hàm vẽ.
 *
 * `SaveChartAsImage.save()` đã nhận `options.tier`, nhưng cả hai call site trong sản phẩm
 * đều **không truyền** ⇒ watermark luôn render `NONE` và tính năng chết lặng. 15 unit test
 * của hàm vẽ đều xanh mà tính năng vẫn không chạy — đúng loại bug mà chỉ test hàm thuần không
 * bắt được. Đây là test của call site.
 */

const saveCalls: { tier: unknown }[] = [];
vi.mock("../../../lib/helper/SaveChartAsImage", () => ({
	default: {
		save: (
			_doc: Document,
			_container: HTMLElement,
			_bg: string,
			_isDark: boolean,
			cb: (dataUrl: string) => void,
			options?: { tier?: unknown },
		) => {
			saveCalls.push({ tier: options?.tier });
			cb("data:image/png;base64,AAAA");
		},
	},
}));

function renderSettings(tierRef: { current: string | undefined }) {
	// `useWidgetSettings` đọc `useVNInvestChartsState()` (dòng 571) nên cần provider thật.
	const wrapper = ({ children }: { children: ReactNode }) => (
		<VNInvestChartsStateProvider storageScopeId="export-tier-test">
			{children}
		</VNInvestChartsStateProvider>
	);
	return renderHook(
		() =>
			useWidgetSettings({
				containerRef: { current: document.createElement("div") },
				size: { width: 900, height: 500 },
				plotData: [],
				tierRef,
			} as unknown as UseWidgetSettingsOptions),
		{ wrapper },
	);
}

describe("useWidgetSettings.handleSnapshot truyền tier xuống SaveChartAsImage", () => {
	it("truyền ĐÚNG tier lúc export, không phải undefined", () => {
		saveCalls.length = 0;
		const tierRef = { current: "pro" as string | undefined };
		const { result, unmount } = renderSettings(tierRef);
		act(() => {
			result.current.handleSnapshot();
		});
		expect(saveCalls).toHaveLength(1);
		expect(saveCalls[0].tier).toBe("pro");
		unmount();
	});

	it("đọc LÚC EXPORT, không phải lúc hook dựng (giá trị gán sau vẫn chạy)", () => {
		saveCalls.length = 0;
		const tierRef = { current: undefined as string | undefined };
		const { result, unmount } = renderSettings(tierRef);
		// Mô phỏng `effectiveToolbarTier` chỉ tồn tại SAU khi hook đã dựng xong
		// (VNInvestCharts dựng hook ở :288, tier có ở :690). Nếu hook chụp giá trị lúc
		// dựng thì test này fail.
		tierRef.current = "enterprise";
		act(() => {
			result.current.handleSnapshot();
		});
		expect(saveCalls[0].tier).toBe("enterprise");
		unmount();
	});
});
