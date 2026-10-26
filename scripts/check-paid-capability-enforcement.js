// F-TIER-02 — a paid capability with no enforcement is a promise the product cannot keep.
//
// Usage:
//   node scripts/check-paid-capability-enforcement.js
//   node scripts/check-paid-capability-enforcement.js --self-test
//   node scripts/check-paid-capability-enforcement.js --list
// Exit: 0 clean · 1 a paid capability is unaccounted for, or a citation/list is stale
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SELF_TEST = "--self-test";
const LIST = "--list";
const STRICT = "--strict";
const FREE_TIERS = new Set(["none", "free", "starter"]);

// ─────────────────────────────────────────────────────────────────────────────
// MATRIX RESOLUTION — grade the matrix the BUILD actually ships.
//
// The previous version always did `require("@vninvestcharts/engine-core")`, which is
// the PUBLISHED tarball in node_modules. But tsup.config.ts:24-32, vitest.config.ts:13-30
// and tsconfig.engine-paths.json all point the build, the tests and `tsc` at the SIBLING
// checkout. So locally the gate was grading matrix X while the bundle shipped matrix Y.
// That divergence is not theoretical: on 2026-10-08 six capabilities were lowered to
// `none` in engine source, the gate still reported 41 paid, and the number was quoted in a
// decision document.
//
// Precedence, matching the build: VN_ENGINE_REPO → sibling checkout → node_modules.
// A CI runner with no checkout falls through to node_modules, which is correct there.
//
// The sibling is read from its BUILT `dist/index.cjs`, not its `src/`: plain Node cannot
// `require` TypeScript with extensionless imports, and `dist` is what Rule 13 makes you
// rebuild before the widget consumes an engine change — so it is the same artifact `tsc`
// reads (tsconfig.engine-paths.json points at `dist/index.d.ts`).
//
// Whatever is chosen is PRINTED, so a reader never has to guess which matrix was graded.
// ─────────────────────────────────────────────────────────────────────────────
const MATRIX_PROBE = (m) => m && m.ALL_CAPABILITIES && typeof m.minTierFor === "function";

function engineCheckout() {
	const repo = process.env.VN_ENGINE_REPO
		? path.resolve(process.env.VN_ENGINE_REPO)
		: path.resolve(ROOT, "../vninvestcharts-engine");
	const dist = path.join(repo, "packages", "vn-kline-engine-core", "dist", "index.cjs");
	if (fs.existsSync(dist)) return { repo, dist };
	return null;
}

