// Bug user report 2026-10-18: trong layout multi, `.workspaceDock` (z-index 20)
// nằm dưới `BottomPanelHost` (inline z-index 40) trong CÙNG stacking context
// `.workspaceBody` (z-index 10, không phải context trung gian: `.workspaceMainCol`
// là flex/static không z) → khi bottom panel mở, nửa dưới right dock bị vẽ đè,
// hover/bấm không tới (ảnh user: dock bị cắt tại mép panel).
//
// Invariant khóa: z-index hiệu dụng `.workspaceDock` PHẢI > z-index bottom panel
// (`--vnsc-z-bottom-panel` = 40). Mirror single: dock host desktop z 48
// (`right-sidebar-dock.module.css:10`, token `--vnsc-z-sidebar`) > 40.
//
// jsdom không tính layout/stacking → lock ở mức nguồn CSS (pattern
// `tokensResolveInShadow.test.ts`: đọc file gốc, assert thứ quan sát được).
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const STYLES_DIR = path.resolve(__dirname, "..");

function readCss(relativePath: string): string {
	return fs.readFileSync(path.join(STYLES_DIR, relativePath), "utf8");
}

function stripComments(css: string): string {
	return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Body của rule mà selector của nó khớp CHÍNH XÁC (không ::before / * / Pinned). */
function ruleBody(css: string, selector: string): string {
	const clean = stripComments(css);
	const index = clean.indexOf(`${selector} {`);
	if (index === -1) throw new Error(`Không tìm thấy rule ${selector}`);
	const bodyStart = index + selector.length + 1;
	return clean.slice(bodyStart, clean.indexOf("}", bodyStart));
}

/** Giá trị số của token `--name: <n>;` trong file tokens. */
function tokenNumber(tokensCss: string, name: string): number {
	const match = new RegExp(`${name}\\s*:\\s*(\\d+)\\s*;`).exec(tokensCss);
	if (!match) throw new Error(`Không tìm thấy token ${name}`);
	return Number(match[1]);
}

describe("workspace dock z-order (multi) — dock PHẢI nổi trên bottom panel", () => {
	const tokens = readCss("tokens/z-index.css");
	// DOCK_SSOT_B3: rule `.workspaceDock*` đã dời sang right-dock-rail.module.css.
	const layout = readCss("right-dock-rail.module.css");

	it("z-index desktop .workspaceDock dùng token sidebar và > --vnsc-z-bottom-panel", () => {
		const body = ruleBody(layout, ".workspaceDock");
		const decl = /z-index\s*:\s*([^;]+);/.exec(body)?.[1]?.trim();
		expect(decl, ".workspaceDock phải khai báo z-index").toBeTruthy();

		const ref = /var\((--[a-z0-9-]+),\s*(\d+)\)/i.exec(decl ?? "");
		expect(ref, `z-index phải dạng var(<token>, <fallback>), nhận: ${decl}`).not.toBeNull();

		const zDock = tokenNumber(tokens, ref![1]);
		const fallback = Number(ref![2]);
		const zBottomPanel = tokenNumber(tokens, "--vnsc-z-bottom-panel");

		expect(fallback, "fallback phải trung thực với token").toBe(zDock);
		expect(zDock).toBeGreaterThan(zBottomPanel);
	});

	it("mobile vẫn giữ z-index 20 (C7/A12 — không đổi hành vi bottomsheet)", () => {
		const mediaStart = layout.indexOf("@media (max-width: 767px)");
		expect(mediaStart).toBeGreaterThan(-1);
		const body = ruleBody(layout.slice(mediaStart), ".workspaceDock");
		expect(/z-index\s*:\s*20\s*;/.test(body)).toBe(true);
	});
});
