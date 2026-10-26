// DEV-ONLY LICENSE HOOK — the "it cannot ship" lock.
//
// The hook in SaaSFeatureContext.tsx exists so a browser harness can register a
// public key and mint a genuinely signed `vni1.*` license
// (scripts/verify-offline-license.cjs). It is the one function in the widget that
// decides which signature is trusted, so its absence from a production bundle is a
// SECURITY property, not a style preference: shipped, anyone could mint Pro for
// themselves.
//
// A unit test can only check the runtime condition, and the runtime condition is
// exactly what a bundler is free to keep. So this file also BUILDS the module the
// way the shipped bundles are built and reads the emitted bytes. The two bundle
// cases are deliberately paired:
//
//   development bundle -> symbol PRESENT   (proves the probe can see it at all)
//   production bundle  -> symbol ABSENT    (the actual claim)
//
// If the first ever fails, the second is meaningless, which is why neither may be
// deleted as "redundant".
//
// esbuild runs as a child process on purpose. The suite runs under jsdom, whose
// TextEncoder produces a foreign-realm Uint8Array and trips esbuild's startup
// invariant ("your JavaScript environment is broken") — see the failure this
// replaces. The CLI is the same binary `npm run build` uses, so the bytes read
// here are the bytes a real build would emit.
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { webcrypto } from "node:crypto";
// Node built-ins as real imports, not inline `require`. The inline form is what made the
// cleanup untestable: with no parameter to inject a failing filesystem through, the retry
// path could not be exercised and therefore could not go red.
import * as nodeFs from "node:fs";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

const MODULE_ENTRY = path.resolve(__dirname, "../SaaSFeatureContext.tsx");
const SYMBOL = "__VNI_DEV_LICENSE__";

/** Bare specifiers the module pulls in. They are not what is under test here. */
const EXTERNAL = [
	"react",
	"react-dom",
	"react/jsx-runtime",
	"@vninvestcharts/engine-core",
	"@vninvestcharts/engine-drawing",
	"@vninvestcharts/engine-react",
];

/* Run esbuild through its JS API in a child Node process rather than shelling out
   to the `esbuild` CLI shim.
 *
 * The CLI bin is a CommonJS wrapper that Node loads as a MODULE, and it accepts
 * the entry as an argument. That worked only because the local Node (24.14)
 * strips TypeScript types. On the CI runner, Node 22.23.3, every one of these
 * tests died with:
 *   SyntaxError: Invalid or unexpected token
 *     at Module._compile (node:internal/modules/cjs/loader:1713:18)
 * because Node tried to parse the `.ts` probe as CommonJS before esbuild ever
 * saw it. This suite has only ever run on the dev box.
 *
 * Driving the API from a child process keeps the isolation a subprocess gives
 * (a crashing bundle cannot take vitest with it) while removing the type-
 * stripping dependency, because esbuild — not Node — does the parsing.
 */
function runEsbuild(entry: string, opts: { minify: boolean; nodeEnv: string }): string {
	/* nodeEnv and the externals are passed through the ENVIRONMENT as JSON, not
	 * interpolated into the script source. Interpolating produced
	 *   define: { "process.env.NODE_ENV": "production" }
	 * where the inner quotes terminated the JS string, so esbuild received the
	 * literal identifier `production` and emitted `production==="production"` —
	 * which never folds, and the "production bundle does NOT contain the hook"
	 * test then failed on a bundle that still had the assignment.
	 * process.argv keeps every value a real string with real quotes. */
	const script = `
import { build } from "esbuild";
const opts = JSON.parse(process.env.VNSC_ESBUILD_OPTS);
const r = await build({
  entryPoints: [opts.entry],
  bundle: true, write: false, format: "esm", platform: "browser",
  minify: opts.minify,
  define: { "process.env.NODE_ENV": JSON.stringify(opts.nodeEnv) },
  external: opts.external,
});
process.stdout.write(r.outputFiles[0].text);
`;
	return execFileSync(process.execPath, ["--input-type=module", "--eval", script], {
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
		cwd: path.resolve(__dirname, "../../../.."),
		env: {
			...process.env,
			VNSC_ESBUILD_OPTS: JSON.stringify({
				entry,
				minify: opts.minify,
				nodeEnv: opts.nodeEnv,
				external: EXTERNAL,
			}),
		},
	});
}

/* ---- probe-file lifecycle ------------------------------------------------------
 *
 * These two functions are seams, not conveniences. `removeProbeDir` takes the
 * filesystem as a parameter precisely so a test can hand it one that throws EPERM and
 * prove the retry actually runs. Asserting "cleanup retries" without a way to make
 * cleanup fail is the vacuous-assertion shape this repo has already been bitten by seven
 * times over (SESSION_SUMMARY_2026-10-05.md:147-168).
 */

/** The filename the old implementation used, kept only to assert it never comes back. */
const PROBE_LEGACY_NAME = "__devLicenseHook.mutation-probe.ts";

