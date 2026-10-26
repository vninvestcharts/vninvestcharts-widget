import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
	DEMO_LICENSE_OPTOUT_KEY,
	installDemoLicense,
	maybeInstallDemoLicense,
} from "../demoLicense";
import {
	LICENSE_STORAGE_KEY,
	clearSessionState,
	readLicenseKey,
} from "../../lib/credentials/credentialStore";

const BLOB = "vni1.eyJ0IjoicHJvIiwiZSI6NDEwMjQ0NDgwMH0.AAAA";

// Storage isolation mirrors LicensingTab.test.tsx: module-level session memory is
// NOT storage, so clearing storage alone leaves a previous test's writes visible.
beforeEach(() => {
	window.localStorage.clear();
	window.sessionStorage.clear();
	clearSessionState();
});
afterEach(() => {
	window.localStorage.clear();
	window.sessionStorage.clear();
});

describe("demo license installer (DEMO-MODE 2026-10-17)", () => {
	it("no blob → no-op", () => {
		expect(installDemoLicense(undefined)).toBe("no-blob");
		expect(installDemoLicense("")).toBe("no-blob");
		expect(window.localStorage.getItem(LICENSE_STORAGE_KEY)).toBeNull();
	});

	it("malformed blob → refused, nothing written", () => {
		for (const junk of ["not-a-licence", "vni1.onlyonepart", "vni1..", "vni1.a.b c"]) {
			expect(installDemoLicense(junk)).toBe("malformed");
		}
		expect(window.localStorage.getItem(LICENSE_STORAGE_KEY)).toBeNull();
	});

	it("valid blob + empty slot → installed", () => {
		expect(installDemoLicense(BLOB)).toBe("installed");
		expect(window.localStorage.getItem(LICENSE_STORAGE_KEY)).toBe(BLOB);
		expect(readLicenseKey()).toBe(BLOB);
	});

	it("existing licence wins — never overwritten", () => {
		// Seed raw storage, like the E2E init-script does (verify-demo-mode DEMO-04).
		// Deliberately NOT writeLicenseKey(): that path validates through the
		// engine's isLicenseBlob, which is stricter than the installer's shape
		// check, and the invariant under test is about the installer reading
		// WHATEVER the customer already has — raw or strict-valid alike.
		const customer = "vni1.ZmFrZS1jdXN0b21lcg.AAAA";
		window.localStorage.setItem(LICENSE_STORAGE_KEY, customer);
		expect(installDemoLicense(BLOB)).toBe("already-present");
		expect(window.localStorage.getItem(LICENSE_STORAGE_KEY)).toBe(customer);
	});

	it("opt-out marker blocks the install", () => {
		window.localStorage.setItem(DEMO_LICENSE_OPTOUT_KEY, "1");
		expect(installDemoLicense(BLOB)).toBe("opt-out");
		expect(window.localStorage.getItem(LICENSE_STORAGE_KEY)).toBeNull();
	});

	it('marker values other than exactly "1" do not block', () => {
		window.localStorage.setItem(DEMO_LICENSE_OPTOUT_KEY, "0");
		expect(installDemoLicense(BLOB)).toBe("installed");
	});

	it("maybeInstallDemoLicense without the webpack define is a no-op", () => {
		// vitest has no DefinePlugin; the bare identifier is undeclared at runtime,
		// and the typeof guard must keep that safe (same pattern as VNI_API_BASE).
		expect(maybeInstallDemoLicense()).toBe("no-blob");
		expect(window.localStorage.getItem(LICENSE_STORAGE_KEY)).toBeNull();
	});
});
