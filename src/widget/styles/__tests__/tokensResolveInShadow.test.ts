// @vitest-environment jsdom
// H0.8 — dead design tokens in Shadow DOM.
//
// `useShadowDOM` defaults to ON (`iife-entry.ts`), and a document-root selector
// never matches inside a ShadowRoot, so every variable declared under it
// resolved to "" for widget consumers: 302 declarations in the four token
// files plus 22 more in the fifth (`multicharts-layout.module.css`), all
// shipped into `injected.css`.
//
// jsdom does not compute CSS custom properties, so `getComputedStyle` cannot
// read a token value here (verified by probe: returns "" for BOTH selectors).
// The guard therefore asserts the three things that are actually observable:
// the source selectors, the generated bundle, and why the old selector cannot
// work in a ShadowRoot.
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const STYLES_DIR = path.resolve(__dirname, "..");

/** The five files the plan names (four token files + the dark-mode block). */
const TOKEN_FILES = [
	"tokens/spacing.css",
	"tokens/typography.css",
	"tokens/motion.css",
	"tokens/z-index.css",
	"multicharts-layout.module.css",
];

function readCss(relativePath: string): string {
	return fs.readFileSync(path.join(STYLES_DIR, relativePath), "utf8");
}

/** Drop `/* … *\/` so explanatory comments cannot be mistaken for selectors. */
function stripComments(css: string): string {
	return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

type Rule = { selector: string; body: string };

/** Flat parse: top-level `selector { body }`, recursing into at-rules. */
function parseRules(css: string): Rule[] {
	const rules: Rule[] = [];
	let depth = 0;
	let selectorStart = 0;
	let bodyStart = 0;
	for (let i = 0; i < css.length; i++) {
		const ch = css[i];
		if (ch === "{") {
			if (depth === 0) {
				rules.push({ selector: css.slice(selectorStart, i).trim(), body: "" });
				bodyStart = i + 1;
			}
			depth++;
		} else if (ch === "}") {
			depth--;
			if (depth === 0) {
				const last = rules[rules.length - 1];
				if (last) last.body = css.slice(bodyStart, i);
				selectorStart = i + 1;
			}
		}
	}
	return rules;
}

/**
 * Visit every rule, recursing through at-rules (`@media`, `@supports`, …) so
 * a `.vnsc-root` block nested in a media query is reached too.
 */
function forEachRule(css: string, visit: (rule: Rule) => void): void {
	for (const rule of parseRules(css)) {
		visit(rule);
		if (rule.body.includes("{")) forEachRule(rule.body, visit);
	}
}

/** `--vnsc-*` names a rule body declares itself (not ones it merely reads). */
function declaredVariables(body: string): string[] {
	return [...body.matchAll(/(--vnsc-[a-z0-9-]+)\s*:/gi)].map((m) => m[1]);
}

function readInjected(): string {
	return stripComments(fs.readFileSync(path.join(STYLES_DIR, "injected.css"), "utf8"));
}

describe("S5 — design tokens resolve inside the Shadow DOM", () => {
	it("declares no document-root selector in any of the five source files", () => {
		for (const file of TOKEN_FILES) {
			const selectorOnly = stripComments(readCss(file));
			expect(selectorOnly, `${file} must not use a document-root selector`).not.toMatch(
				/(^|[{;,}\s])\s*:root\b/,
			);
		}
	});

	it("declares its variables on .vnsc-root (the host class the widget renders)", () => {
		for (const file of TOKEN_FILES) {
			const selectorOnly = stripComments(readCss(file));
			expect(selectorOnly, `${file} must declare on .vnsc-root`).toMatch(
				/(^|[{;\s])\s*(?::global\()?\.(?:vnsc-root)/,
			);
		}
	});

	it("ships zero document-root blocks in the generated bundle", () => {
		expect(readInjected()).not.toMatch(/(^|[{;,}\s])\s*:root\b/);
	});

	it("declares each of the five files' variables on .vnsc-root in the bundle", () => {
		const onRoot = new Set<string>();
		forEachRule(readInjected(), (rule) => {
			if (!rule.selector.includes(".vnsc-root")) return;
			for (const name of declaredVariables(rule.body)) onRoot.add(name);
		});
		for (const file of TOKEN_FILES) {
			const own = declaredVariables(stripComments(readCss(file)));
			expect(own.length, `${file} must declare at least one variable`).toBeGreaterThan(0);
			for (const name of own) {
				expect(
					onRoot.has(name),
					`${file}: ${name} is no longer declared on .vnsc-root in injected.css`,
				).toBe(true);
			}
		}
	});

	it("applies the multicharts dark-mode override to .vnsc-root, not the document", () => {
		const dark = parseRules(readInjected()).find((r) =>
			/prefers-color-scheme:\s*dark/.test(r.selector),
		);
		expect(dark, "@media (prefers-color-scheme: dark) must reach the bundle").toBeTruthy();
		const scoped = parseRules(dark!.body).filter((r) => r.selector.includes(".vnsc-root"));
		expect(scoped.length, "the dark override must target .vnsc-root").toBeGreaterThan(0);
		expect(scoped.some((r) => r.body.includes("--vnsc-bg-primary"))).toBe(true);
	});

	it("the host class matches inside a real ShadowRoot, the document-root selector does not", () => {
		const host = document.createElement("div");
		document.body.appendChild(host);
		const shadow = host.attachShadow({ mode: "open" });
		const wrap = document.createElement("div");
		wrap.className = "vnsc-root";
		shadow.append(wrap);

		expect(shadow.querySelector(".vnsc-root")).toBe(wrap);
		expect(wrap.matches(".vnsc-root")).toBe(true);
		expect(wrap.matches(":root")).toBe(false);
		expect(shadow.querySelector(":root")).toBeNull();

		host.remove();
	});
});
