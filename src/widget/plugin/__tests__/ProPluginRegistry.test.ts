import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
	addLicensePublicKey,
	resetLicensePublicKey,
	setLicensePublicKey,
} from "@vninvestcharts/engine-core";
import { getSeries, listRegistered } from "../../../lib/core/registry/SeriesRegistry";
import { listDrawingTools } from "@vninvestcharts/engine-drawing";
import type { DrawingToolDefinition } from "@vninvestcharts/engine-drawing";
import type { SeriesTypeId } from "../../../lib/core/types/pane-descriptor";
import {
	isProExtensionActive,
	registerProExtension,
	resetProExtensionForTests,
	type ProExtensionModule,
} from "../ProPluginRegistry";

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const FUTURE = Math.floor(Date.now() / 1000) + 86400 * 30;
const PAST = Math.floor(Date.now() / 1000) - 86400;

const FAKE_TOOL_NAME = "__s3a_test_tool__";
const FAKE_SERIES = "__s3a_test_series__";

function b64url(bytes: Uint8Array): string {
	let s = "";
	bytes.forEach((b) => {
		s += String.fromCharCode(b);
	});
	return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function issueKeypair() {
	const pair = (await subtle.generateKey(
		{ name: "ECDSA", namedCurve: "P-256" },
		true,
		["sign", "verify"],
	)) as CryptoKeyPair;
	const pub = (await subtle.exportKey("jwk", pair.publicKey)) as { x: string; y: string };
	return { pair, pub: { kty: "EC", crv: "P-256", x: pub.x, y: pub.y } as const };
}

/** Mint a REAL signed license — same wire format scripts/issue-license.js emits. */
async function signLicense(pair: CryptoKeyPair, payload: unknown): Promise<string> {
	const bytes = new TextEncoder().encode(JSON.stringify(payload));
	const sig = await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, bytes);
	return `vni1.${b64url(bytes)}.${b64url(new Uint8Array(sig))}`;
}

/** Register the ephemeral public key so the engine's verifier accepts our mint. */
async function trustFreshKey() {
	const { pair, pub } = await issueKeypair();
	setLicensePublicKey(pub as never);
	return pair;
}

beforeEach(() => {
	resetProExtensionForTests();
	resetLicensePublicKey();
});

describe("ProPluginRegistry (S3a IoC)", () => {
	it("rejects empty license and registers nothing (fail-closed)", async () => {
		expect(await registerProExtension(fakeExtension(), "")).toBe(false);
		expect(isProExtensionActive()).toBe(false);
		expect(listDrawingTools().some((t) => String(t.name) === FAKE_TOOL_NAME)).toBe(false);
		expect(listRegistered().includes(FAKE_SERIES as never)).toBe(false);
	});

	it("rejects null extension without consulting the license", async () => {
		const pair = await trustFreshKey();
		const key = await signLicense(pair, { t: "pro", e: FUTURE });
		expect(await registerProExtension(null, key)).toBe(false);
		expect(isProExtensionActive()).toBe(false);
	});
});

/**
 * S31 — these tests are the regression lock for the prefix-trust hole. The old
 * implementation called `resolvePatTier`, which is `pat.split("_")[1]` plus
 * `planToTier`: ANY string shaped `vni_pro_*` unlocked the whole registry. Each
 * name below states the security claim so a reader sees what broke it.
 */
