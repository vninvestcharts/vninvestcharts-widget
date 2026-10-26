/**
 * Copy Monaco AMD assets (`monaco-editor/min/vs`) vào `build/monaco/vs` để demo
 * tự host — `@monaco-editor/react` loader mặc định kéo `https://cdn.jsdelivr.net`
 * và CSP production `script-src 'self'` chặn (đo 2026-10-17: PINE-10/11/13 fail).
 *
 * VÌ SAO post-build script thay vì copy-webpack-plugin:
 *   - không thêm devDependency mới;
 *   - `webpack output.clean: true` xoá `build/` TRƯỚC emit, nên thứ tự bắt buộc:
 *     `build:docs` = webpack && copy:monaco; `watch` = clean && copy:monaco && webpack serve
 *     (webpack-dev-server giữ output trong memfs, không đụng đĩa thật).
 *
 * Idempotent: có stamp version — chỉ copy lại khi monaco-editor đổi version
 * hoặc thiếu file.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "node_modules", "monaco-editor", "min", "vs");
const DEST = path.join(ROOT, "build", "monaco", "vs");
const STAMP = path.join(ROOT, "build", "monaco", ".monaco-version");

if (!fs.existsSync(path.join(SRC, "loader.js"))) {
	console.error(`[copy-monaco] FAIL: ${SRC}\\loader.js not found — is monaco-editor installed?`);
	process.exit(1);
}

const version = JSON.parse(
	fs.readFileSync(path.join(ROOT, "node_modules", "monaco-editor", "package.json"), "utf8"),
).version;

let stampOk = false;
try {
	stampOk = fs.readFileSync(STAMP, "utf8").trim() === version;
} catch {
	// chưa có stamp — copy lần đầu
}

if (stampOk && fs.existsSync(path.join(DEST, "loader.js"))) {
	console.log(`[copy-monaco] up-to-date (monaco-editor ${version})`);
} else {
	fs.mkdirSync(path.dirname(STAMP), { recursive: true });
	fs.rmSync(DEST, { recursive: true, force: true });
	fs.cpSync(SRC, DEST, { recursive: true });
	fs.writeFileSync(STAMP, version);
	console.log(`[copy-monaco] copied monaco-editor ${version} -> build/monaco/vs`);

	// Tên asset worker có hash đổi mỗi lần build monaco (`editor.worker-Be8ye1pW.js`).
	// Monaco mặc định bọc asset trong blob wrapper (`URL.createObjectURL(new Blob([
	// "importScripts(...)"]))`) — blob worker bị CSP `script-src 'self'` chặn vì
	// `worker-src` fallback (đo 2026-10-17, PINE-13). Widget override
	// `MonacoEnvironment.getWorker` để trả Worker trực tiếp (xem monacoPaths.ts);
	// hook đó cần tên ỔN ĐỊNH nên ở đây tạo alias cùng thư mục assets/.
	const assetsDir = path.join(DEST, "assets");
	for (const file of fs.readdirSync(assetsDir)) {
		const m = /^(editor|json|css|html|ts)\.worker-[^/]+\.js$/.exec(file);
		if (m) {
			fs.copyFileSync(path.join(assetsDir, file), path.join(assetsDir, `${m[1]}.worker.js`));
			console.log(`[copy-monaco] aliased ${file} -> ${m[1]}.worker.js`);
		}
	}
}
