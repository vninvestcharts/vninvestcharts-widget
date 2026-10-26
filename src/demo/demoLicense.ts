/**
 * DEMO-MODE bootstrap — bản demo staging mặc định PRO cho mọi khách truy cập.
 *
 * Quyết định coordinator 2026-10-17: trang demo công khai phải để mọi người test
 * được TOÀN BỘ chức năng mà không cần tự dán key. Đây KHÔNG phải bypass:
 *
 * - License thật (`tier=pro`, không `caps` ⇒ full pro) ký bằng private key
 *   production, bind domain (e.g. `demo.example.invalid`); verify qua đúng đường LIC-FIRST
 *   của khách trả tiền (`usePatTierAuthentication.ts` → `verifyLicenseKey(key,
 *   { host: location.hostname })`).
 * - Blob vào bundle demo lúc build qua env `VNI_DEMO_LICENSE` (DefinePlugin,
 *   config/webpack.config.js). tsup/library KHÔNG define biến này và module này
 *   không nằm trong entry thư viện ⇒ blob không bao giờ vào `dist/`.
 * - Blob công khai THEO THIẾT KẾ (bundle demo + localStorage khách đều đọc được);
 *   thứ chặn dùng lại ngoài domain là domain binding trong validator — đúng mục
 *   tiêu "chi phí bypass >> giá mua" (Rule 15).
 *
 * Guard rails:
 * - CHỈ cài khi slot license còn trống (`readLicenseKey()`) ⇒ E2E seed bằng
 *   init-script (chạy trước mọi script trang) luôn thắng, không bị ghi đè.
 * - `localStorage[DEMO_LICENSE_OPTOUT_KEY] === "1"` tắt hoàn toàn: lever FREE cho
 *   `verify-pine` PINE-12 (xem armProTier unarmed branch) và cho người muốn xem
 *   đúng tier free.
 * - Shape check trước khi ghi; chữ ký/hạn/domain vẫn do engine quyết định.
 */
import { readLicenseKey, writeLicenseKey } from "../lib/credentials/credentialStore";
import { readString } from "../lib/utils/storage";

/** Injected by webpack DefinePlugin from the `VNI_DEMO_LICENSE` env var (demo build only). */
declare const VNI_DEMO_LICENSE: string | undefined;

/** Đặt `"1"` trong localStorage để demo KHÔNG tự cài license (xem docblock). */
export const DEMO_LICENSE_OPTOUT_KEY = "vnsc_demo_license_off";

/** Cùng shape `parseLicenseKey` chấp nhận — chặn rác từ env trước khi ghi. */
const LICENSE_SHAPE = /^vni1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export type DemoLicenseResult =
	| "installed"
	| "no-blob"
	| "malformed"
	| "opt-out"
	| "already-present";

/**
 * Cài `blob` vào slot license nếu chưa có license và chưa bị opt-out.
 * Trả về kết quả thô để unit test + chẩn đoán phân biệt được các nhánh.
 */
export function installDemoLicense(blob: string | undefined): DemoLicenseResult {
	if (!blob) return "no-blob";
	if (!LICENSE_SHAPE.test(blob)) return "malformed";
	if (readString(DEMO_LICENSE_OPTOUT_KEY) === "1") return "opt-out";
	if (readLicenseKey()) return "already-present";
	writeLicenseKey(blob);
	return "installed";
}

/**
 * Entry point cho `src/demo/index.tsx`. Tách khỏi `installDemoLicense` để test
 * gọi được hàm thuần mà không phụ thuộc define của webpack.
 */
export function maybeInstallDemoLicense(): DemoLicenseResult {
	return installDemoLicense(typeof VNI_DEMO_LICENSE === "string" ? VNI_DEMO_LICENSE : undefined);
}