describe("S31 — license signature, not string prefix", () => {
	it("REJECTS an unsigned string that merely LOOKS like a pro key", async () => {
		// The exact hole: `vni_pro_x` -> parts[1] === "pro" -> tier "pro".
		expect(await registerProExtension(fakeExtension(), "vni_pro_x")).toBe(false);
		expect(isProExtensionActive()).toBe(false);
		expect(listDrawingTools().some((t) => String(t.name) === FAKE_TOOL_NAME)).toBe(false);
		expect(listRegistered().includes(FAKE_SERIES as never)).toBe(false);
	});

	it("REJECTS a well-formed vni1 key whose signature is forged", async () => {
		// Payload says pro; signature is bytes from a DIFFERENT keypair.
		await trustFreshKey();
		const attacker = await issueKeypair();
		const forged = await signLicense(attacker.pair, { t: "pro", e: FUTURE });
		expect(await registerProExtension(fakeExtension(), forged)).toBe(false);
		expect(isProExtensionActive()).toBe(false);
	});

	it("REJECTS a correctly signed pro key that has EXPIRED", async () => {
		const pair = await trustFreshKey();
		const expired = await signLicense(pair, { t: "pro", e: PAST });
		expect(await registerProExtension(fakeExtension(), expired)).toBe(false);
		expect(isProExtensionActive()).toBe(false);
	});

	it("REJECTS a correctly signed key whose tier is free (not in pro/enterprise)", async () => {
		const pair = await trustFreshKey();
		const free = await signLicense(pair, { t: "free", e: FUTURE });
		expect(await registerProExtension(fakeExtension(), free)).toBe(false);
		expect(isProExtensionActive()).toBe(false);
	});

	it("REJECTS a pro license that excludes pro_plugin from its caps list", async () => {
		// caps narrows, never widens: a pro tier without `pro_plugin` stays shut.
		const pair = await trustFreshKey();
		const narrowed = await signLicense(pair, { t: "pro", e: FUTURE, caps: ["export_csv"] });
		expect(await registerProExtension(fakeExtension(), narrowed)).toBe(false);
		expect(isProExtensionActive()).toBe(false);
	});

	it("REJECTS a valid license when the current host is not in its domain list", async () => {
		const pair = await trustFreshKey();
		const key = await signLicense(pair, { t: "pro", e: FUTURE, d: ["buyer.example"] });
		expect(await registerProExtension(fakeExtension(), key, { host: "attacker.example" })).toBe(
			false,
		);
		expect(isProExtensionActive()).toBe(false);
	});

	it("REJECTS a domain-pinned license when the caller supplies NO host", async () => {
		// Regression for a real hole, found by independent audit. The engine skips its
		// domain check when `opts.host` is falsy (licenseValidator.ts:353), so omitting
		// host meant "domain never checked" - a license sold to one buyer then verified
		// on any host at all. Not knowing the host is not a reason to wave it through.
		//
		// `.eslintrc` bans reading `window` in src/**, so the host is injected rather
		// than discovered - which makes "caller forgot to pass it" the realistic path
		// to this hole, and therefore the case worth locking.
		const pair = await trustFreshKey();
		const key = await signLicense(pair, { t: "pro", e: FUTURE, d: ["buyer.example"] });
		expect(await registerProExtension(fakeExtension(), key)).toBe(false);
		expect(isProExtensionActive()).toBe(false);
	});

	it("REJECTS a domain-pinned license when the host is an empty string", async () => {
		// The other way a caller can omit a host by accident.
		const pair = await trustFreshKey();
		const key = await signLicense(pair, { t: "pro", e: FUTURE, d: ["buyer.example"] });
		expect(await registerProExtension(fakeExtension(), key, { host: "" })).toBe(false);
		expect(isProExtensionActive()).toBe(false);
	});

	it("ACCEPTS a license that pins NO domain without any host", async () => {
		// The counterpart to the two cases above: the new guard must not quietly turn
		// every license into a domain-locked one. A license with no `d` has no host to
		// satisfy, so it must still pass when no host is supplied.
		const pair = await trustFreshKey();
		const key = await signLicense(pair, { t: "pro", e: FUTURE });
		expect(await registerProExtension(fakeExtension(), key)).toBe(true);
		expect(isProExtensionActive()).toBe(true);
	});

	it("ACCEPTS a domainLESS license when the host is an empty string", async () => {
		const pair = await trustFreshKey();
		const key = await signLicense(pair, { t: "pro", e: FUTURE });
		expect(await registerProExtension(fakeExtension(), key, { host: "" })).toBe(true);
		expect(isProExtensionActive()).toBe(true);
	});

	it("ACCEPTS a genuinely signed pro license and registers tools + series", async () => {
		const pair = await trustFreshKey();
		const key = await signLicense(pair, { t: "pro", e: FUTURE });
		expect(await registerProExtension(fakeExtension(), key)).toBe(true);
		expect(isProExtensionActive()).toBe(true);
		expect(listDrawingTools().some((t) => String(t.name) === FAKE_TOOL_NAME)).toBe(true);
		expect(getSeries(FAKE_SERIES as never).tooltipEntry({} as never).label).toBe("S3A");
	});

	it("ACCEPTS a genuinely signed enterprise license and tolerates double register", async () => {
		const pair = await trustFreshKey();
		const key = await signLicense(pair, { t: "enterprise", e: FUTURE });
		expect(await registerProExtension(fakeExtension(), key)).toBe(true);
		expect(await registerProExtension(fakeExtension(), key)).toBe(true);
		expect(isProExtensionActive()).toBe(true);
		expect(listDrawingTools().filter((t) => String(t.name) === FAKE_TOOL_NAME)).toHaveLength(1);
	});

	it("ACCEPTS a pro license on a host its domain list covers", async () => {
		const pair = await trustFreshKey();
		const key = await signLicense(pair, { t: "pro", e: FUTURE, d: ["buyer.example"] });
		expect(await registerProExtension(fakeExtension(), key, { host: "buyer.example" })).toBe(
			true,
		);
		expect(isProExtensionActive()).toBe(true);
	});

	it("REJECTS a key signed by a key that was never registered", async () => {
		// Rotation hygiene: only keys in the active list verify.
		const rogue = await issueKeypair();
		const key = await signLicense(rogue.pair, { t: "pro", e: FUTURE });
		expect(await registerProExtension(fakeExtension(), key)).toBe(false);
		expect(isProExtensionActive()).toBe(false);
	});

	it("ACCEPTS after addLicensePublicKey rotation (old + new both valid)", async () => {
		const oldPair = await trustFreshKey();
		const rotated = await issueKeypair();
		addLicensePublicKey(rotated.pub as never);
		const newKey = await signLicense(rotated.pair, { t: "pro", e: FUTURE });
		const oldKey = await signLicense(oldPair, { t: "pro", e: FUTURE });
		expect(await registerProExtension(fakeExtension(), newKey)).toBe(true);
		resetProExtensionForTests();
		expect(await registerProExtension(fakeExtension(), oldKey)).toBe(true);
	});
});

/**
 * Run `fn` with a global property removed, then restore it EXACTLY.
 *
 * Restoring the descriptor rather than the value matters: jsdom installs
 * `location` as an accessor (`{get, set}`), so defining it back as a writable data
 * property silently downgrades it and leaves it downgraded for the rest of the
 * file. That was a real finding from the independent audit - the first version of
 * these tests did exactly that.
 *
 * The `try/finally` matters more: an `expect` that throws must still restore, or one
 * failing test silently rewrites the environment for every test after it.
 */
function fakeExtension(): ProExtensionModule {
	const tool = {
		name: FAKE_TOOL_NAME,
		createDraft: () => ({}),
		updateDraft: (d: unknown) => d,
	} as unknown as DrawingToolDefinition;
	return {
		drawingTools: [tool],
		series: [
			{
				type: FAKE_SERIES as unknown as SeriesTypeId,
				entry: {
					component: () => null,
					defaultParams: {},
					defaultYAxis: "right",
					tooltipEntry: () => ({
						label: "S3A",
						format: (v: number) => String(v),
						accessor: () => undefined,
					}),
				},
			},
		],
	};
}