function loadCapabilities() {
	const checkout = engineCheckout();
	if (checkout) {
		try {
			const engine = require(checkout.dist);
			if (MATRIX_PROBE(engine)) {
				return { engine, provenance: `sibling checkout dist (${path.relative(ROOT, checkout.dist).split(path.sep).join("/")})` };
			}
			console.warn("check-paid-capability-enforcement: WARN sibling dist exports no capability matrix; falling back to node_modules");
		} catch (e) {
			// Fall through rather than failing: a half-broken checkout should not become a
			// red gate with an unhelpful message.
			console.warn(`check-paid-capability-enforcement: WARN sibling dist unusable (${e.message}); falling back to node_modules`);
		}
	}
	let engine;
	try {
		engine = require("@vninvestcharts/engine-core");
	} catch (e) {
		console.error(
			"check-paid-capability-enforcement: FAILED - cannot resolve the engine capability matrix.\n" +
				`  ${e.message}\n  Fix: npm install (the published package carries the matrix), or set VN_ENGINE_REPO.`,
		);
		process.exit(1);
	}
	if (!MATRIX_PROBE(engine)) {
		console.error(
			"check-paid-capability-enforcement: FAILED - the resolved engine exports no ALL_CAPABILITIES/minTierFor.\n" +
				"  An older engine would make this gate grade a different contract than the one that ships, silently.",
		);
		process.exit(1);
	}
	return { engine, provenance: "node_modules/@vninvestcharts/engine-core (published)" };
}
// ─────────────────────────────────────────────────────────────────────────────
// SCANNER — find a CONSTRUCT THAT DECIDES ACCESS, not a string that mentions a name.
//
// This is the whole point of the rewrite. The previous version counted "the name appears
// in a non-test src file", and that produced THREE wrong totals in one day (22 → 20 →
// "still wrong"), every time in the same direction: it counted things that enforce nothing.
// Measured false positives that shipped as "shipped":
//
//   | reported as shipped | why it is not a gate |
//   |---|---|
//   | volume_footprint | its only widget refs are a BACKEND_REQUIREMENT row and a DEVICE_HEAVY row |
//   | server_pine      | same: two table rows, zero call sites |
//   | chart_baseline   | `src/demo/i18n.tsx:821` — a COMMENT mentioning both chart types |
//   | indicator_full   | `CapabilityGate.tsx:24` — a docblock CODE EXAMPLE |
//
// So three rules, each aimed at one of those:
//   1. strip block comments, so a docblock example cannot be a gate;
//   2. skip i18n message files, because `capability.upsell.<cap>.title` is upsell copy,
//      which is by definition the promise and never the enforcement;
//   3. skip bare table rows (`"volume_footprint",`), which are set/array membership.
//
// Comments are blanked rather than deleted so reported line numbers stay true.
// Only whole-line `//` is stripped: a trailing `//` comment can hide a hit (a false
// negative ⇒ the gate asks for a written reason), which is the cheap direction to err.
// ─────────────────────────────────────────────────────────────────────────────
function stripBlockComments(text) {
	let out = "";
	let i = 0;
	const n = text.length;
	while (i < n) {
		if (text[i] === "/" && text[i + 1] === "*") {
			const end = text.indexOf("*/", i + 2);
			const stop = end === -1 ? n : end + 2;
			for (let k = i; k < stop; k++) out += text[k] === "\n" ? "\n" : " ";
			i = stop;
			continue;
		}
		out += text[i];
		i++;
	}
	return out;
}

function walkSrc(dir, out = []) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, e.name);
		if (e.isDirectory()) {
			if (e.name === "__tests__" || e.name === "node_modules") continue;
			walkSrc(full, out);
		} else if (/\.tsx?$/.test(e.name) && !/\.test\.|\.spec\.|\.d\.ts$/.test(e.name)) {
			out.push(full);
		}
	}
	return out;
}

/** i18n dictionaries carry the upsell copy. Copy is never enforcement. */
function isMessageFile(f) {
	return /[\\/](i18n|messages)[\\/]/.test(f) || /messages\.(en|vi)\.ts$/.test(f) || /capability\.messages\./.test(f);
}

const Q = (cap) => `['"\`]${cap}['"\`]`;

/**
 * The constructs, each with the reason it decides access. Adding a shorthand here
 * (e.g. a bare `.cap`) is how `capability.upsell.gap_compression.title` starts
 * counting as enforcement — do not.
 */
const GATE_CONSTRUCTS = [
	["hasCapability(tier, CAP)", (c) => new RegExp(`hasCapability\\(\\s*[^,()]+,?\\s*${Q(c)}\\s*\\)`)],
	["allows(CAP)", (c) => new RegExp(`(?:\\.|\\b)allows\\(\\s*${Q(c)}\\s*\\)`)],
	["useCapabilityGate(CAP)", (c) => new RegExp(`useCapabilityGate\\(\\s*${Q(c)}\\s*\\)`)],
	["useHasCapability(CAP)", (c) => new RegExp(`useHasCapability\\(\\s*${Q(c)}\\s*\\)`)],
	["useTierAllows(CAP)", (c) => new RegExp(`useTierAllows\\(\\s*${Q(c)}\\s*\\)`)],
	["isUsable(caps.CAP)", (c) => new RegExp(`isUsable\\(\\s*[^()]*\\.?${c}\\b`)],
	["<CapabilityGate capability=CAP>", (c) => new RegExp(`<CapabilityGate\\b[^>]*capability=\\s*${Q(c)}`)],
	// A conditional on the resolved state: `caps.CAP.state === "granted"` is a gate.
	["caps.CAP.state check", (c) => new RegExp(`\\.?${c}\\s*\\??\\.?\\s*\\.\\s*state\\b|\\.state\\s*===?\\s*['"\`]granted['"\`][^\\n]*${c}`)],
];

