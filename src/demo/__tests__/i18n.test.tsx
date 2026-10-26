// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
const originalConsoleError = console.error;
console.error = (..._args: unknown[]) => {};

let act: typeof import("react").act;
let createRoot: typeof import("react-dom/client").createRoot;
let DemoI18nBoundary: typeof import("../i18n").DemoI18nBoundary;
let useDemoI18n: typeof import("../i18n").useDemoI18n;

beforeAll(async () => {
	({ act } = await import("react"));
	({ createRoot } = await import("react-dom/client"));
	({ DemoI18nBoundary, useDemoI18n } = await import("../i18n"));
});

type DemoLanguage = "vi" | "en";

let setLanguageForTest: ((language: DemoLanguage) => void) | null = null;

function DemoI18nProbe() {
	const { language, setLanguage, t } = useDemoI18n();
	setLanguageForTest = setLanguage;

	return (
		<div
			data-language={language}
			data-restore-label={t("library.restorePane")}
		>
			{language}
		</div>
	);
}

describe("DemoI18nBoundary", () => {
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

	it("falls back to the document language and keeps DOM lang and storage in sync", async () => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);

		await act(async () => {
			root?.render(
				<DemoI18nBoundary>
					<DemoI18nProbe />
				</DemoI18nBoundary>,
			);
		});

		const probe = container.querySelector("div");
		expect(probe?.getAttribute("data-language")).toBe("en");
		expect(probe?.getAttribute("data-restore-label")).toBe("Show pane again");
		expect(document.documentElement.lang).toBe("en");
		expect(window.localStorage.getItem("rsc-demo-language-v1")).toBe("en");

		await act(async () => {
			setLanguageForTest?.("vi");
			await Promise.resolve();
		});

		expect(probe?.getAttribute("data-language")).toBe("vi");
		expect(probe?.getAttribute("data-restore-label")).toBe("Hiện lại pane");
		expect(document.documentElement.lang).toBe("vi");
		expect(window.localStorage.getItem("rsc-demo-language-v1")).toBe("vi");
	});
});