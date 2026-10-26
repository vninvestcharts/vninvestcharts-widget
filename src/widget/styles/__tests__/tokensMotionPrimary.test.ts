// @vitest-environment jsdom
// UIUX_BATCH_C_2026-10-21 — C5 (P1-5a) + C6 (P1-5b): token contract.
//
// C5: `@media (prefers-reduced-motion: reduce)` PHẢI nằm ở TOP-LEVEL của
// `tokens/motion.css`. Trước fix nó nằm NEST trong `.vnsc-root` ⇒ CSS Nesting biến
// thành descendant `:is(.vnsc-root) .vnsc-root` ⇒ **không bao giờ match** (mỗi widget
// chỉ có 1 root) ⇒ token reduced-motion chết.
//
// C6: `--vnsc-primary` PHẢI được khai trên rule `.vnsc-root` ở SSOT `tokens/colors.css`
// (trước fix chỉ có trong `multicharts-layout.module.css` trong khối dark-only ⇒ 39 chỗ
// dùng `var(--vnsc-primary, #2962ff)` chỉ resolve được nhờ fallback).
//
// jsdom KHÔNG tính custom property ⇒ gate là **parse tĩnh** (như `tokensResolveInShadow.test.ts`).
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const STYLES_DIR = path.resolve(__dirname, "..");

function readCss(relativePath: string): string {
	return fs.readFileSync(path.join(STYLES_DIR, relativePath), "utf8");
}

function stripComments(css: string): string {
	return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

type Rule = { selector: string; body: string };

/** Flat parse: top-level `selector { body }` (KHÔNG recurse) — cần để biết rule nào nested. */
function parseTopLevelRules(css: string): Rule[] {
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

describe("C5/C6 — token contract (UIUX_BATCH_C_2026-10-21)", () => {
	it("C5: prefers-reduced-motion block is TOP-LEVEL (not nested inside .vnsc-root)", () => {
		const css = stripComments(readCss("tokens/motion.css"));
		const top = parseTopLevelRules(css);
		const media = top.filter((r) => r.selector.includes("prefers-reduced-motion"));
		expect(media.length, "motion.css must have a top-level prefers-reduced-motion rule").toBe(1);
		const body = media[0].body;
		// Rule con phải là `.vnsc-root` (hoặc selector bắt đầu bằng `.vnsc-root`),
		// và KHÔNG được chứa `.vnsc-root .vnsc-root` (dạng descendant của nesting).
		expect(body).toMatch(/\.vnsc-root\s*\{/);
		expect(body).not.toMatch(/\.vnsc-root\s+\.vnsc-root/);
		// Không được còn rule `.vnsc-root` chứa `@media` bên trong.
		const rootRules = top.filter((r) => r.selector.includes(".vnsc-root"));
		for (const r of rootRules) expect(r.body).not.toContain("@media");
	});

	it("C5: reduced-motion token overrides live on the .vnsc-root rule inside the media block", () => {
		const css = stripComments(readCss("tokens/motion.css"));
		const media = parseTopLevelRules(css).find((r) => r.selector.includes("prefers-reduced-motion"));
		expect(media).toBeTruthy();
		expect(media!.body).toContain("--vnsc-transition-duration-normal: 0ms");
	});

	it("C6: --vnsc-primary is declared on a .vnsc-root rule in the SSOT", () => {
		const css = stripComments(readCss("tokens/colors.css"));
		const roots = parseTopLevelRules(css).filter((r) => r.selector.includes(".vnsc-root"));
		const declared = roots.some((r) => /--vnsc-primary\s*:/.test(r.body));
		expect(declared, "tokens/colors.css must declare --vnsc-primary on .vnsc-root").toBe(true);
	});

	it("C6: the generated bundle also carries --vnsc-primary (runtime injection path)", () => {
		const injected = stripComments(readCss("injected.css"));
		expect(injected, "injected.css must carry --vnsc-primary").toMatch(/--vnsc-primary\s*:/);
	});
});
