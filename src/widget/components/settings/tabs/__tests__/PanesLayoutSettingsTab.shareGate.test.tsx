import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PanesLayoutSettingsTab } from "../PanesLayoutSettingsTab";
import { SettingsProvider } from "../../SettingsContext";
import { VNInvestChartsStateProvider } from "../../../../context/VNInvestChartsStateContext";
import { CapabilityProvider } from "../../../CapabilityGate";
import type { PatTier } from "@vninvestcharts/engine-core";

/**
 * P0 regression lock — `share_local` (pro) phải được ENFORCE.
 *
 * Trước P0: `share_local` khai `pro` ở `engine capabilities.ts:141` nhưng **0 enforcement
 * site**. Nút Export/Import JSON hiện cho mọi tier và handler được truyền vô điều kiện từ
 * `VNInvestCharts.tsx:1646`. Copy upsell (`capability.messages.vi.ts:59-60`) tồn tại mà
 * không ai render ⇒ free nhận tính năng Pro mà không hề thấy thông báo.
 *
 * Sửa: bọc section bằng `<CapabilityGate capability="share_local">` ⇒ thiếu quyền thì hiện
 * upsell (có copy sẵn cả vi/en), có quyền thì hiện nút.
 */
function renderTab(tier: PatTier | null, extra: { narrowing?: readonly never[] } = {}) {
	const onExportLayout = vi.fn();
	const onImportLayout = vi.fn();
	const utils = render(
		<VNInvestChartsStateProvider><SettingsProvider>
			<CapabilityProvider tier={tier} narrowing={extra.narrowing as never}>
				<PanesLayoutSettingsTab onExportLayout={onExportLayout} onImportLayout={onImportLayout} />
			</CapabilityProvider>
		</SettingsProvider></VNInvestChartsStateProvider>,
	);
	return { ...utils, onExportLayout, onImportLayout };
}

describe("P0: share_local gate cho export/import workspace", () => {
	it("tier pro thấy nút Export", () => {
		renderTab("pro");
		expect(screen.getByTestId("settings-export-workspace")).toBeDefined();
	});

	it("tier free KHÔNG có vùng hành động share (không chỉ ẩn nút)", () => {
		renderTab("free");
		// Đây là phép đo ENFORCEMENT, không phụ thuộc i18n: vùng hành động bị gate bỏ hẳn.
		expect(screen.queryByTestId("share-local-actions")).toBeNull();
		expect(screen.queryByTestId("settings-export-workspace")).toBeNull();
		expect(screen.queryByTestId("settings-import-workspace")).toBeNull();
		// Còn TIÊU ĐỀ section vẫn hiện ⇒ người dùng thấy tính năng tồn tại và hiểu vì sao
		// không có nút, thay vì tưởng nó bị gỡ. Đây là upsell ngầm, không im lặng biến mất.
		expect(screen.getByTestId("workspace-json-section")).toBeDefined();
	});

	it("tier null (không xác thực) cũng bị chặn — fail-closed", () => {
		renderTab(null);
		expect(screen.queryByTestId("settings-export-workspace")).toBeNull();
	});

	it("license thu hẹp caps ở pro ⇒ vẫn bị chặn (narrowing được tôn trọng)", () => {
		// Đây là điểm mà gate theo tier đơn thuần sẽ SAI: license ký số thu hẹp thì pro cũng
		// không được mở. `CapabilityProvider` truyền narrowing xuống `resolveCapabilities`.
		renderTab("pro", { narrowing: ["basic_chart"] as never });
		expect(screen.queryByTestId("settings-export-workspace")).toBeNull();
	});

	it("bấm Export ở pro gọi handler", () => {
		const { onExportLayout } = renderTab("pro");
		fireEvent.click(screen.getByTestId("settings-export-workspace"));
		expect(onExportLayout).toHaveBeenCalledTimes(1);
	});
});