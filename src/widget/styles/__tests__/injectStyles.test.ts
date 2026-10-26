import { describe, expect, it } from "vitest";
import { injectVNInvestChartsCSS } from "../injectStyles";

describe("injectVNInvestChartsCSS (E0 iframe fix)", () => {
	it("injects into <head> when given a bare Document (no HierarchyRequestError)", () => {
		document.head.querySelectorAll("[data-vnsc-css-injected]").forEach((el) => el.remove());
		const holder: { style: HTMLStyleElement | null } = { style: null };
		expect(() => {
			holder.style = injectVNInvestChartsCSS(document);
		}).not.toThrow();
		expect(holder.style).not.toBeNull();
		expect(holder.style?.parentElement).toBe(document.head);
		// Idempotent on second call.
		expect(injectVNInvestChartsCSS(document)).toBeNull();
	});

	it("injects into a plain element target unchanged", () => {
		const host = document.createElement("div");
		document.body.appendChild(host);
		try {
			const style = injectVNInvestChartsCSS(host);
			expect(style?.parentElement).toBe(host);
		} finally {
			host.remove();
		}
	});
});
