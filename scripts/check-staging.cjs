#!/usr/bin/env node
/**
 * check-staging.cjs — Rule 17's mechanical half: prove the staging environment is reachable AND
 * is serving the commit under test, BEFORE anything claims to have been verified there.
 *
 * Why this exists: Rule 17 (AGENTS.md) mandates that all testing happens on the VPS staging
 * environment. Measured on 2026-10-16 while writing that rule, staging answered `health.json`
 * with commit `0aebf5e` while `dev` was 65 commits ahead, and `deploy/CHARTS-TEST.md` named a
 * third sha. Nothing failed: `docker ps` would have said "Up (healthy)". A mandate written only
 * as prose would have kept passing that way forever.
 *
 * So this gate refuses to trust the runbook, the container status, or any remembered sha. It asks
 * the environment, from outside, and compares the answer to the commit it was told to expect.
 *
 * Usage:
 *   node scripts/check-staging.cjs                     # expect HEAD to be served
 *   node scripts/check-staging.cjs --expect <sha>      # expect a specific commit
 *   node scripts/check-staging.cjs --url <origin>      # different staging host
 *   node scripts/check-staging.cjs --self-test         # negative proof, no network
 *
 * Exit: 0 staging reachable and serving the expected commit · 1 otherwise · 2 not verifiable.
 *
 * IPv4 is forced (`-4` semantics via `family: 4`). Staging had a link-local AAAA record
 * (`fe80::`) that has since been removed; on a host where it returns, an IPv6 attempt can hang
 * this gate for the full timeout and report "unreachable" for a reason that has nothing to do
 * with staging.
 */
const https = require("node:https");
const http = require("node:http");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_URL = process.env.STAGING_URL || "";
const TIMEOUT_MS = 20000;

function arg(flag, fallback) {
	const i = process.argv.indexOf(flag);
	return i === -1 ? fallback : process.argv[i + 1];
}

/** GET a URL and return { status, body }. Never throws; transport failures come back as status 0. */
function fetchStatus(url, { family = 4, timeoutMs = TIMEOUT_MS } = {}) {
	return new Promise((resolve) => {
		const lib = url.startsWith("https:") ? https : http;
		const req = lib.get(url, { family }, (res) => {
			let body = "";
			res.setEncoding("utf8");
			res.on("data", (c) => {
				body += c;
				if (body.length > 64 * 1024) req.destroy(); // health payloads are tiny
			});
			res.on("end", () => resolve({ status: res.statusCode || 0, body }));
		});
		req.setTimeout(timeoutMs, () => {
			req.destroy();
			resolve({ status: 0, body: "", error: `timeout after ${timeoutMs}ms` });
		});
		req.on("error", (e) => resolve({ status: 0, body: "", error: e.message }));
	});
}

/**
 * Decide. Pure: takes the two health answers plus the expected commit and returns
 * { ok, lines }. The self-test drives this directly, so the verdict logic is exercised without
 * a network and without this script testing itself.
 */
function judge({ healthStatus, healthBody, rootStatus, expected }) {
	const lines = [];
	if (healthStatus === 0) {
		lines.push(`FAIL  staging health.json unreachable (transport error)${healthBody.error ? `: ${healthBody.error}` : ""}`);
		return { ok: false, lines };
	}
	if (healthStatus !== 200) {
		lines.push(`FAIL  staging health.json returned HTTP ${healthStatus}, expected 200`);
		return { ok: false, lines };
	}
	let health;
	try {
		health = JSON.parse(healthBody);
	} catch {
		lines.push("FAIL  staging health.json is not JSON");
		return { ok: false, lines };
	}
	if (health.ok !== true) {
		lines.push(`FAIL  staging health.json reports ok=${health.ok}, expected true`);
		return { ok: false, lines };
	}
	if (rootStatus !== 200) {
		lines.push(`FAIL  staging root returned HTTP ${rootStatus}, expected 200`);
		return { ok: false, lines };
	}
	const served = String(health.commit || "");
	const short = (s) => (s || "").slice(0, 7);
	if (!served) {
		lines.push("FAIL  staging health.json carries no commit — cannot prove which code is served");
		return { ok: false, lines };
	}
	if (expected && !served.startsWith(expected.slice(0, 7)) && !expected.startsWith(served.slice(0, 7))) {
		lines.push(
			`FAIL  staging serves commit ${short(served)} but ${short(expected)} is under test.`,
		);
		lines.push(`      Staging must be redeployed before any result from it counts. Runbook: deploy/CHARTS-TEST.md section 3.`);
		return { ok: false, lines };
	}
	lines.push(`PASS  staging serves commit ${short(served)} (version ${health.version ?? "?"}) — this is the code under test`);
	return { ok: true, lines };
}