/** A fresh directory under the OS temp dir - never inside the source tree. */
function mkdtempProbeDir(): string {
	return mkdtempSync(path.join(os.tmpdir(), "vnsc-licprobe-"));
}

/**
 * Remove the probe directory, retrying a few times against Windows lock contention.
 *
 * `fsImpl` is injected so the retry path is testable. Against the real filesystem this
 * is defensive only: the directory is in os.tmpdir(), which is not under version
 * control, so even a total cleanup failure cannot dirty the repo.
 */
function removeProbeDir(dir: string, fsImpl: Pick<typeof nodeFs, "rmSync">, attempts = 3): void {
	let lastError: unknown;
	for (let i = 0; i < attempts; i += 1) {
		try {
			fsImpl.rmSync(dir, { recursive: true, force: true });
			return;
		} catch (error) {
			lastError = error;
		}
	}
	// Deliberately not swallowed. The original bug hid here: the assertions had already
	// passed, so the test's substance was fine and only cleanup threw. Rethrowing from
	// one place, after the retries, keeps the failure attributable to cleanup.
	throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
	delete (globalThis as Record<string, unknown>)[SYMBOL];
});

describe("probe-file cleanup", () => {
	it("retries on a transient EPERM and then succeeds", () => {
		const dir = mkdtempProbeDir();
		// Control: the directory exists BEFORE the cleanup. Without this, the
		// `existsSync === false` assertion below would also pass for a directory that
		// was never created - the same vacuity trap.
		expect(existsSync(dir)).toBe(true);

		// The stub counts attempts but the REAL rmSync performs the final removal, so
		// the directory genuinely is gone when asserted. A mock-only version deleted
		// nothing, and the "still exists" check then passed for the wrong reason.
		const realRmSync = nodeFs.rmSync;
		const calls: Array<{ dir: string; opts: unknown }> = [];
		let attempt = 0;
		const rmSync = ((target: string, opts?: unknown) => {
			calls.push({ dir: target, opts });
			attempt += 1;
			if (attempt === 1) throw Object.assign(new Error("locked"), { code: "EPERM" });
			if (attempt === 2) throw Object.assign(new Error("locked again"), { code: "EBUSY" });
			return realRmSync(target as string, opts as { recursive: true; force: true });
		}) as unknown as typeof nodeFs.rmSync;

		removeProbeDir(dir, { rmSync });

		// 3 attempts: two failures, then success. Removing the retry loop makes this 1
		// and the first EPERM propagates instead.
		expect(calls).toHaveLength(3);
		expect(calls.every((c) => c.dir === dir)).toBe(true);
		expect(calls[0].opts).toMatchObject({ recursive: true, force: true });
		expect(existsSync(dir)).toBe(false);
	});

	it("surfaces the failure when every attempt fails", () => {
		const dir = mkdtempProbeDir();
		const rmSync = (() => {
			throw Object.assign(new Error("permanently locked"), { code: "EPERM" });
		}) as unknown as typeof nodeFs.rmSync;

		expect(() => removeProbeDir(dir, { rmSync }, 2)).toThrow(/permanently locked/);
		// Cleaned up explicitly. A test that cannot tidy up after a failed cleanup is
		// the original bug reproduced.
		nodeFs.rmSync(dir, { recursive: true, force: true });
	});

	it("creates the probe directory outside the source tree", () => {
		const dir = mkdtempProbeDir();
		expect(dir.startsWith(os.tmpdir())).toBe(true);
		expect(path.relative(process.cwd(), dir).startsWith("..")).toBe(true);
		nodeFs.rmSync(dir, { recursive: true, force: true });
	});
});

