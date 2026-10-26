// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
const originalConsoleError = console.error;
console.error = (..._args: unknown[]) => {};

let act: typeof import("react").act;
let createRoot: typeof import("react-dom/client").createRoot;
let DemoI18nBoundary: typeof import("../i18n").DemoI18nBoundary;
let PaneSettingsModal: typeof import("../PaneSettingsModal").PaneSettingsModal;

beforeAll(async () => {
	({ act } = await import("react"));
	({ createRoot } = await import("react-dom/client"));
	({ DemoI18nBoundary } = await import("../i18n"));
	({ PaneSettingsModal } = await import("../PaneSettingsModal"));
});

const noop = () => undefined;

const mockPaneState = {
	panes: [
		{
			id: "price",
			label: "Price",
			pinned: true,
			visible: true,
			heightRatio: 1,
			series: [],
			splitScale: false,
			tooltip: "ohlc",
		},
	],
	visiblePanes: [
		{
			id: "price",
			label: "Price",
			pinned: true,
			visible: true,
			heightRatio: 1,
			series: [],
			splitScale: false,
			tooltip: "ohlc",
		},
	],
	heights: [240],
	available: 240,
	toggleVisible: noop,
	addPane: noop,
	removePane: noop,
	deletePane: noop,
	renamePane: noop,
	restorePane: noop,
	addSeries: noop,
	removeSeries: noop,
	toggleSeriesVisible: noop,
	updateSeriesParams: noop,
	updateSeriesYAxis: noop,
	updateSeriesColor: noop,
	updateSeriesSubColor: noop,
	applyDelta: noop,
	replaceLayout: noop,
	resetToDefault: noop,
	reorderPanes: noop,
	canAddPane: true,
} as const;

describe("PaneSettingsModal", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof createRoot> | null = null;

	beforeEach(() => {
		window.localStorage.clear();
		document.documentElement.lang = "en";
	});

	afterEach(() => {
		root?.unmount();
		root = null;
		container?.remove();
		container = null;
		window.localStorage.clear();
		document.documentElement.lang = "en";
	});

	afterAll(() => {
		console.error = originalConsoleError;
	});

	it("toggles drawing price markers from the theme section", async () => {
		const onShowDrawingPriceMarkersChange = vi.fn();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);

		await act(async () => {
			root?.render(
				<DemoI18nBoundary>
					<PaneSettingsModal
						open
						section="theme"
						onSectionChange={noop}
						selectedPaneId="price"
						onSelectedPaneIdChange={noop}
						paneState={mockPaneState as never}
						maxVisiblePanes={5}
						onMaxVisiblePanesChange={noop}
						maxVisibleBars={5000}
						onMaxVisibleBarsChange={noop}
						showNonTradingDays={false}
						onShowNonTradingDaysChange={noop}
						alertAudioEnabled={false}
						onAlertAudioEnabledChange={noop}
						showDrawingPriceMarkers={false}
						onShowDrawingPriceMarkersChange={onShowDrawingPriceMarkersChange}
						enableWhale={true}
						onEnableWhaleChange={noop}
						whaleThreshold={1_000_000}
						onWhaleThresholdChange={noop}
						enableCVD={true}
						onEnableCVDChange={noop}
						cvdMode="oscillator"
						onCVDModeChange={noop}
						onAddPane={noop}
						onReset={noop}
						isDark={false}
						toggleTheme={noop}
						onClose={noop}
						timezone="Asia/Ho_Chi_Minh"
						onTimezoneChange={noop}
					/>
				</DemoI18nBoundary>,
			);
		});

		expect(container.textContent).toContain("Price marker");

		const toggleButton = Array.from(container.querySelectorAll("button"))
			.find((button) => button.textContent?.trim() === "Hidden") as HTMLButtonElement | undefined;
		expect(toggleButton).toBeDefined();

		await act(async () => {
			if (!toggleButton) {
				return;
			}
			toggleButton.click();
		});

		expect(onShowDrawingPriceMarkersChange).toHaveBeenCalledWith(true);
	});


});