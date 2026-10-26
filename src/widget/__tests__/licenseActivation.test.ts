import { webcrypto } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
	resetLicensePublicKey,
	setLicensePublicKey,
	verifyLicenseKey,
} from "@vninvestcharts/engine-core";

// LIC-ACTIVATION: widget tiêu thụ validator từ engine (alias src khi test,
// junction dist khi build) — khóa ký số mở Pro, prefix tự xưng về free.
const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const FUTURE = Math.floor(Date.now() / 1000) + 86400 * 30;

function b64url(bytes: Uint8Array): string {
	let s = "";
	bytes.forEach((b) => { s += String.fromCharCode(b); });
	return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

beforeEach(() => { resetLicensePublicKey(); });

describe("license activation (widget side)", () => {
	it("signed pro key verifies through the engine import", async () => {
		const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
		const pub = (await subtle.exportKey("jwk", pair.publicKey)) as { x: string; y: string };
		setLicensePublicKey({ kty: "EC", crv: "P-256", x: pub.x, y: pub.y });
		const payload = new TextEncoder().encode(JSON.stringify({ t: "pro", e: FUTURE }));
		const sig = await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, payload);
		const key = `vni1.${b64url(payload)}.${b64url(new Uint8Array(sig))}`;
		expect((await verifyLicenseKey(key, { subtle }))?.tier).toBe("pro");
	});

	it("self-asserted prefixes never activate", async () => {
		expect(await verifyLicenseKey("vni_pro_xxx", { subtle })).toBeNull();
		expect(await verifyLicenseKey("vni_enterprise_xxx", { subtle })).toBeNull();
	});
});