function readCodeLines(file) {
	const raw = fs.readFileSync(file, "utf8");
	return stripBlockComments(raw).split(/\r?\n/);
}

/** Bare set/array membership row — `"volume_footprint",` — is a flag, not a gate. */
function isBareTableRow(line, cap) {
	return new RegExp(`^${Q(cap)},?$`).test(line.trim());
}

/** The label of the first construct that decides access on this line, or null. */
function matchConstruct(line, cap) {
	if (isBareTableRow(line, cap)) return null;
	for (const [label, mk] of GATE_CONSTRUCTS) if (mk(cap).test(line)) return label;
	return null;
}

/**
 * N-4 (D8): một gate construct trong file **KHÔNG ai import** (chỉ test import) KHÔNG
 * phải là "shipped site" — surface không gắn vào đâu thì người dùng không tới được.
 * Đây là lớp lỗi mà gate này bỏ sót: `auto_pattern` có `<CapabilityGate>` trong
 * `PatternScanPanel.tsx` nhưng panel **0 mount** ⇒ gate báo "shipped" ⇒ PASS rỗng.
 *
 * Quy tắc tiếp cận: fail-open khi KHÔNG dựng được đồ thị import (self-test, repo thiếu).
 */
function isReachableSite(file, reachable) {
	if (!reachable || reachable.size === 0) return true;
	return reachable.has(path.resolve(file));
}