describe("dev-only license hook — production bundles", () => {
	it("development bundle CONTAINS the hook (the probe can see it)", () => {
		const code = runEsbuild(MODULE_ENTRY, { nodeEnv: "development", minify: true });
		expect(code).toContain(SYMBOL);
		expect(code).toContain("setLicensePublicKey");
	});

	it("production bundle does NOT contain the hook", () => {
		const code = runEsbuild(MODULE_ENTRY, { nodeEnv: "production", minify: true });
		expect(code).not.toContain(SYMBOL);
		// The assignment is the dangerous part; the function name alone is not, but a
		// bundle that still names it is a bundle worth a human look.
		expect(code).not.toContain("setLicensePublicKey");
	});

	it("production bundle: the condition is falsified even unminified", () => {
		// The shipped bundles are minified, and the minify pass is what removes the
		// branch entirely. Without minify the STRING survives inside a branch esbuild
		// has already folded to `false`. Asserting absence here would be a fabricated
		// pass, so this pins the honest, weaker guarantee instead: the assignment is
		// unreachable even when the string is still in the file.
		//
		// Text-coupled on purpose. "Unreachable" is a property of the emitted bytes, not
		// of the source, and a reformat by esbuild must fail loudly here for a human to
		// look rather than quietly turn this into a no-op.
		const code = runEsbuild(MODULE_ENTRY, { nodeEnv: "production", minify: false });
		expect(code).toContain(SYMBOL);
		expect(code).toMatch(/&&\s*false\s*\)\s*\{\s*globalThis\.__VNI_DEV_LICENSE__/);
	});

	it("MUTATION GUARD: a helper-wrapped condition survives minification", () => {
		// This is the regression the whole file exists for. Moving the same test into
		// a function — the "tidier" refactor — makes esbuild unable to fold it, and
		// the hook then ships. Proven here against a fixture so the guard is not a
		// comment claiming something nobody checked.
		const helper = `
			${EXTERNAL.map((s) => `import "${s}";`).join("\n")}
			function licenseDevHookEnabled() {
				return typeof process !== "undefined" && process.env.NODE_ENV !== "production";
			}
			if (licenseDevHookEnabled()) { globalThis.${SYMBOL} = { probe: 1 }; }
		`;
		// The probe lives in os.tmpdir(), NOT in this directory. Writing it here is what
		// made this test flaky: the `finally` below raised EPERM under full-suite
		// parallelism (docs/comm/COMM-2026-10-01/AUDIT_LINT_3e2a7c1.md:771-772), and a
		// cleanup that fails leaves an untracked file inside src/ - a dirty tree for
		// whoever runs it next (:816-819).
		//
		// The path was the source; the cleanup was the symptom. Only one writer exists
		// repo-wide, so "parallelism" never had an in-suite competitor for this file, and
		// whoever held the handle was outside the test process. A temp directory removes
		// the exposure instead of retrying against an unidentified lock holder.
		const dir = mkdtempProbeDir();
		const probePath = path.join(dir, "mutation-probe.ts");
		writeFileSync(probePath, helper, "utf8");
		try {
			const code = runEsbuild(probePath, { nodeEnv: "production", minify: true });
			expect(code).toContain(SYMBOL);
		} finally {
			removeProbeDir(dir, nodeFs);
		}
		// AC-3. The old version had NO assertion that the probe was gone, so deleting the
		// cleanup outright left this test green - the exact "probe asserts a weaker
		// property" failure recorded for AC-10 in SESSION_SUMMARY_2026-10-05.md:147-168.
		expect(existsSync(probePath)).toBe(false);
		expect(existsSync(path.join(__dirname, PROBE_LEGACY_NAME))).toBe(false);
	});
});

describe("dev-only license hook — runtime", () => {
	it("installs exactly one method under NODE_ENV=test", async () => {
		vi.stubEnv("NODE_ENV", "test");
		vi.resetModules();
		await import("../SaaSFeatureContext");
		const hook = (globalThis as Record<string, unknown>)[SYMBOL] as Record<string, unknown>;
		// A namespace that grows is a namespace that can grow into a bypass. The only
		// reason this exists is registering a public key.
		expect(Object.keys(hook)).toEqual(["setLicensePublicKey"]);
		expect(typeof hook.setLicensePublicKey).toBe("function");
	});

	it("installs nothing under NODE_ENV=production", async () => {
		vi.stubEnv("NODE_ENV", "production");
		vi.resetModules();
		await import("../SaaSFeatureContext");
		expect((globalThis as Record<string, unknown>)[SYMBOL]).toBeUndefined();
	});

	it("the hook really moves the engine trust anchor (no private key needed)", async () => {
		// Without this the hook could be a no-op stub and every E2E result would be an
		// artefact of the harness rather than evidence about the product.
		const { setLicensePublicKey, resetLicensePublicKey, verifyLicenseKey } = await import(
			"@vninvestcharts/engine-core"
		);
		const subtle = webcrypto.subtle as unknown as SubtleCrypto;
		const b64url = (bytes: Uint8Array) =>
			Buffer.from(bytes)
				.toString("base64")
				.replace(/\+/g, "-")
				.replace(/\//g, "_")
				.replace(/=+$/, "");

		resetLicensePublicKey();
		const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
			"sign",
			"verify",
		]);
		const pub = (await subtle.exportKey("jwk", pair.publicKey)) as { x: string; y: string };
		setLicensePublicKey({ kty: "EC", crv: "P-256", x: pub.x, y: pub.y });
		const payload = new TextEncoder().encode(
			JSON.stringify({ t: "pro", e: Math.floor(Date.now() / 1000) + 3600 }),
		);
		const sig = await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, payload);
		const key = `vni1.${b64url(payload)}.${b64url(new Uint8Array(sig))}`;

		expect((await verifyLicenseKey(key, { subtle }))?.tier).toBe("pro");
		// And the same key must stop working the moment the anchor moves back.
		resetLicensePublicKey();
		expect(await verifyLicenseKey(key, { subtle })).toBeNull();
	});
});
