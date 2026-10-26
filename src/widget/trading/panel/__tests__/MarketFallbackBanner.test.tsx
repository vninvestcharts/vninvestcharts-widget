import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MarketFallbackBanner } from "../MarketFallbackBanner";

describe("MarketFallbackBanner (S4)", () => {
	it("renders for unclassified symbols, hidden for known ones", () => {
		const { unmount } = render(<MarketFallbackBanner symbol="XB12" onOpenSettings={vi.fn()} />);
		expect(screen.getByTestId("market-fallback-banner")).toBeDefined();
		unmount();
	});

	it("stays hidden for VN/crypto/derivatives/international tickers", () => {
		for (const symbol of ["HPG", "BTCUSDT", "VN30F1M", "AAPL"]) {
			const { container, unmount } = render(<MarketFallbackBanner symbol={symbol} onOpenSettings={vi.fn()} />);
			expect(container.querySelector('[data-testid="market-fallback-banner"]')).toBeNull();
			unmount();
		}
	});

	it("settings button calls through, dismiss hides for the session", () => {
		const onOpenSettings = vi.fn();
		render(<MarketFallbackBanner symbol="XB12" onOpenSettings={onOpenSettings} />);
		fireEvent.click(screen.getByTestId("market-fallback-settings"));
		expect(onOpenSettings).toHaveBeenCalledTimes(1);
		fireEvent.click(screen.getByTestId("market-fallback-dismiss"));
		expect(screen.queryByTestId("market-fallback-banner")).toBeNull();
	});
});