/* ------------------------------------------------------------------ self-test */

async function selfTest() {
	const results = [];
	const http = require("node:http");

	/** Serve one canned response, run the real gate against it, assert the verdict. */
	async function serveCase(name, respond, expectOk, expectFragment) {
		const server = http.createServer((req, r) => respond(req, r));
		await new Promise((res) => server.listen(0, "127.0.0.1", res));
		const { port } = server.address();
		const origin = `http://127.0.0.1:${port}`;
		try {
			const health = await fetchStatus(`${origin}/health.json`, { family: 4, timeoutMs: 5000 });
			const root = await fetchStatus(`${origin}/`, { family: 4, timeoutMs: 5000 });
			const verdict = judge({ healthStatus: health.status, healthBody: health.body, rootStatus: root.status, expected: "abcdef1234" });
			const ok = verdict.ok === expectOk && verdict.lines.join(" ").includes(expectFragment);
			results.push({ name, expectOk, gotOk: verdict.ok, verdict: ok ? "OK" : "BROKEN", first: verdict.lines[0] });
		} finally {
			await new Promise((res) => server.close(res));
		}
	}

	const good = (commit) => (req, res) => {
		if (req.url === "/health.json") {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify({ ok: true, version: "0.2.1", commit }));
		} else {
			res.writeHead(200).end("ok");
		}
	};

	await serveCase("serving the expected commit", good("abcdef1234567"), true, "PASS");
	await serveCase("serving a DIFFERENT commit", good("0aebf5ec9999"), false, "is under test");
	await serveCase("health.json 500", (req, res) => res.writeHead(500).end("boom"), false, "HTTP 500");
	await serveCase("health.json is not JSON", (req, res) => res.writeHead(200).end("<html>"), false, "not JSON");
	await serveCase("root 404 while health is fine", (req, res) => {
		if (req.url === "/health.json") {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify({ ok: true, version: "0.2.1", commit: "abcdef1234567" }));
		} else res.writeHead(404).end();
	}, false, "root returned HTTP 404");
	await serveCase("health.ok is false", (req, res) => {
		if (req.url === "/health.json") {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify({ ok: false, commit: "abcdef1234567" }));
		} else res.writeHead(200).end("ok");
	}, false, "reports ok=false");

	console.log("check-staging SELF-TEST");
	for (const r of results) {
		console.log(`  ${r.verdict.padEnd(7)} ${r.name}`);
		console.log(`          expect ok=${r.expectOk} got ok=${r.gotOk}`);
		console.log(`          ${r.first}`);
	}
	const broken = results.filter((r) => r.verdict === "BROKEN").length;
	console.log(`  ${results.length} case(s), ${broken} broken`);
	// A test that cannot reach a wrong answer has proven nothing (L-E06): verify the runner
	// itself still bites by asking for a verdict the stub cannot produce.
	console.log(broken ? "SELF-TEST FAILED" : "SELF-TEST PASS");
	process.exit(broken ? 1 : 0);
}

/* ---------------------------------------------------------------------- main */

if (process.argv.includes("--self-test")) {
	selfTest();
} else {
	(async () => {
		const url = arg("--url", process.env.STAGING_URL || DEFAULT_URL);
		if (!url) {
			console.log("check-staging: SKIP (no --url or STAGING_URL provided)");
			process.exit(2);
		}
		let expected = arg("--expect", process.env.EXPECT_COMMIT || "");
		if (!expected && !process.argv.includes("--expect")) {
			try {
				expected = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
			} catch {
				console.log("check-staging: SKIP (no git HEAD to compare against; pass --expect <sha>)");
				process.exit(2);
			}
		}
		const health = await fetchStatus(`${url}/health.json`);
		const root = await fetchStatus(`${url}/`);
		const verdict = judge({
			healthStatus: health.status,
			healthBody: health.body,
			rootStatus: root.status,
			expected,
		});
		console.log(`check-staging: ${url} · expecting ${(expected || "?").slice(0, 7)}`);
		for (const l of verdict.lines) console.log(`  ${l}`);
		process.exit(verdict.ok ? 0 : 1);
	})();
}