/**
 * S3a: Pro Plugin Registry (Inversion of Control).
 *
 * Rule 15 (AGENTS.md): widget public KHÔNG ĐƯỢC `import('@vninvestcharts/engine-pro')`
 * tĩnh (bundler của user Free sẽ FATAL BUILD ERROR vì package không tồn tại trong
 * node_modules của họ). Thay vào đó widget chỉ mở cổng IoC này:
 *
 * - Khách Pro tự `import { ProExtension } from "@vninvestcharts/engine-pro"` trong
 *   dự án của họ (họ cần private token) rồi gọi `registerProExtension(ProExtension, key)`.
 * - IIFE standalone: build 2 file riêng (`vninvestchart.free.js` sạch + `vninvestchart.pro.js`
 *   nguyên khối) — xem S4.
 *
 * File này chứa 0 byte toán Pro (chỉ interface + verify license + nạp vào registry
 * sẵn có).
 *
 * ## S31 — license phải có CHỮ KÝ, không phải tiền tố
 *
 * Bản gốc gọi `hasCapability(resolvePatTier(licenseKey), "pro_plugin")`. Mà
 * `resolvePatTier` chỉ là `pat.split("_")[1]` rồi `planToTier`
 * (`engine-core/src/patTier.ts:5-10`) — **không verify gì cả**. Bất kỳ chuỗi nào
 * dạng `vni_pro_bất-kỳ` đều mở registry: không chữ ký, không hạn dùng, không domain.
 *
 * Nay dùng `verifyLicenseKey` (ECDSA P-256 thật, engine `licenseValidator.ts:309`),
 * fail-closed ở **mọi** nhánh lỗi, rồi mới xét capability theo capability của
 * license đó (`licenseHasCapability` tôn trọng `caps` giới hạn, không bao giờ nâng quyền).
 *
 * **API đổi `boolean` → `Promise<boolean>`.** Verify chữ ký là bất đồng bộ
 * (WebCrypto). Blast radius đo bằng đồ thị import, không phải bằng mắt:
 * `node scripts/import-graph.mjs . src/widget/plugin/ProPluginRegistry.ts` ⇒
 * `importers: 1` (chỉ file test). Không có call-site production nào.
 */
import { licenseHasCapability, verifyLicenseKey } from "@vninvestcharts/engine-core";
import { registerDrawingTool } from "@vninvestcharts/engine-drawing";
import { registerSeries } from "../../lib/core/registry/SeriesRegistry";
import type { DrawingToolDefinition } from "@vninvestcharts/engine-drawing";
import type { RegistryEntry } from "../../lib/core/registry/SeriesRegistry";
import type { SeriesTypeId } from "../../lib/core/types/pane-descriptor";

export interface ProSeriesDefinition {
	type: SeriesTypeId;
	entry: RegistryEntry;
}

/** Module Pro do engine-pro cung cấp (caller tự import trong dự án của họ). */
export interface ProExtensionModule {
	drawingTools: readonly DrawingToolDefinition[];
	series: readonly ProSeriesDefinition[];
}

let activeExtension: ProExtensionModule | null = null;

export function isProExtensionActive(): boolean {
	return activeExtension !== null;
}

/** Gỡ cờ active (chỉ dùng cho test; registry Map không hỗ trợ unregister từng key). */
export function resetProExtensionForTests(): void {
	activeExtension = null;
}

/**
 * Nạp Pro extension vào registry. **Fail-closed**: chỉ khi license verify được
 * (chữ ký hợp lệ, chưa hết hạn, tier ∈ {pro, enterprise}) **và** license đó cấp
 * capability `pro_plugin` thì mới nạp. Mọi lỗi — kể cả `verifyLicenseKey` ném —
 * đều trả `false` và **không nạp gì cả**.
 *
 * ## Về `host` — ĐỌC TRƯỚC KHI GỌI
 *
 * `verifyLicenseKey` **bỏ qua** kiểm tra domain khi `opts.host` là falsy
 * (`licenseValidator.ts:353` — `if (opts.host && domains.length > 0 && …)`). Nên
 * "không truyền host" KHÔNG phải là "không kiểm domain": đó là **bỏ qua kiểm
 * domain** — một license ghim cho `buyer.example` vẫn verify ở mọi host.
 *
 * Vì `.eslintrc` cấm đọc `window`/`document`/`globalThis` trực tiếp trong `src/**`
 * (quy tắc này bắt buộc truyền adapter từ ngoài vào), hàm này **không tự đọc
 * `location`**. Người gọi phải truyền `host`.
 *
 * Hệ quả cần biết trước khi tích hợp: nếu license có `d` (ghim domain) mà
 * `host` không được truyền, license **bị từ chối**. Đây là hành vi cố ý — không biết
 * host không phải lý do để lọt license qua. License **không** ghim `d` thì không
 * cần `host` và vẫn verify bình thường.
 */
export async function registerProExtension(
	extension: ProExtensionModule | null | undefined,
	licenseKey: string,
	opts: { host?: string } = {},
): Promise<boolean> {
	if (!extension) return false;
	if (!licenseKey) return false;
	const host = opts.host ?? "";
	try {
		const license = await verifyLicenseKey(licenseKey, { host: host || undefined });
		// null = sai chữ ký / hết hạn / sai tier / thiếu WebCrypto. Fail-closed.
		if (!license) return false;
		// The engine skips its domain check when `host` is falsy, so a domain-pinned
		// license would be accepted anywhere - including a host it was never sold for.
		// Not knowing the host is not a reason to wave the license through.
		if (license.domains.length > 0 && !host) return false;
		if (!licenseHasCapability(license, "pro_plugin")) return false;
		for (const tool of extension.drawingTools ?? []) {
			registerDrawingTool(tool);
		}
		for (const s of extension.series ?? []) {
			registerSeries(s.type, s.entry);
		}
		activeExtension = extension;
		return true;
	} catch {
		return false;
	}
}