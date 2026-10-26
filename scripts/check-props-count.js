// BL-03A: freeze VNInvestChartsProps growth (backend: audit §15/#3).
// Counts prop fields inside `interface VNInvestChartsProps { ... }` by brace
// matching (no hardcoded line range). Fails when count exceeds MAX_PROPS.
// New props require a ledger entry + bumping MAX_PROPS here.
const fs = require("fs");
const path = require("path");

// BL-18: 156 → 157 for the onTelemetry opt-in prop (ledger BL18 justification).
// PROD-SAFE-CORP-EVENTS 2026-09-25: 157 → 158 for corporateEventsMode
// (explicit live/demo corporate-events fallback; see AUDIT_LEDGER entry).
// CS-3 (credential split): 158 → 159 for the licenseKey prop — the host-pinned
// offline license that tenantPat must never shadow.
// CS-6: 159 → 160 for onLicenseDiagnostic — the host licensing observer.
// Pro-capability 159 -> 160 for debugTier (commit 9f26adf) - a test-only tier lever
// that must not be narrowed by a license. The tier-gate E2E suites need it.
// 160 -> 161 for the same slice; ledger MAX_PROPS_DRIFT_LOGGED_2026-09-28.
// Functions cannot cross the iframe postMessage boundary, so the iframe entry
// deliberately does not forward it.
// SETTINGS-AUDIT-2026-10-18 (F-07): 161 -> 162 for onThemePresetChange - the
// host-pinned theme surfaces (multi/GridContainer pass theme explicitly) must
// hear preset writes made in the child's settings modal; callback mirrors the
// existing onTimezoneChange/onTimeframeChange observer pattern.
const MAX_PROPS = Number(process.env.PROPS_MAX || 162);
// BL-03B: canonical interface moved to VNInvestChartsProps.ts (type-only);
// fall back to VNInvestCharts.tsx for backward compatibility.
const CANDIDATES = ["src/widget/VNInvestChartsProps.ts", "src/widget/VNInvestCharts.tsx"];
const TARGET = (() => {
	for (const candidate of CANDIDATES) {
		const absolute = path.join(__dirname, "..", candidate);
		try {
			const content = fs.readFileSync(absolute, "utf8");
			if (content.includes("interface VNInvestChartsProps")) return absolute;
		} catch {
			/* try next */
		}
	}
	return path.join(__dirname, "..", CANDIDATES[0]);
})();

function main() {
	const content = fs.readFileSync(TARGET, "utf8");
	const marker = "interface VNInvestChartsProps";
	const start = content.indexOf(marker);
	if (start === -1) {
		console.error(`props check failed: '${marker}' not found`);
		process.exitCode = 1;
		return;
	}
	const open = content.indexOf("{", start);
	let depth = 0;
	let end = -1;
	for (let i = open; i < content.length; i++) {
		if (content[i] === "{") depth++;
		else if (content[i] === "}") {
			depth--;
			if (depth === 0) {
				end = i;
				break;
			}
		}
	}
	if (end === -1) {
		console.error("props check failed: unbalanced braces in VNInvestChartsProps");
		process.exitCode = 1;
		return;
	}
	const body = content.slice(open, end);
	const props = body.split("\n").filter((line) => /^\s+[A-Za-z0-9_]+\??:/.test(line));
	console.log(`VNInvestChartsProps: ${props.length} fields (max ${MAX_PROPS})`);
	if (props.length > MAX_PROPS) {
		console.error(
			`props check failed: ${props.length} > ${MAX_PROPS}. Group new props by domain (BL-03B) or bump MAX_PROPS with a ledger entry.`,
		);
		process.exitCode = 1;
	}
}

main();
