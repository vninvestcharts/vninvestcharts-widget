/**
 * Sinh `src/lib/pinescript/parser.generated.js` từ `src/lib/pinescript/grammar.ts`.
 *
 * VÌ SAO generated lúc build thay vì `peggy.generate` lúc runtime: peggy 5 sinh
 * parser bằng `eval(ast.code.toString())` (node_modules/peggy/lib/compiler/index.js:151).
 * CSP production là `script-src 'self'` — không `unsafe-eval` (deploy/nginx-app.conf,
 * quyết định CS-7 F-13) — nên eval bị chặn, `parseScript` ném EvalError,
 * `registerPineScript` trả null và chart KHÔNG BAO GIỜ restore được script
 * (đo 2026-10-17 trên staging: verify-pine 5/13, PINE-04..08). File này chạy
 * NGOÀI browser (node/tsx) nên eval hợp lệ.
 *
 * Chạy: `npm run gen:pine-parser` — tự chạy qua pretype-check/pretest/prebuild/
 * prewatch/prebuild:docs/prebuild:iife.
 *
 * Output `.js` KHÔNG commit (xem .gitignore); type commit riêng ở
 * `parser.generated.d.ts`. Ghi file chỉ khi nội dung đổi để không phá watch.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import peggy from "peggy";

async function run() {
	const GRAMMAR_PATH = path.resolve(
		path.dirname(fileURLToPath(import.meta.url)),
		"../packages/vn-kline-widget-pro/src/pinescript/grammar.ts",
	);

	if (!fs.existsSync(GRAMMAR_PATH)) {
		console.log("[gen:pine-parser] skipped (vn-kline-widget-pro not present in open-core snapshot)");
		return;
	}

	const { GRAMMAR_SOURCE } = await import("../packages/vn-kline-widget-pro/src/pinescript/grammar");

	const OUT_PATH = path.resolve(
		path.dirname(fileURLToPath(import.meta.url)),
		"../packages/vn-kline-widget-pro/src/pinescript/parser.generated.js",
	);

	const HEADER = [
		"// @generated — DO NOT EDIT. Sinh từ packages/vn-kline-widget-pro/src/pinescript/grammar.ts",
		"// Tái sinh: npm run gen:pine-parser",
		"",
	].join("\n");

	const source = peggy.generate(GRAMMAR_SOURCE, { output: "source", format: "es" });
	const next = HEADER + source;

	let previous = null;
	try {
		previous = fs.readFileSync(OUT_PATH, "utf8");
	} catch {
		// chưa tồn tại — ghi lần đầu
	}

	if (previous === next) {
		console.log(`[gen:pine-parser] up-to-date (${next.length} chars)`);
	} else {
		fs.writeFileSync(OUT_PATH, next, "utf8");
		console.log(`[gen:pine-parser] wrote ${path.relative(process.cwd(), OUT_PATH)} (${next.length} chars)`);
	}
}

run().catch((err) => {
	console.error("[gen:pine-parser] failed:", err);
	process.exit(1);
});