/** Tập file được ít nhất 1 file production khác import (trực tiếp hoặc dynamic). */
function buildImportedFiles(files) {
	const imported = new Set();
	const known = new Set(files.map((f) => path.resolve(f)));
	for (const f of files) {
		let raw = "";
		try {
			raw = fs.readFileSync(f, "utf8");
		} catch {
			continue;
		}
		const re = /(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g;
		let m;
		while ((m = re.exec(raw))) {
			const spec = m[1];
			if (!spec.startsWith(".")) continue;
			const base = path.resolve(path.dirname(f), spec);
			const candidates = [base + ".ts", base + ".tsx", path.join(base, "index.ts"), path.join(base, "index.tsx")];
			for (const cand of candidates) {
				if (known.has(cand)) {
					imported.add(cand);
					break;
				}
			}
		}
	}
	return imported;
}

function findGateSite(files, cap, reachable) {
	for (const f of files) {
		if (isMessageFile(f)) continue;
		if (!isReachableSite(f, reachable)) continue;
		const lines = readCodeLines(f);
		for (let i = 0; i < lines.length; i++) {
			const via = matchConstruct(lines[i], cap);
			if (via) {
				const rel = path.relative(ROOT, f).split(path.sep).join("/");
				return { site: `${rel}:${i + 1}`, via };
			}
		}
	}
	return null;
}
// ─────────────────────────────────────────────────────────────────────────────
// HAND-VERIFIED CONTRACTS — for enforcement a string search structurally cannot see.
//
// Each entry cites `file` + `line`, and the gate CHECKS the citation: the file must
// exist, the line must exist, and the line must contain `mustContain`. A citation that
// rots (a file deleted, a line shifted, the call rewritten) turns the gate RED instead
// of rotting into a silent allowlist. That check is the entire value of these maps —
// the previous version stored prose ("patTier.ts:82 and drawingTierUtils.ts:24 call
// hasCapability"), which nothing could verify and which had already gone stale once.
//
// Three shapes, because there are three ways a promise can be kept:
//   ENGINE   — the gate lives in an engine package.
//   PARALLEL — the gate lives in a DIFFERENT tier system, not the Capability matrix.
//   BOUND    — the name is data-bound on an options row, and a named function gates it.
// ─────────────────────────────────────────────────────────────────────────────

const ENGINE_ENFORCED = {
	no_ads: {
		file: "packages/vn-kline-engine-core/src/capabilities.ts",
		line: 267,
		mustContain: 'hasCapability(tier, "no_ads")',
		note: 'tierRequiresAds() = !hasCapability(tier, "no_ads"); reached via requiresAds(tier) and called from VNInvestCharts.tsx. Line re-derived 2026-10-22 after the `smart_drawing_pro` demotion shifted the matrix.',
	},
	// REMOVED 2026-10-22 (decision D2): `smart_drawing_pro`. Its 16 TIER-16 drawing tools
	// were already public — `engine-drawing@2.2.0` shipped `dist/index.js` unminified
	// with `calculateFibArcGeometry`, `XabcdPattern`, `FibSpiral`, `GannBox`,
	// `SchiffPitchfork` and the literal `const phi = 1.6180339887;` — so the Pro gate
	// withheld nothing and only took 16 working tools away from free users. The
	// capability is now Community ("none"); the enforcement site
	// (`engine-drawing/src/drawingTierUtils.ts:24`) still exists and still consults
	// `hasCapability(currentTier, "smart_drawing_pro")`, but it can no longer block
	// anything, so listing it here as a paid capability's enforcement site would be a
	// lie. Same shape as the 2026-10-08 (six) and 2026-10-12 (three) demotions.
};

const PARALLEL_TIER_SYSTEMS = {
	// The single most important entry here. `indicator_full` has ZERO call sites in the
	// Capability matrix — a grep of this repo proves it — and is nonetheless enforced,
	// by a SECOND tier system: `SeriesTier` in lib/core/registry/registryCore.ts. The
	// indicator composer checks it per series type, and VNInvestCharts.tsx:755 maps the
	// PAT tier onto SeriesTier. Reporting this as unenforced would send someone to "add a
	// gate" that already exists; deleting the capability name would orphan a working one.
	indicator_full: {
		file: "src/widget/components/settings/tabs/IndicatorsSettingsTab.tsx",
		line: 66,
		mustContain: "isSeriesAvailableForTier",
		note: "enforced by the parallel SeriesTier registry (lib/core/registry/registryCore.ts:214), NOT by hasCapability",
	},
	// 2026-10-12: the Pine function library (completions + `pineBuiltins`) has no
	// separate entitlement — it exists only inside the editor, and the editor is gated on
	// BOTH render paths. `13.03` §4 had left this "decided, not wired" for a sub-gate
	// inside the parent; wiring the PARENT is what actually closes it, because until
	// 2026-10-12 multi-chart reached the editor through `BottomPanelHost` with no gate at
	// all (free users got the library). That hole is closed and locked by
	// `BottomPanelHost.tierGate` tests; this entry records why the narrower name needs
	// no site of its own.
	pine_functional: {
		file: "src/widget/components/BottomPanelHost.tsx",
		// Re-derived 2026-10-15: commit 4e9a124 (PRO-EXTRACT Phase 1) made both Pro panels
		// `lazy()` + `Suspense`, which added 33 lines above this gate, moving the expression
		// 153 -> 186. The gate itself reported the drift; this is the re-derivation, not a
		// deletion to go green. If the gate line moves again, the same gate will say so.
		line: 186,
		mustContain: 'lockedTab && lockedCapability',
		note: "enforced by the parent `pine_editor` gate on both render paths (VNInvestCharts.tsx:2694 single, BottomPanelHost multi); the function library has no standalone surface",
	},
};

const BOUND_SURFACES = {
	chart_baseline: {
		file: "src/widget/utils/chartTypeOptions.ts",
		line: 51,
		mustContain: 'capability: "chart_baseline"',
		note: "CHART_TYPE_OPTIONS row; gated by isChartTypeLocked() at chartTypeOptions.ts:65 → hasCapability(patTier, option.capability). Rendered at OHLCHeader.tsx:281/364/519 and MultiChartTopbar.tsx:240.",
	},
	chart_exotic: {
		file: "src/widget/utils/chartTypeOptions.ts",
		line: 52,
		mustContain: 'capability: "chart_exotic"',
		note: "same binding, 5 rows (:52-:55); same isChartTypeLocked() gate.",
	},
};

/**
 * Declared paid, reachable by NOBODY at any tier, each with a written reason.
 *
 * A REVIEW SURFACE, not an escape hatch: adding a name means answering "why is a
 * capability we sell not reachable?" in writing. Removing one happens automatically
 * the moment a site appears — the gate fails on stale entries, so this cannot rot into
 * a permanent blanket.
 *
 * Two groups, because they have different fixes and conflating them is the trap:
 *   * `enterprise` — RESERVED ON PURPOSE. capabilities.ts states the policy: Track B
 *     needs a mounted backend (EP-0…EP-10), and the matrix must not gain new rows, only
 *     lower thresholds. Fix when EP lands: build the surface, then DELETE the entry.
 *   * `pro` — no such excuse. `pro` means client-side and shipped-ready, so nothing
 *     external is holding it up. Either the surface was never built or the name does
 *     not match what got built.
 */
const DECLARED_NOT_SHIPPED = {
	// --- reserved for backend EP (Track B) ---
	whale_campaign: "backend EP not delivered. Reserved so the matrix does not gain an entry later; capabilities.ts forbids adding new rows for Track B.",
	portfolio_analytics: "backend EP not delivered (same Track B reservation as whale_campaign).",
	adjusted_bars: "backend EP not delivered (same Track B reservation).",
	cloud_alert: "backend EP not delivered (same Track B reservation).",
	// REMOVED 2026-10-15: `webhook`. It was declared here with the Track B reason "backend EP not
	// delivered", but that was FALSE — webhook ships client-side (`AlertManager.postWebhook` plus
	// the URL input in `AlertsModal`), so Pro-tier users could fire a feature the matrix sells at
	// Enterprise. P0-a added the missing entitlement gate (`AlertManager` `webhookAllowed`,
	// fail-closed default; wired from `VNInvestCharts` via a ref so it survives async licence
	// resolution). Leaving the declaration would now make this gate report it as a STALE entry and
	// exit 1 — the gate catching a lie of its own making, which is the behaviour we want, but the
	// lie is removed first.
	orderbook_dom: "backend EP not delivered (same Track B reservation).",
	fundamentals_full: "backend EP not delivered (same Track B reservation).",
	index_constituents: "backend EP not delivered (same Track B reservation).",
	deep_history: "backend EP not delivered (same Track B reservation).",
	realtime_tick: "backend EP not delivered (same Track B reservation).",
	server_pine:
		"backend EP not delivered (same Track B reservation). MEASURED 2026-10-08: this one was being reported as SHIPPED, because its only widget refs were a BACKEND_REQUIREMENT row (CapabilityResolver.ts:117) and a DEVICE_HEAVY row (:126). A device degrade is not a tier gate, so the promise was unkept.",

	// --- declared `pro`, no gate anywhere ---
	// (empty as of 2026-10-12: `indicator_histogram` / `indicator_advanced` /
	// `session_hours` were lowered to `none` in the engine matrix and their copy deleted;
	// `replay_trading` got a real sub-gate; `pine_functional` is now a PARALLEL entry
	// above. This group exists so a future `pro` capability without a gate is forced to
	// answer "why is something we sell unreachable?" in writing.)
	//
	// N-4 / D8 (2026-10-21): `auto_pattern` có `<CapabilityGate capability="auto_pattern">`
	// trong `src/widget/components/drawing/PatternScanPanel.tsx:100` nhưng panel **0 mount**
	// (grep toàn repo: chỉ file test của nó import) ⇒ trước đây gate báo "shipped" ⇒ PASS RỖNG.
	// Nay gate có **quy tắc reachability** (file không ai import ⇒ không phải surface) ⇒
	// capability này bị báo UNACCOUNTED. Ghi ở đây để CI xanh **và** để lý do đọc được:
	//   - quyết định PM (UIUX_BATCH_C_2026-10-21, C2a): capability đã BÁN nhưng chưa có
	//     surface ⇒ hoặc mount panel ở 0.4.0, hoặc gỡ khỏi ma trận (cần bump engine).
	//   - **không** được coi là "đã ship" trong khi chưa mount.
	auto_pattern:
		"NOT MOUNTED as of 2026-10-21: PatternScanPanel.tsx has 0 production importer (only its own test) => users cannot reach the surface. PM decision (UIUX_BATCH_C_2026-10-21 C2a): mount the panel in 0.4.0 or drop the capability from the matrix (engine bump required). Until then it is declared unreachable instead of silently counted as shipped.",
};

/**
 * Check a hand-written citation against the file it names.
 * Returns null when valid, or a human-readable failure.
 */
function verifyCitation(cap, spec, engineRepo) {
	const abs = spec.file.startsWith("packages/")
		? path.join(engineRepo, spec.file)
		: path.join(ROOT, spec.file);
	if (!fs.existsSync(abs)) return `${cap}: cited file does not exist — ${spec.file}`;
	const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/);
	const line = lines[spec.line - 1];
	if (line === undefined) return `${cap}: cited line does not exist — ${spec.file}:${spec.line} (file has ${lines.length} lines)`;
	if (!line.includes(spec.mustContain)) {
		return `${cap}: ${spec.file}:${spec.line} no longer contains ${JSON.stringify(spec.mustContain)}\n      now reads: ${line.trim().slice(0, 120)}`;
	}
	return null;
}

