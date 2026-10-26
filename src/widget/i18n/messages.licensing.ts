/**
 * Licensing settings strings, split out from `messages.en.ts` / `messages.vi.ts`.
 *
 * Why a separate file: those two sit one line from their budget (en 1552, vi 1550),
 * so there is no room for new `licensing.*` keys. This is the split CS-6 of
 * PLAN_CREDENTIAL_SPLIT_O1 calls for; it is pulled forward because the CS-1 refusal
 * fix could not tell the user that a save was rejected without one more key.
 *
 * Parity with messages.en.ts is enforced by the i18n key-count check in CI.
 */
export const licensingMessagesEn = {
	"licensing.notSaved": "Key not saved. A license key is still being migrated - reload and try again.",
	"licensing.degraded.offline": "Cannot reach the server. Showing offline features only.",
	"licensing.degraded.graceExpired": "Server data is stale. Reconnect to restore live features.",
	"licensing.degraded.planLimited": "Signed in. Live data works; some features need a higher plan.",
	"licensing.diag.insecureContext": "License needs HTTPS (or localhost). This page is served over insecure HTTP.",
	"licensing.diag.subtleUnavailable": "Web Crypto is unavailable here, so licenses cannot be verified.",
	"licensing.reject.unknown": "Server does not recognize this key. Check for typos or request a new one.",
	"licensing.reject.status": "Server reports this key is {status}.",
	"licensing.reject.disabled": "Server reports its service account is disabled.",
	"licensing.reject.network": "Server refuses this network for the key.",
	"licensing.licenseTitle": "Offline License Key",
	"licensing.licenseInputLabel": "Offline license key (vni1.)",
	"licensing.licensePlaceholder": "Paste vni1. here",
	"licensing.licenseSaved": "License key saved (offline).",
	"licensing.licenseCleared": "Offline license key removed.",
	"licensing.licenseSerial": "Serial",
	"licensing.reveal": "Show key",
	"licensing.conceal": "Hide key",
	"licensing.patTitle": "Access Token (PAT)",
} as const;

export const licensingMessagesVi = {
	"licensing.notSaved": "Chưa lưu được khóa. Còn một khóa license đang được di chuyển — hãy tải lại trang rồi thử lại.",
	"licensing.degraded.offline": "Không kết nối được server. Chỉ hiển thị tính năng offline.",
	"licensing.degraded.graceExpired": "Dữ liệu server đã cũ. Hãy kết nối lại để khôi phục tính năng trực tiếp.",
	"licensing.degraded.planLimited": "Đã đăng nhập. Dữ liệu trực tiếp hoạt động; một số tính năng cần gói cao hơn.",
	"licensing.diag.insecureContext": "License cần HTTPS (hoặc localhost). Trang này đang chạy qua HTTP không mã hoá.",
	"licensing.diag.subtleUnavailable": "Web Crypto không khả dụng ở đây, không thể xác thực license.",
	"licensing.reject.unknown": "Server kh\u00f4ng nh\u1eadn key n\u00e0y. Ki\u1ec3m tra l\u1ed7i g\u00f5 ho\u1eb7c xin key m\u1edbi.",
	"licensing.reject.status": "Server b\u00e1o key \u0111ang \u1edf {status}.",
	"licensing.reject.disabled": "Server b\u00e1o service account b\u1ecb t\u1eaft.",
	"licensing.reject.network": "Server t\u1eeb ch\u1ed1i m\u1ea1ng n\u00e0y v\u1edbi key.",
	"licensing.licenseTitle": "License Key offline",
	"licensing.licenseInputLabel": "License key offline (vni1.…)",
	"licensing.licensePlaceholder": "Dán vni1.… vào đây",
	"licensing.licenseSaved": "Đã lưu license key (offline).",
	"licensing.licenseCleared": "Đã xoá license key offline.",
	"licensing.licenseSerial": "Mã serial",
	"licensing.reveal": "Hiện khóa",
	"licensing.conceal": "Ẩn khóa",
	"licensing.patTitle": "Access Token (PAT)",
} as const;
