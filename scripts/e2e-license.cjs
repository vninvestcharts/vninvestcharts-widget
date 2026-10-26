#!/usr/bin/env node
/**
 * e2e-license.cjs — one place that decides how an E2E run gets a Pro entitlement.
 *
 * WHY THIS EXISTS. `verify-pine-add-to-chart.cjs` used to mint a throwaway P-256 keypair and
 * install it through the dev-only `__VNI_DEV_LICENSE__` hook, so it could only ever run against
 * a development build. On the staging environment - a production bundle, public domain - that
 * hook is folded to `&& false`, so the script measured 4/13 there and Rule 17 could not be
 * honoured for it.
 *
 * The widget does not need that hook. It reads a signed licence from
 * `localStorage['vni_license_key']` (`src/lib/credentials/credentialStore.ts:30`) and verifies
 * it against the public key embedded in the engine. So a PRODUCTION build honours a licence
 * signed by the production key - which is exactly the LIC-FIRST model, and exactly what a real
 * customer has. That is the mode staging should be tested in.
 *
 * Two modes, no third:
 *   production  VNI_E2E_LICENSE is set   -> seed that licence, install no hook
 *   development VNI_E2E_LICENSE unset    -> old behaviour: mint a throwaway keypair + hook
 *
 * The licence arrives through the environment on purpose. No key material, no signed blob and
 * no entitlement ever lands in the repository, and the self-test proves the two modes stay
 * distinguishable - a script that silently fell back to the dev hook on staging would report a
 * green run that proved nothing.
 *
 * Mint one with the production private key (never committed):
 *   set VNI_LICENSE_PRIVATE_JWK=<private jwk>
 *   node scripts/issue-license.js --tier pro --days 7 --domains charts.edusuccess.vn \
 *        --customer-code STAGING-E2E
 */
"use strict";

const STORAGE_KEY = "vni_license_key";

/** A licence we are willing to inject: the shape the engine's parseLicenseKey accepts. */
function isLicenseBlob(value) {
	return typeof value === "string" && /^vni1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.trim());
}

/**
 * The licence to seed, or null when there is none and the caller must fall back to the
 * dev-anchor path. Refuses a malformed value loudly rather than quietly degrading: a typo in an
 * env var that silently downgrades a Pro run to a free-tier one is a green gate measuring
 * nothing.
 */
function stagingLicense() {
	const raw = process.env.VNI_E2E_LICENSE;
	if (!raw) return null;
	const value = raw.trim();
	if (!isLicenseBlob(value)) {
		throw new Error(
			"VNI_E2E_LICENSE is set but is not a vni1.<payload>.<signature> blob. " +
				"Refusing to run: a silently ignored licence turns a Pro assertion into a free-tier one.",
		);
	}
	return value;
}

/**
 * What this run will use, for the log line that makes the entitlement path visible.
 *
 * Deliberately says only what is true of the ENVIRONMENT, not of any one caller: `verify-p3`
 * seeds a licence when one is offered and otherwise runs as the page is served, while
 * `verify-pine-add-to-chart` additionally mints a throwaway dev keypair. A shared string that
 * described the louder of the two callers would make `verify-p3` print a mechanism it never
 * uses — a report claiming something the machine did not do.
 */
function mode() {
	return stagingLicense() ? "production licence seeded from VNI_E2E_LICENSE" : "none seeded - the page runs at the tier the environment serves";
}

module.exports = { STORAGE_KEY, isLicenseBlob, stagingLicense, mode };

if (require.main === module) {
	const selfTest = process.argv.includes("--self-test");
	if (!selfTest) {
		console.log(`e2e-license mode: ${mode()}`);
		console.log(`storage key     : ${STORAGE_KEY}`);
		process.exit(0);
	}
	// Negative proof: a malformed licence must throw, not fall back silently.
	const cases = [
		["empty is absent", undefined, null],
		["valid blob accepted", "vni1.eyJ0IjoicHJvIn0.AAAA", "vni1.eyJ0IjoicHJvIn0.AAAA"],
	];
	let bad = 0;
	for (const [name, input, want] of cases) {
		if (input === undefined) delete process.env.VNI_E2E_LICENSE;
		else process.env.VNI_E2E_LICENSE = input;
		let got;
		try {
			got = stagingLicense();
		} catch (e) {
			got = `THREW: ${e.message.slice(0, 40)}`;
		}
		const ok = got === want;
		if (!ok) bad++;
		console.log(`  ${ok ? "ok  " : "FAIL"} ${name}: ${JSON.stringify(got)}`);
	}
	// The case that matters: a typo must refuse rather than downgrade.
	for (const junk of ["vni1.onlyonepart", "not-a-licence", "vni1..", "vni1.a.b c"]) {
		process.env.VNI_E2E_LICENSE = junk;
		let threw = false;
		try {
			stagingLicense();
		} catch {
			threw = true;
		}
		if (!threw) bad++;
		console.log(`  ${threw ? "ok  " : "FAIL"} malformed ${JSON.stringify(junk)} is refused`);
	}
	delete process.env.VNI_E2E_LICENSE;
	console.log(bad ? `SELF-TEST FAIL (${bad})` : "SELF-TEST PASS");
	process.exit(bad ? 1 : 0);
}