function engineRepoRoot() {
	const checkout = engineCheckout();
	return checkout ? checkout.repo : null;
}
/**
 * Pure decision core, so --self-test can drive it with synthetic inputs.
 *
 * The free-tier filter lives HERE, not at the call site: keeping it outside meant the
 * function would happily audit a `free` capability, and the self-test could not test
 * the property it claimed to test.
 */
function audit(allCaps, minTierOf, siteOf, declared) {
	const paidCaps = allCaps.filter((c) => !FREE_TIERS.has(minTierOf(c)));
	const unaccounted = [];
	const staleEntries = [];
	const unknownEntries = [];
	const shipped = [];

	for (const cap of paidCaps) {
		const site = siteOf(cap);
		if (site) shipped.push({ cap, site: site.site || String(site), via: site.via });
		else if (Object.prototype.hasOwnProperty.call(declared, cap)) {
			// accounted for: declared and unreached, with a written reason
		} else {
			unaccounted.push({ cap, tier: minTierOf(cap) });
		}
	}

	for (const cap of Object.keys(declared)) {
		if (!paidCaps.includes(cap)) unknownEntries.push(cap);
		else if (siteOf(cap)) staleEntries.push(cap);
	}

	return { unaccounted, staleEntries, unknownEntries, shipped };
}

