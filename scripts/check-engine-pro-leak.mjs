#!/usr/bin/env node
"use strict";
/* Rule 15 (S6): the public widget must not statically import @vninvestcharts/engine-pro.
 *
 * A static import of a package that does not exist makes a consumer's bundler
 * fail to build at all, so a Free-tier user gets a broken app rather than a
 * missing feature. That is the whole reason this gate exists.
 *
 * Why a script and not the grep it replaces: the grep matched inside COMMENTS.
 * src/widget/plugin/ProPluginRegistry.ts documents the intended usage —
 *
 *   * - Khách Pro tự `import { ProExtension } from "@vninvestcharts/engine-pro"`
 *
 * — and the gate failed the build on its own documentation, on a clean tree where
 * no such import exists. A gate that cannot tell a comment from code trains people
 * to delete the comment instead of fixing the gate, and the next real violation
 * then passes silently.
 *
 * It therefore strips comments before matching, and reports the exact line.
 *
 * Usage: node scripts/check-engine-pro-leak.mjs [--dir src]
 * Exit 0 = no static import. Exit 1 = at least one.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dirIdx = process.argv.indexOf("--dir");
const TARGET = path.resolve(ROOT, dirIdx >= 0 ? process.argv[dirIdx + 1] : "src");

/* Matches the import forms a bundler resolves statically:
 *   import ... from "@vninvestcharts/engine-pro"
 *   import "@vninvestcharts/engine-pro"
 *   require("@vninvestcharts/engine-pro")
 * A DYNAMIC import() is deliberately allowed: Rule 15 forbids a static import so
 * that a Free consumer's bundler does not try to resolve the module. A dynamic one
 * is the documented extension-loading path.
 */
const PATTERN =
	/(?:from\s*|import\s*|require\s*\(\s*)['"]@vninvestcharts\/engine-pro['"]/;

/** Remove line and block comments, preserving line numbering. */
function stripComments(src) {
	let out = "";
	let i = 0;
	const n = src.length;
	let state = "code"; // code | line | block | sq | dq | tpl
	while (i < n) {
		const c = src[i];
		const c2 = src[i + 1];
		if (state === "code") {
			if (c === "/" && c2 === "/") {
				state = "line";
				out += "  ";
				i += 2;
				continue;
			}
			if (c === "/" && c2 === "*") {
				state = "block";
				out += "  ";
				i += 2;
				continue;
			}
			if (c === "'") state = "sq";
			else if (c === '"') state = "dq";
			else if (c === "`") state = "tpl";
			out += c;
			i++;
			continue;
		}
		if (state === "line") {
			if (c === "\n") {
				state = "code";
				out += c;
			} else out += " ";
			i++;
			continue;
		}
		if (state === "block") {
			if (c === "*" && c2 === "/") {
				state = "code";
				out += "  ";
				i += 2;
				continue;
			}
			out += c === "\n" ? "\n" : " ";
			i++;
			continue;
		}
		/* inside a string or template: only an unescaped terminator ends it */
		if (c === "\\") {
			out += src.slice(i, i + 2);
			i += 2;
			continue;
		}
		if ((state === "sq" && c === "'") || (state === "dq" && c === '"') || (state === "tpl" && c === "`")) {
			state = "code";
		}
		out += c;
		i++;
	}
	return out;
}

function walk(dir, files = []) {
	if (!fs.existsSync(dir)) return files;
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) {
			if (e.name !== "node_modules" && e.name !== "dist") walk(p, files);
		} else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(e.name)) {
			files.push(p);
		}
	}
	return files;
}

const offenders = [];
const scanned = walk(TARGET);

for (const file of scanned) {
	const raw = fs.readFileSync(file, "utf8");
	const code = stripComments(raw);
	const lines = code.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		if (!PATTERN.test(lines[i])) continue;
		offenders.push({
			file: path.relative(ROOT, file).replace(/\\/g, "/"),
			line: i + 1,
			text: (raw.split(/\r?\n/)[i] || "").trim().slice(0, 120),
		});
	}
}

console.log(`check-engine-pro-leak: scanned ${scanned.length} file(s) under ${path.relative(ROOT, TARGET)}`);
if (offenders.length) {
	console.error(`\nFATAL: ${offenders.length} static @vninvestcharts/engine-pro import(s) in the public widget:`);
	for (const o of offenders) console.error(`  ${o.file}:${o.line}  ${o.text}`);
	console.error(
		"\nRule 15: a static import of a package that does not exist breaks a Free\n" +
			"consumer's bundler. Load it dynamically via registerProExtension instead.",
	);
	process.exit(1);
}
console.log("PASS: no static engine-pro import (comments excluded)");
process.exit(0);