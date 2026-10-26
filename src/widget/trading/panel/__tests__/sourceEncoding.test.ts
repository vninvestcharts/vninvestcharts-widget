// DOCK_SSOT_B2 — RD-12 byte lock: comment `ActiveChartPaperPanel.tsx:156-157` từng
// là mojibake (đo 2026-10-18: dòng 156 = 7×`?` + 1×U+FFFD + 1×U+001A; dòng 157 =
// 1×`?` + 4×U+FFFD; tổng file = 5×U+FFFD + 1×U+001A). Test đọc bytes thật của file
// nguồn (pattern debugTier.production.test.ts) để không tái phát khi ai đó sửa
// comment không đúng encoding.
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const PANEL_SOURCE = path.resolve(__dirname, "../ActiveChartPaperPanel.tsx");

describe("RD-12 source encoding lock (ActiveChartPaperPanel)", () => {
	it("không còn U+FFFD (replacement char) hay U+001A trong file nguồn", () => {
		const source = readFileSync(PANEL_SOURCE, "utf8");
		const fffd = source.split("\uFFFD").length - 1;
		const sub = source.split("\u001A").length - 1;
		expect({ fffd, sub }).toEqual({ fffd: 0, sub: 0 });
	});
});
