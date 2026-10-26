// Runtime proof (AGENTS Rule 6) for H0.8 — design tokens must resolve inside
// the widget's Shadow DOM.
//
// The unit guard asserts source selectors and the generated bundle, but jsdom
// does not compute CSS custom properties (probe returns "" for BOTH selectors),
// so only a real browser can show that a token actually resolves.
//
// Causal A/B, all in-page and without rebuilding:
//   1. read the token on the `.vnsc-root` host  -> expect a real value
//   2. remove the host class                    -> expect "" (the pre-S5 state)
//   3. put the class back                       -> expect the value again
// Step 2 is the control: it proves the selector, not chance, is what makes the
// token resolve. Run: node scripts/verify-shadow-tokens.cjs
// (requires `npm run watch` on :3000)
const { chromium } = require("playwright");

const URL = "http://localhost:3000/";
const HOST_SELECTOR = '[data-testid="vninvest-charts"]';

/** One token from each of the four token files + the module dark block. */
const TOKENS = [
	{ name: "--vnsc-space-4", file: "tokens/spacing.css", expect: "16px" },
	{ name: "--vnsc-font-family-base", file: "tokens/typography.css", expectContains: "Inter" },
	{ name: "--vnsc-transition-duration-instant", file: "tokens/motion.css", expect: "0ms" },
	{ name: "--vnsc-z-0", file: "tokens/z-index.css", expect: "0" },
];

(async () => {
	const browser = await chromium.launch();
	const page = await browser.newPage();
	const pageErrors = [];
	page.on("pageerror", (e) => pageErrors.push(e.message));

	await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });
	await page.waitForTimeout(6000);
	await page.locator(HOST_SELECTOR).first().waitFor({ state: "attached", timeout: 30000 });

	const results = await page.evaluate((tokens) => {
		const host = document.querySelector('[data-testid="vninvest-charts"]');
		if (!host) return { error: "host not found" };

		const readFrom = (el) => {
			const out = {};
			const cs = getComputedStyle(el);
			for (const t of tokens) out[t.name] = cs.getPropertyValue(t.name).trim();
			return out;
		};

		// The widget root is the `.vnsc-root` element; in Shadow DOM mode it is
		// the shadow host itself, in light DOM mode its child.
		const root =
			(host.classList && host.classList.contains("vnsc-root") ? host : null) ||
			host.querySelector(".vnsc-root") ||
			(host.shadowRoot && host.shadowRoot.querySelector(".vnsc-root"));
		if (!root) return { error: "no .vnsc-root element found" };

		// --- A/B: strip `.vnsc-root` from the element AND every ancestor that
		// carries it (the demo nests two), otherwise the control is confounded.
		const carriers = [];
		for (let el = root; el && el !== document; el = el.parentElement) {
			if (el.classList && el.classList.contains("vnsc-root")) carriers.push(el);
		}
		const withClass = readFrom(root);
		carriers.forEach((el) => el.classList.remove("vnsc-root"));
		void root.offsetHeight;
		const withoutClass = readFrom(root);
		carriers.forEach((el) => el.classList.add("vnsc-root"));
		void root.offsetHeight;
		const restored = readFrom(root);

		// --- Real ShadowRoot proof: replay the shipped CSS into a fresh
		// shadow tree and read the same tokens there. A `.vnsc-root` node must
		// see them; a plain sibling must not.
		let shadow = null;
		const css = [];
		for (const s of document.querySelectorAll("style")) {
			if (s.textContent && s.textContent.includes("--vnsc-space-4")) css.push(s.textContent);
		}
		if (css.length) {
			const h = document.createElement("div");
			document.body.appendChild(h);
			const sr = h.attachShadow({ mode: "open" });
			const st = document.createElement("style");
			st.textContent = css.join("\n");
			const on = document.createElement("div");
			on.className = "vnsc-root";
			const off = document.createElement("div");
			off.className = "plain-sibling";
			sr.append(st, on, off);
			void on.offsetHeight;
			shadow = {
				cssChunks: css.length,
				withRoot: readFrom(on),
				withoutRoot: readFrom(off),
			};
			h.remove();
		}

		return {
			withClass,
			withoutClass,
			restored,
			wasInShadow: !!host.shadowRoot,
			carriers: carriers.length,
			shadow,
		};
	}, TOKENS);

	await browser.close();

	if (results.error) {
		console.log("FAIL: " + results.error);
		process.exit(1);
	}

	console.log(
		`shadow DOM: ${results.wasInShadow} | .vnsc-root carriers on the light path: ${results.carriers}`,
	);
	if (results.carriers < 1) {
		console.log("FAIL: no .vnsc-root carrier, the A/B control is meaningless");
		process.exit(1);
	}

	let ok = true;
	const check = (label, table, expectResolved) => {
		for (const t of TOKENS) {
			const v = (table && table[t.name]) || "";
			const resolves = t.expect ? v === t.expect : v.includes(t.expectContains);
			const line = `${label} ${t.name.padEnd(34)} = "${v}"`;
			if (resolves === expectResolved) console.log("  OK   " + line);
			else {
				console.log("  FAIL " + line);
				ok = false;
			}
		}
	};

	console.log("-- light DOM (as served) --");
	check("[on   ]", results.withClass, true);
	check("[off  ]", results.withoutClass, false);
	check("[back ]", results.restored, true);

	if (results.shadow) {
		console.log(`-- real ShadowRoot (${results.shadow.cssChunks} shipped css chunk(s)) --`);
		check("[shadow/.vnsc-root   ]", results.shadow.withRoot, true);
		check("[shadow/.plain-sibling]", results.shadow.withoutRoot, false);
	} else {
		console.log("FAIL: no shipped CSS containing --vnsc-space-4 found to replay");
		ok = false;
	}

	if (pageErrors.length) {
		console.log("page errors: " + JSON.stringify(pageErrors));
		ok = false;
	}

	console.log(ok ? "VERIFY:SHADOW-TOKENS PASS" : "VERIFY:SHADOW-TOKENS FAILED (see above)");
	process.exit(ok ? 0 : 1);
})();
