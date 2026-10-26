// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent } from "@testing-library/react";

import { DemoI18nProvider } from "../i18n";
import { VNSymbolSearch } from "../components";
import type { VNInvestClient } from "../../widget/adapters/VNInvestClient";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

describe("VNSymbolSearch", () => {
	let container: HTMLDivElement | null = null;
	let root: ReturnType<typeof createRoot> | null = null;

	beforeEach(() => {
		document.documentElement.lang = "vi";
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => {
			root?.unmount();
		});
		root = null;
		container?.remove();
		container = null;
		document.documentElement.lang = "";
	});

	it("commits the raw typed symbol on Enter when no dropdown result is available", async () => {
		const client = {
			getStocks: vi.fn().mockRejectedValue(new Error("search unavailable")),
		} as unknown as VNInvestClient;
		const onChange = vi.fn();

		await act(async () => {
			root?.render(
				<DemoI18nProvider>
					<VNSymbolSearch client={client} value="tpb" onChange={onChange} />
				</DemoI18nProvider>,
			);
		});

		const input = container?.querySelector("input[role='combobox']") as HTMLInputElement | null;
		expect(input).not.toBeNull();

		// Simulate user typing "tpb" into the input
		await act(async () => {
			fireEvent.input(input!, { target: { value: "tpb" } });
		});

		// Wait for debounced search to reject and set no-results state
		await act(async () => {
			await new Promise((resolve) => { setTimeout(resolve, 400); });
		});

		await act(async () => {
			fireEvent.keyDown(input!, { key: "Enter" });
		});

		expect(onChange).toHaveBeenCalledWith("TPB");
	});
});