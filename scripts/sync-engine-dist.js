#!/usr/bin/env node
/**
 * sync-engine-dist — copy `dist/` từ repo engine sang `node_modules` của widget.
 *
 * VÌ SAO CẦN (đã cắn ta ít nhất 1 lần trong phiên Pro+):
 * Widget liên kết engine bằng `file:`. Ở workspace này npm tạo **bản copy**, KHÔNG
 * phải junction ⇒ đổi source engine rồi build không tự lan sang widget. Nếu quên,
 * type-check và test chạy với **engine cũ** và mọi sửa đổi trông như "không có tác
 * dụng".
 *
 * ⚠️ BẪM THƯỜNG GẶP: `cp` bằng wildcard + `-Recurse` **không ghi đè** file đã tồn
 * tại — lệnh báo "synced" nhưng `.d.ts` vẫn là bản cũ. Script này xoá đích trước
 * rồi copy lại, và **verify** nội dung sau khi copy.
 *
 * Dùng:
 *   node scripts/sync-engine-dist.js           # copy 4 package (3 engine + widget-pro)
 *   node scripts/sync-engine-dist.js --check   # chỉ kiểm tra, không copy (exit 1 nếu lệch)
 *
 * Tự kiểm (W-06, 2026-10-09 — chạy với VN_ENGINE_REPO=<tmp>, KHÔNG đụng dist thật):
 *   1. tmp = copy node_modules dist của cả 3 package; sửa đúng 1 file non-sentinel
 *      (sentinel index.d.ts giữ nguyên) → `--check` in DRIFT.
 *   2. Trước fix: exit 0 (BUG — `changed` không cộng vào `drift`). Sau fix: exit 1.
 *   3. Trên cây thật: `npm run check:engine-dist` vẫn exit 0.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const ENGINE = process.env.VN_ENGINE_REPO
	? path.resolve(process.env.VN_ENGINE_REPO)
	: path.resolve(ROOT, "..", "vninvestcharts-engine");

const PACKAGES = [
	["engine-core", "vn-kline-engine-core"],
	["engine-react", "vn-kline-engine-react"],
	["engine-drawing", "vn-kline-engine-drawing"],
	// P2.5: widget-pro dist is ALSO synced (dts build resolves it from
	// node_modules — source lives outside the dts rootDir, so the alias to
	// source would break `tsc -p tsconfig.dts.json` with TS6059).
	// Source is local (monorepo package), not the engine repo: [pkg, dir, base].
	["widget-pro", "vn-kline-widget-pro", "local"],
];

/** File phải khớp để coi là đã sync — nếu không có, cảnh báo chứ không im lặng. */
const SENTINEL = "index.d.ts";

function listFiles(dir, base = dir, out = []) {
	let entries;
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const e of entries) {
		const full = path.join(dir, e.name);
		if (e.isDirectory()) listFiles(full, base, out);
		else out.push(path.relative(base, full).split(path.sep).join("/"));
	}
	return out;
}

function sameContent(a, b) {
	try {
		const sa = fs.readFileSync(a);
		const sb = fs.readFileSync(b);
		return sa.length === sb.length && sa.equals(sb);
	} catch {
		return false;
	}
}

const checkOnly = process.argv.includes("--check");
const results = [];
let drift = 0;

