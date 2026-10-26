/**
 * colorAlpha.ts — đọc/ghi màu CSS kèm alpha cho ô chọn màu.
 *
 * VÌ SAO CẦN (UIUX-AB-03):
 *   Màu lưới mặc định lưu trong composite là `rgba(255, 255, 255, 0.06)`
 *   (`defaultSettings.ts:13` `gridColor`, gán tại `:61`) nhưng `<input type="color">`
 *   **chỉ nhận hex**. Trước đây tab hiển thị giá trị thay thế `#334155` (⇒ UI hiển thị
 *   sai màu đang dùng) và khi người dùng chọn màu thì ghi thẳng hex ⇒ **mất alpha**
 *   ⇒ lưới biến từ 6% thành đục. Hàm ở đây giữ alpha gốc, chỉ đổi RGB.
 *
 * Engine KHÔNG cần sửa: `AxisGridRenderer.ts:52` gán `palette.grid = gridColor` thẳng
 * (chuỗi CSS) rồi `:212/:234` dùng làm `ctx.strokeStyle` ⇒ `rgba(...)` hợp lệ.
 */

/** Màu đã phân tích: hex chuẩn 6 ký tự + alpha trong [0,1]. */
export interface ParsedColor {
	/** `#rrggbb` (chữ thường). */
	hex: string;
	/** 0..1 */
	alpha: number;
}

function clamp01(n: number): number {
	if (!Number.isFinite(n)) return 1;
	if (n < 0) return 0;
	if (n > 1) return 1;
	return n;
}

function round3(n: number): number {
	return Math.round(n * 1000) / 1000;
}

function rgbToHex(r: number, g: number, b: number): string {
	const part = (v: number) => {
		const x = Math.max(0, Math.min(255, Math.round(v)));
		return x.toString(16).padStart(2, "0");
	};
	return `#${part(r)}${part(g)}${part(b)}`;
}

/**
 * Phân tích màu CSS: `#rgb`, `#rrggbb`, `rgb(r, g, b)`, `rgba(r, g, b, a)`.
 * @returns `null` khi không parse được (ví dụ biến CSS, `transparent`).
 */
export function parseColor(value: string | null | undefined): ParsedColor | null {
	if (typeof value !== "string") return null;
	const raw = value.trim().toLowerCase();
	if (!raw) return null;

	if (raw.startsWith("#")) {
		const hex = raw.slice(1);
		if (!/^[0-9a-f]+$/.test(hex)) return null; // "#zzzzzz" không phải màu
		if (hex.length === 3 || hex.length === 4) {
			const [r, g, b, a] = hex.split("");
			return {
				hex: rgbToHex(parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16)),
				alpha: a === undefined ? 1 : clamp01(parseInt(a + a, 16) / 255),
			};
		}
		if (hex.length === 6 || hex.length === 8) {
			return {
				hex: `#${hex.slice(0, 6)}`,
				alpha: hex.length === 8 ? clamp01(parseInt(hex.slice(6, 8), 16) / 255) : 1,
			};
		}
		return null;
	}

	const m = raw.match(/^rgba?\(([^)]+)\)$/);
	if (m) {
		const parts = m[1]
			.split(/[,/\s]+/)
			.map((p) => p.trim())
			.filter((p) => p.length > 0);
		if (parts.length < 3) return null;
		// Chỉ nhận số (0-255) — không nhận phần trăm (CSS Color 4) để khỏi parse sai.
		if (parts.slice(0, 3).some((p) => p.includes("%"))) return null;
		const [r, g, b] = parts.slice(0, 3).map((p) => Number.parseFloat(p));
		if (![r, g, b].every((n) => Number.isFinite(n))) return null;
		const alpha = parts.length >= 4 ? clamp01(Number.parseFloat(parts[3])) : 1;
		return { hex: rgbToHex(r, g, b), alpha: Number.isFinite(alpha) ? alpha : 1 };
	}

	return null;
}

/**
 * Giá trị hiển thị cho `<input type="color">` (chỉ nhận hex).
 * @param fallback dùng khi giá trị hiện tại không parse được (mặc định `#334155` — màu lưới mặc định).
 */
export function toHexInputValue(value: string | null | undefined, fallback = "#334155"): string {
	return parseColor(value)?.hex ?? fallback;
}

/**
 * Giữ **alpha** của giá trị hiện tại, chỉ thay RGB bằng màu người dùng chọn.
 * - hiện tại `rgba(..., 0.06)` + chọn `#ff00ff` ⇒ `rgba(255, 0, 255, 0.06)`
 * - hiện tại `#123456` (alpha = 1) + chọn `#ff00ff` ⇒ `#ff00ff`
 */
export function withPreservedAlpha(current: string | null | undefined, pickedHex: string): string {
	const picked = parseColor(pickedHex);
	if (!picked) return toHexInputValue(pickedHex); // không ghi chuỗi bất kỳ vào settings
	const alpha = parseColor(current)?.alpha ?? 1;
	if (alpha >= 1) return picked.hex;
	const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(picked.hex.slice(i, i + 2), 16));
	return `rgba(${r}, ${g}, ${b}, ${round3(alpha)})`;
}
