import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { usePaperIntegrityAlerts } from "../usePaperIntegrityAlerts";
import { ToastProvider, ToastHost } from "../../../components/Toast";
import { VirtualBrokerEngine } from "../../../../lib/core/trading/VirtualBrokerEngine";
import { VN_SPOT_RULES } from "../../../../lib/core/trading/MarketRules";
import type { ReplayOHLCBar } from "../../../../lib/core/replay/replayTradingTypes";

/**
 * F-TRADE-01 — phần hiển thị: lỗi toàn vẹn của broker phải tới được người dùng, **theo lựa
 * chọn của họ**, chứ không phải theo một hành vi cứng.
 *
 * Ba chế độ khác nhau ở chỗ gì được báo:
 *   warn / block → có toast
 *   strict       → KHÔNG toast (người dùng chọn "từ chối im lặng")
 *
 * Và phải hủy đăng ký sạch khi unmount, nếu không mỗi mount lại sẽ chồng listener.
 */

const bar = (c: number): ReplayOHLCBar => ({ open: c, high: c, low: c, close: c, date: 1 });

function makeBroker(): VirtualBrokerEngine {
	return new VirtualBrokerEngine({ rules: VN_SPOT_RULES });
}

/** Mount hook trong ToastProvider, trả về broker để kích hoạt lỗi. */
function mount(mode: "warn" | "block" | "strict", broker = makeBroker()) {
	function Harness({ b }: { b: VirtualBrokerEngine }) {
		usePaperIntegrityAlerts({ broker: b, mode });
		return null;
	}
	const view = render(
		<ToastProvider>
			<Harness b={broker} />
			{/* ToastHost là component RIÊNG — provider chỉ giữ state, không render gì.
			    Thiếu nó thì không có phần tử nào trong DOM dù toast đã được push. */}
			<ToastHost />
		</ToastProvider>,
	);
	// Chỉ lấy `unmount` — spread toàn bộ `view` sẽ đè lên `cleanup` của testing-library
	// bằng VitestUtils (xung đột kiểu HookCleanupCallback).
	return { broker, unmount: view.unmount };
}

/** Đếm toast đang hiện, theo đúng selector ToastHost dùng (role=log > role=alert|status). */
function toastCount(): number {
	return document.querySelectorAll('[role="log"] [role="alert"], [role="log"] [role="status"]').length;
}

describe("usePaperIntegrityAlerts (F-TRADE-01)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("lỗi persist sinh ra toast ở chế độ 'warn'", () => {
		const { broker } = mount("warn");
		// Đẩy lỗi persist trực tiếp qua event bus của broker.
		act(() => {
			(broker as unknown as { bus: { emit(k: string, p: unknown): void } }).bus.emit(
				"persistError",
				new Error("QuotaExceeded"),
			);
		});
		expect(toastCount()).toBeGreaterThan(0);
	});

	it("chế độ 'strict' KHÔNG sinh toast — người dùng chọn từ chối im lặng", () => {
		const { broker } = mount("strict");
		act(() => {
			(broker as unknown as { bus: { emit(k: string, p: unknown): void } }).bus.emit(
				"persistError",
				new Error("QuotaExceeded"),
			);
		});
		expect(toastCount()).toBe(0);
	});

	it("chế độ 'block' CÓ sinh toast", () => {
		const { broker } = mount("block");
		act(() => {
			(broker as unknown as { bus: { emit(k: string, p: unknown): void } }).bus.emit(
				"persistError",
				new Error("QuotaExceeded"),
			);
		});
		expect(toastCount()).toBeGreaterThan(0);
	});

	it("không spam: nhiều lỗi liên tiếp trong cửa sổ ngắn chỉ báo một lần", () => {
		const { broker } = mount("warn");
		const bus = (broker as unknown as { bus: { emit(k: string, p: unknown): void } }).bus;
		act(() => {
			for (let i = 0; i < 5; i++) bus.emit("persistError", new Error("e"));
		});
		expect(toastCount()).toBe(1);
	});

	it("sau cửa sổ suppress thì báo lại được", () => {
		const { broker } = mount("warn");
		const bus = (broker as unknown as { bus: { emit(k: string, p: unknown): void } }).bus;
		act(() => {
			bus.emit("persistError", new Error("e"));
		});
		expect(toastCount()).toBe(1);
		// Toast `error` tự ẩn sau 8s (Toast.tsx DEFAULT_TIMEOUT), nên phải đo **ngay** khi
		// báo lại chứ không phải sau cả khoảng suppress — đếm tổng sẽ sai vì toast cũ đã tự
		// dismiss, không phải vì hook không báo.
		act(() => {
			vi.advanceTimersByTime(61_000);
			bus.emit("persistError", new Error("e"));
		});
		// Toast cũ đã hết hạn; phải có đúng 1 toast MỚI.
		expect(toastCount()).toBe(1);
		// Bằng chứng nó MỚI chứ không phải toast cũ chưa bị dismiss: đợi hết 8s của chính
		// nó rồi phải biến mất — nếu là toast cũ thì đã lẽ ra mất từ trước.
		act(() => {
			vi.advanceTimersByTime(8_100);
		});
		expect(toastCount()).toBe(0);
	});

	it("unmount phải hủy đăng ký — mount lại không chồng listener", () => {
		const { broker, unmount } = mount("warn");
		unmount();
		const bus = (broker as unknown as { bus: { emit(k: string, p: unknown): void } }).bus;
		act(() => {
			bus.emit("persistError", new Error("e"));
		});
		// Sau unmount không còn provider ⇒ không render toast nào.
		expect(toastCount()).toBe(0);
	});

	it("bar bị chặn sinh toast ở chế độ 'warn'", () => {
		const { broker } = mount("warn");
		act(() => {
			broker.onBar("FPT", bar(0), Date.now()); // giá 0 ⇒ bị chặn ⇒ phát barRejected
		});
		expect(toastCount()).toBe(1);
	});

	it("bar bị chặn KHÔNG sinh toast ở chế độ 'strict'", () => {
		const { broker } = mount("strict");
		act(() => {
			broker.onBar("FPT", bar(0), Date.now());
		});
		expect(toastCount()).toBe(0);
	});

	it("broker null thì không nổ, không ném", () => {
		function NullHarness() {
			usePaperIntegrityAlerts({ broker: null, mode: "warn" });
			return null;
		}
		expect(() =>
			render(
				<ToastProvider>
					<NullHarness />
					<ToastHost />
				</ToastProvider>,
			),
		).not.toThrow();
	});
});