function selfTest() {
	// ── audit() ────────────────────────────────────────────────────────────────
	const minTierOf = (c) => (c === "cheap" ? "free" : c === "big" ? "pro" : "enterprise");
	// "dropped" is deliberately NOT in `paid`: that is the only way an entry can be
	// "unknown", and putting it in `paid` made the case vacuous — a dropped-and-still-listed
	// capability is indistinguishable from a normal one until you compare against the matrix.
	const paid = ["cheap", "shipped", "listed", "listedNowShipped", "big"];
	const siteOf = (c) =>
		c === "shipped" || c === "listedNowShipped" ? { site: "src/x.ts:1", via: "test" } : null;
	const declared = { listed: "reason A", listedNowShipped: "reason B", dropped: "reason C" };
	const r = audit(paid, minTierOf, siteOf, declared);

	// ── matchConstruct(): the false-positive classes that caused three bad totals ──
	// Each of these was reported as "shipped" before the rewrite. The failure direction
	// is silent over-reporting, which is why this self-test exists at all.
	const cap = "volume_footprint";
	// A REALISTIC docblock, delimiters included. An earlier version of this case passed a
	// single ` * …` line with no `/*`, which is not a comment at all — so it proved nothing
	// while looking like it did. The failure it hid is exactly the bug it was written for.
	const docblock = stripBlockComments(
		["/**", " * Usage:", ` * <CapabilityGate capability="${cap}">`, " */", `const real = allows("${cap}");`].join("\n"),
	);
	const rejects = [
		["a DEVICE_HEAVY / set-membership row is not a gate", matchConstruct('\t"volume_footprint",', cap) === null],
		["a BACKEND_REQUIREMENT table row is not a gate", matchConstruct('\tvolume_footprint: "none",', cap) === null],
		[
			"upsell copy is not a gate",
			matchConstruct('\t"capability.upsell.volume_footprint.title": "Volume profile",', cap) === null,
		],
		[
			"a docblock code example is not a gate, and a real call after it still is",
			matchConstruct(docblock.split("\n")[2], cap) === null && matchConstruct(docblock.split("\n")[4], cap) !== null,
		],
		[
			"a bare data-binding row is not a gate on its own",
			matchConstruct('  { value: "renko", capability: "volume_footprint" },', cap) === null,
		],
	];
	const accepts = [
		["allows(X) is a gate", matchConstruct('const canUse = tierGated.allows("volume_footprint");', cap) !== null],
		["hasCapability(t, X) is a gate", matchConstruct('if (hasCapability(tier, "volume_footprint")) {', cap) !== null],
		["<CapabilityGate capability=X> is a gate", matchConstruct('\t\t<CapabilityGate capability="volume_footprint">', cap) !== null],
		["isUsable(caps.X) is a gate", matchConstruct("if (isUsable(caps.volume_footprint)) {", cap) !== null],
	];

	// ── stripBlockComments must preserve line numbers, or every citation rots ──
	// `split` on a trailing newline yields a final empty element, so 5 inputs → 5 outputs.
	const numbered = stripBlockComments("a\n/* x\ny */\nb\n").split(/\r?\n/);
	const lineStable =
		numbered.length === 5 && numbered[0] === "a" && numbered[3] === "b" && numbered[4] === "" && numbered[1].trim() === "" && numbered[2].trim() === "";

	const checks = [
		["free capability is never audited", !r.unaccounted.some((u) => u.cap === "cheap")],
		// N-4 / D8 (2026-10-21): NEGATIVE case — a gate construct in a file that NO production
		// file imports is NOT a shipped site (the surface is unreachable ⇒ hollow PASS).
		[
			"a gate construct in a file with no production importer is NOT a shipped site",
			isReachableSite(path.resolve("src/x/Orphan.tsx"), new Set([path.resolve("src/x/Other.tsx")])) === false &&
				isReachableSite(path.resolve("src/x/Orphan.tsx"), new Set([path.resolve("src/x/Orphan.tsx")])) === true,
		],
		["reachability fails open when no import graph is available", isReachableSite(path.resolve("src/x/Orphan.tsx"), new Set()) === true],
		["a shipped capability is not listed", r.shipped.some((s) => s.cap === "shipped")],
		["a declared+unreached capability is NOT unaccounted", !r.unaccounted.some((u) => u.cap === "listed")],
		["a paid capability with no gate and no entry IS unaccounted", r.unaccounted.length === 1 && r.unaccounted[0].cap === "big"],
		["a stale entry (gate appeared) is reported", r.staleEntries.length === 1 && r.staleEntries[0] === "listedNowShipped"],
		["an entry for a capability that no longer exists is reported", r.unknownEntries.length === 1 && r.unknownEntries[0] === "dropped"],
		["stripBlockComments preserves line numbers", lineStable],
		...rejects,
		...accepts,
	];

	let failed = 0;
	for (const [name, ok] of checks) {
		if (!ok) failed++;
		console.log(`  ${ok ? "ok" : "FAIL"}  ${name}`);
	}
	if (failed) {
		console.error(`\ncheck-paid-capability-enforcement SELF-TEST FAIL: ${failed}/${checks.length}`);
		process.exit(1);
	}
	console.log(`check-paid-capability-enforcement SELF-TEST PASS: ${checks.length} case`);
	process.exit(0);
}