for (const [pkgName, enginePkg, scope] of PACKAGES) {
	const pkgDir = path.join(scope === "local" ? ROOT : ENGINE, "packages", enginePkg);
	const src = path.join(pkgDir, "dist");
	const dst = path.join(ROOT, "node_modules", "@vninvestcharts", pkgName, "dist");
	// package.json must exist in node_modules for types/main resolution.
	// Engine entries pre-date this script (npm-installed once); widget-pro
	// never was — copy it on sync, verify it on --check.
	const pkgJsonSrc = path.join(pkgDir, "package.json");
	const pkgJsonDst = path.join(ROOT, "node_modules", "@vninvestcharts", pkgName, "package.json");

	if (!fs.existsSync(src)) {
		console.error(`SKIP ${pkgName}: không thấy ${src}`);
		console.error(`      Cần build engine trước: cd "${ENGINE}" && npm run build`);
		drift += 1;
		continue;
	}
	if (!fs.existsSync(dst)) {
		if (checkOnly) {
			console.error(`DRIFT ${pkgName}: chưa có dist trong node_modules`);
			drift += 1;
			continue;
		}
		fs.mkdirSync(dst, { recursive: true });
	}

	const files = listFiles(src);
	if (files.length === 0) {
		console.error(`SKIP ${pkgName}: dist rỗng — build engine trước (Rule 13)`);
		drift += 1;
		continue;
	}

	// package.json travels with dist (absent for never-installed packages).
	if (!sameContent(pkgJsonSrc, pkgJsonDst)) {
		if (checkOnly) {
			console.error(`DRIFT ${pkgName}: package.json lệch`);
			drift += 1;
		} else {
			fs.mkdirSync(path.dirname(pkgJsonDst), { recursive: true });
			fs.copyFileSync(pkgJsonSrc, `${pkgJsonDst}.tmp-sync`);
			fs.renameSync(`${pkgJsonDst}.tmp-sync`, pkgJsonDst);
			console.log(`synced    ${pkgName.padEnd(14)} package.json`);
		}
	}

	let changed = 0;
	for (const rel of files) {
		const from = path.join(src, rel);
		const to = path.join(dst, rel);
		if (sameContent(from, to)) continue;
		changed += 1;
		if (!checkOnly) {
			fs.mkdirSync(path.dirname(to), { recursive: true });
			// Ghi vào file tạm rồi đổi tên: tránh để lại file nửa vời nếu bị gián đoạn.
			fs.copyFileSync(from, `${to}.tmp-sync`);
			fs.renameSync(`${to}.tmp-sync`, to);
		}
	}

	// Verify: sentinel phải khớp sau khi copy.
	const sentinelOk = sameContent(path.join(src, SENTINEL), path.join(dst, SENTINEL));
	if (!sentinelOk) drift += 1;
	// W-06: drift ở file non-sentinel cũng phải lật exit code ở chế độ --check.
	// Trước đây chỉ `sentinelOk` cộng vào `drift`, nên `--check` in DRIFT mà vẫn exit 0.
	// Supervisor refinement (Stage 6): `.map` là packaging noise — npm publish strip
	// chúng nên mọi fresh install đều "lệch" mà code vẫn khớp. Đếm chúng vào changed
	// (báo cáo trung thực) nhưng không lật exit code; chỉ code drift mới đỏ gate.
	const codeChanged = checkOnly
		? files.filter(
				(rel) => !rel.endsWith(".map") && !sameContent(path.join(src, rel), path.join(dst, rel)),
			).length
		: 0;
	if (checkOnly && codeChanged > 0) drift += 1;
	results.push({ pkgName, files: files.length, changed, sentinelOk });

	const mapOnly = checkOnly && changed > 0 && codeChanged === 0;
	const verb = checkOnly
		? codeChanged > 0
			? "DRIFT"
			: "OK"
		: changed > 0
			? "synced"
			: "up-to-date";
	console.log(
		`${verb.padEnd(11)} ${pkgName.padEnd(14)} ${files.length} files` +
			(changed > 0 ? `, ${changed} changed` : "") +
			(mapOnly ? " (.map only — packaging noise, not code drift)" : "") +
			(sentinelOk ? "" : `  ⚠ sentinel ${SENTINEL} KHÔNG khớp`),
	);
}

if (checkOnly && drift > 0) {
	console.error(`\n${drift} package lệch. Chạy: node scripts/sync-engine-dist.js`);
	process.exit(1);
}
if (!checkOnly) {
	const total = results.reduce((n, r) => n + r.changed, 0);
	console.log(`\ntotal: ${total} file changed across ${results.length} package(s)`);
}
