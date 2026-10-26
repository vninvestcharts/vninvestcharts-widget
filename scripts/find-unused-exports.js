#!/usr/bin/env node
/**
 * find-unused-exports — gate phát hiện **export không có consumer**.
 *
 * VÌ SAO CẦN (W0.9): trong phiên audit Pro+ này, 3 khẳng định "dead code" đều
 * SAI, và cả 3 đều do **cùng một lỗi công cụ**: `Select-String` với glob `**`
 * của PowerShell không recurse đúng, nên grep trả về 0 kết quả cho file thực sự
 * ĐƯỢC import. `resolveEntitlement`, `PineScriptAdapter` và `PineCompiler` đều
 * đang sống và đã bị đề xuất xoá.
 *
 * Bài học: "không tìm thấy consumer" là kết luận về **công cụ**, không phải về
 * code. Muốn khẳng định dead code thì phải có công cụ đáng tin.
 *
 * CÁCH DÙNG
 *   node scripts/find-unused-exports.js            # báo cáo, exit 0
 *   node scripts/find-unused-exports.js --fail     # exit 1 nếu có mục mới
 *   node scripts/find-unused-exports.js --json     # máy đọc được
 *
 * `--fail` so với `allowlist` trong chính file này (baseline đã biết). Mục mới
 * ⇒ CI đỏ. Đừng xoá export: hoặc dùng nó, hoặc thêm vào allowlist kèm lý do.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SRC_DIRS = ["src", "packages", "scripts", "stories"];
const EXT = new Set([".ts", ".tsx", ".js", ".jsx"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "coverage", ".git", "vendor"]);

/**
 * Export đã biết là chưa dùng. Mỗi mục PHẢI kèm lý do — entry này là một
 * cam kết, không phải thùng rác. Mục không có lý do sẽ bị từ chối khi review.
 */
const ALLOWLIST = new Map([
	["src/widget/VNInvestChartsProps.ts:debugTier", "W0.5 test/demo escape hatch; không phải API công khai"],
	["src/widget/workspace/WorkspaceStore.ts:WorkspaceStoreError.code", "đọc qua instanceof + .code trong test và UI sắp tới"],
]);

function walk(dir, out) {
	let entries;
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const e of entries) {
		if (e.name.startsWith(".") && e.name !== ".") continue;
		const full = path.join(dir, e.name);
		if (e.isDirectory()) {
			if (SKIP_DIRS.has(e.name)) continue;
			walk(full, out);
		} else if (EXT.has(path.extname(e.name))) {
			out.push(full);
		}
	}
	return out;
}

/** Tên export được khai báo trong file (heuristic có chủ đích, đủ cho gate). */
function collectExports(file, rel, text) {
	const names = new Set();
	// export const/function/class/let + `as` alias
	for (const m of text.matchAll(
		/^export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function|class|abstract\s+class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm,
	)) {
		names.add(m[1]);
	}
	// export { a, b as c }
	for (const m of text.matchAll(/^export\s*\{([^}]*)\}/gm)) {
		for (const part of m[1].split(",")) {
			const piece = part.trim();
			if (!piece) continue;
			const asMatch = piece.match(/\bas\s+([A-Za-z_$][\w$]*)$/);
			names.add(asMatch ? asMatch[1] : piece.replace(/^type\s+/, ""));
		}
	}
	// export type { A } — cùng xử lý như trên (đã gộp)
	const out = [];
	for (const n of names) {
		if (isTestFile(rel) || isPublicEntry(rel)) continue;
		out.push(`${rel}:${n}`);
	}
	return out;
}

function isTestFile(rel) {
	return /\.test\.[jt]sx?$/.test(rel) || rel.includes("__tests__");
}

/**
 * Barrel / entry point của package: export ở đây **rất dễ bị** hiểu là ai đó "consumer
 * ngoài", nên không cần consumer trong repo. Không loại trừ mọi re-export trong
 * `src/drawing-shim.ts` — điều đó báo sai (149 mục trước khi loại).
 * Xem CLAUDE.md: public API đi qua `src/public-api.ts` + package exports.
 * `src/index.ts` đã bị gỡ (2026-10-16): nó không phải build entry và không được publish, nên
 * coi nó là public entry chỉ là khiến công cụ này im lặng về một bề mặt không tồn tại.
 */
function isPublicEntry(rel) {
	return (
		rel === "src/public-api.ts" ||
		rel === "src/drawing-shim.ts" ||
		rel.endsWith("/index.ts") ||
		rel.endsWith("/index.tsx")
	);
}

function main() {
	const files = [];
	for (const d of SRC_DIRS) walk(path.join(ROOT, d), files);

	// Nội dung file, và map identifier -> file (chỉ để tìm nơi khai báo).
	const texts = new Map();
	const declaredIn = new Map();
	const relOf = new Map();
	for (const f of files) {
		const rel = path.relative(ROOT, f).split(path.sep).join("/");
		const text = fs.readFileSync(f, "utf8");
		texts.set(rel, text);
		relOf.set(f, rel);
	}

	const allExports = [];
	for (const [rel, text] of texts) allExports.push(...collectExports(rel, rel, text));

	// Hợp nhất tên export trùng nhau: một identifier có thể khai ở nhiều nơi
	// (re-export). Chỉ báo nếu KHÔNG nơi nào được dùng.
	const byName = new Map();
	for (const key of allExports) {
		const idx = key.lastIndexOf(":");
		const name = key.slice(idx + 1);
		if (!byName.has(name)) byName.set(name, []);
		byName.get(name).push(key);
	}

	const used = new Set();
	for (const text of texts.values()) {
		for (const m of text.matchAll(/([A-Za-z_$][\w$]*)/g)) used.add(m[1]);
	}

	const unused = [];
	for (const [name, keys] of byName) {
		// Đếm số lần xuất hiện ngoài chính dòng khai báo.
		let refs = 0;
		for (const [rel, text] of texts) {
			const occurrences = (text.match(new RegExp(`\\b${name.replace(/[$]/g, "\\$")}\\b`, "g")) || []).length;
			const isDeclFile = keys.some((k) => k.startsWith(`${rel}:`));
			refs += isDeclFile ? Math.max(0, occurrences - 1) : occurrences;
		}
		if (refs === 0) {
			for (const key of keys) {
				if (ALLOWLIST.has(key)) continue;
				unused.push({ key, declaredIn: key.split(":")[0] });
			}
		}
	}

	unused.sort((a, b) => a.key.localeCompare(b.key));

	if (process.argv.includes("--json")) {
		console.log(JSON.stringify({ unused, allowlisted: [...ALLOWLIST.keys()] }, null, 2));
	} else {
		console.log(`scanned ${files.length} files, ${byName.size} exported names`);
		console.log(`allowlist: ${ALLOWLIST.size} entries`);
		if (unused.length === 0) {
			console.log("no unused exports found");
		} else {
			console.log(`\n${unused.length} export(s) with no consumer:\n`);
			for (const u of unused) console.log(`  ${u.key}   (${u.declaredIn})`);
			console.log(
				"\nTrước khi xoá: xác minh bằng công cụ đáng tin (grep -rn, IDE, hoặc" +
					"\nchính script này). Nếu thật sự chưa dùng: xoá, hoặc thêm vào" +
					"\nALLOWLIST trong scripts/find-unused-exports.js kèm lý do.",
			);
		}
	}

	if (process.argv.includes("--fail") && unused.length > 0) process.exit(1);
}

main();