function main() {
	const { engine, provenance } = loadCapabilities();
	const engineRepo = engineRepoRoot();
	const files = walkSrc(path.join(ROOT, "src"));

	// Citations first: a hand-written contract that no longer resolves is a defect in
	// this file, and it must not be masked by the scan result.
	const badCitations = [];
	const contractFor = (cap) => {
		for (const map of [ENGINE_ENFORCED, PARALLEL_TIER_SYSTEMS, BOUND_SURFACES]) {
			if (!Object.prototype.hasOwnProperty.call(map, cap)) continue;
			const spec = map[cap];
			// No checkout to verify an engine citation against; treat the contract as
			// unverifiable rather than broken, and say so in the summary.
			if (!engineRepo && spec.file.startsWith("packages/")) {
				unverifiableContracts.push(`${cap}: ${spec.file}:${spec.line} (no engine checkout)`);
				return { site: `${spec.file}:${spec.line} — ${spec.note}`, via: "cited contract (unverified)" };
			}
			const bad = verifyCitation(cap, spec, engineRepo);
			if (bad) badCitations.push(bad);
			return { site: `${spec.file}:${spec.line} — ${spec.note}`, via: "cited contract" };
		}
		return null;
	};
	const unverifiableContracts = [];

	const siteCache = new Map();
	const reachable = buildImportedFiles(files);
	const siteOf = (c) => {
		if (!siteCache.has(c)) siteCache.set(c, findGateSite(files, c, reachable) || contractFor(c));
		return siteCache.get(c);
	};

	const result = audit(engine.ALL_CAPABILITIES, engine.minTierFor, siteOf, DECLARED_NOT_SHIPPED);
	const paid = engine.ALL_CAPABILITIES.filter((c) => !FREE_TIERS.has(engine.minTierFor(c)));

	if (process.argv.includes(LIST)) {
		for (const s of result.shipped) console.log(`  shipped   ${s.cap.padEnd(22)} ${s.site}  [${s.via}]`);
		for (const cap of Object.keys(DECLARED_NOT_SHIPPED)) {
			if (!siteOf(cap)) console.log(`  declared  ${cap.padEnd(22)} (no gate — see DECLARED_NOT_SHIPPED)`);
		}
		for (const u of result.unaccounted) console.log(`  UNKNOWN   ${u.cap.padEnd(22)} ${u.tier}`);
	}

	const ok =
		result.unaccounted.length === 0 &&
		result.staleEntries.length === 0 &&
		result.unknownEntries.length === 0 &&
		badCitations.length === 0 &&
		(!process.argv.includes(STRICT) || Object.keys(DECLARED_NOT_SHIPPED).length === 0);

	console.log(`paid-capability-enforcement: matrix from ${provenance}`);
	console.log(
		`paid-capability-enforcement: ${paid.length} paid · ${result.shipped.length} with a gate · ` +
			`${Object.keys(DECLARED_NOT_SHIPPED).length} declared-not-shipped · ${files.length} src file(s) scanned`,
	);
	for (const u of unverifiableContracts) console.log(`paid-capability-enforcement: WARN unverifiable citation ${u}`);

	if (!ok) {
		if (badCitations.length) {
			console.error(`\nFAIL — ${badCitations.length} hand-written contract citation(s) no longer resolve:`);
			for (const b of badCitations) console.error(`      ${b}`);
			console.error("\n  A contract is only as good as its citation. Re-derive it, do not delete it to go green.");
		}
		if (result.unaccounted.length) {
			console.error(
				`\nFAIL — ${result.unaccounted.length} paid capability(ies) have no gate and no entry\n` +
					`  in DECLARED_NOT_SHIPPED. A paid capability nobody can reach is not a gate:\n`,
			);
			for (const u of result.unaccounted) console.error(`      ${u.cap} (${u.tier})`);
			console.error(
				"\n  Either build the surface, or lower its minTierFor so the matrix stops claiming it\n" +
					"  is withheld, or add it to DECLARED_NOT_SHIPPED with a reason a human can read.\n" +
					"  A PARALLEL_TIER_SYSTEMS entry is also legitimate — some capabilities are gated by\n" +
					"  SeriesTier rather than by hasCapability. Cite the file:line and the gate checks it.",
			);
		}
		if (result.staleEntries.length) {
			console.error(`\nFAIL — DECLARED_NOT_SHIPPED lists ${result.staleEntries.length} capabilit(ies) that NOW HAVE a gate:\n`);
			for (const cap of result.staleEntries) console.error(`      ${cap} — ${siteOf(cap).site}`);
			console.error("\n  Good news: the surface exists. Delete these entries; a stale allowlist is how a");
			console.error("  permanent blanket forms out of an honest temporary note.");
		}
		if (result.unknownEntries.length) {
			console.error(`\nFAIL — DECLARED_NOT_SHIPPED names ${result.unknownEntries.length} capabilit(ies) that no longer exist:\n`);
			for (const cap of result.unknownEntries) console.error(`      ${cap}`);
			console.error("\n  The engine dropped, renamed, or lowered them out of the paid tiers. Remove the entries.");
		}
		process.exit(1);
	}

	console.log("paid-capability-enforcement: PASS (every paid capability is either gated or declared-unreached)");
}

if (process.argv.includes(SELF_TEST)) selfTest();
else main();