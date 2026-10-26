import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { resetLicensePublicKey, setLicensePublicKey } from "@vninvestcharts/engine-core";
import { VNInvestMultiCharts } from "../VNInvestMultiCharts";
import { createAdapter, forkRuntimeData } from "./utils";

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const FUTURE = Math.floor(Date.now() / 1000) + 86400 * 30;

function b64url(bytes: Uint8Array): string {
	let s = "";
	bytes.forEach((b) => { s += String.fromCharCode(b); });
	return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function proLicense(): Promise<string> {
	const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
	const pub = (await subtle.exportKey("jwk", pair.publicKey)) as { x: string; y: string };
	setLicensePublicKey({ kty: "EC", crv: "P-256", x: pub.x, y: pub.y });
	const payload = new TextEncoder().encode(JSON.stringify({ t: "pro", e: FUTURE }));
	const sig = await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, payload);
	return `vni1.${b64url(payload)}.${b64url(new Uint8Array(sig))}`;
}

const CHARTS = [
	{ id: "c1", symbol: "HPG", timeframe: "1D" as const },
	{ id: "c2", symbol: "VIC", timeframe: "1D" as const },
	{ id: "c3", symbol: "FPT", timeframe: "1D" as const },
];

function renderMulti(extra: Record<string, unknown>) {
	const adapter = createAdapter(Promise.resolve(forkRuntimeData as never[]), "uiux-a5");
	return render(
		<VNInvestMultiCharts
			charts={CHARTS}
			layout={{ rows: 1, cols: 3 }}
			showBottomPanel={false}
			showRightDock={false}
			defaultChartProps={{ adapter: adapter as never, engineRuntime: "fork" }}
			{...extra}
		/>,
	);
}

function cellCount(): number {
	return document.querySelectorAll("[data-chart-id]").length;
}

describe("VNInvestMultiCharts tier provider (RD-09)", () => {
	beforeEach(() => {
		localStorage.clear();
		resetLicensePublicKey();
	});

	afterEach(() => {
		resetLicensePublicKey();
	});

	it("license Pro không cần host SaaSFeatureProvider -> 3 chart", async () => {
		const licenseKey = await proLicense();
		renderMulti({ licenseKey });
		await waitFor(() => expect(cellCount()).toBe(3));
	});

	it("control không license -> free cap 2", async () => {
		renderMulti({});
		await waitFor(() => expect(cellCount()).toBe(2));
	});
});
