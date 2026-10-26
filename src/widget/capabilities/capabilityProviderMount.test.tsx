import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ReactNode } from "react";
import type { Capability, PatTier } from "@vninvestcharts/engine-core";
import { CapabilityProvider, useCapabilityGate, useResolvedCapabilities } from "../components/CapabilityGate";
import { resolveCapabilities } from "./CapabilityResolver";

/**
 * S2 regression lock — `CapabilityProvider` thật sự được mount với tier thật.
 *
 * Trước S2: KHÔNG ai mount `CapabilityProvider`. `useResolvedCapabilities` rơi vào
 * fallback `tier: null` (CapabilityGate.tsx:74-76), và `null` resolve thành Community
 * ⇒ MỌI `useCapabilityGate` đọc `locked` ở MỌI tier, kể cả enterprise.
 *
 * Fail-closed nên không rò dữ liệu Pro, nhưng đó là **cổng chết**: nó chỉ biết
 * khoá, không biết mở. Test dưới đây khoá đúng hành vi đó — nếu provider rơi về
 * `tier: null` thì chúng đỏ.
 */

function Probe({ capability, onState }: { capability: Capability; onState: (s: string) => void }): ReactNode {
	const state = useCapabilityGate(capability);
	onState(state.state);
	return null;
}

/** Đọc state mà không cần render ra DOM (probe gọi callback trong render). */
function readState(
	tier: PatTier | null | undefined,
	capability: Capability,
	options?: { narrowing?: readonly Capability[] },
): string {
	let seen = "never-rendered";
	renderToStaticMarkup(
		<CapabilityProvider tier={tier} narrowing={options?.narrowing}>
			<Probe
				capability={capability}
				onState={(s) => {
					seen = s;
				}}
			/>
		</CapabilityProvider>,
	);
	return seen;
}

describe("S2: CapabilityProvider được mount với tier thật", () => {
	it("community capability granted ở mọi tier (kể cả null) — Community không bị đóng", () => {
		for (const tier of [null, undefined, "none", "free", "starter", "pro", "enterprise"] as const) {
			expect(readState(tier ?? null, "basic_chart"), `basic_chart @ ${String(tier)}`).toBe("granted");
		}
	});

	it("capability pro KHÔNG còn locked ở pro (trước S2 nó luôn locked)", () => {
		// Phép đo trực tiếp của gap S2: trước khi sửa, KHÔNG có provider ⇒ tier null ⇒
		// mọi cap đọc locked. Ở pro, `pine_editor` phải granted.
		expect(readState("pro", "pine_editor")).toBe("granted");
		expect(readState("pro", "alert_local")).toBe("granted");
		// enterprise: Track B mở, vì `server_workspace` là enterprise, không phải pro.
		expect(readState("enterprise", "server_workspace")).toBe("granted");
	});

	it("fail-closed: free/none vẫn locked mọi capability bán được", () => {
		for (const tier of [null, "none", "free", "starter"] as const) {
			for (const cap of ["pine_editor", "server_workspace", "dock_pro", "alert_local"] as Capability[]) {
				expect(readState(tier, cap), `${String(tier)} / ${cap}`).not.toBe("granted");
			}
		}
	});

	it("Track B (cần backend) vẫn chưa mở cho pro — chờ backend, không phải chờ quyền", () => {
		// pro KHÔNG có server_workspace trong `capabilitiesFor`, nên phải locked.
		// Điều này bảo vệ khỏi việc mount provider làm lộ Track B cho người mua Track A.
		expect(readState("pro", "server_workspace")).toBe("locked");
		expect(readState("enterprise", "server_workspace")).toBe("granted");
	});

	it("narrowing của license chỉ thu hẹp, không bao giờ mở thêm", () => {
		// Không có narrowing ⇒ granted.
		expect(readState("pro", "pine_editor")).toBe("granted");
		// License không liệt kê pine_editor ⇒ khoá, dù tier đủ.
		expect(readState("pro", "pine_editor", { narrowing: ["basic_chart"] })).toBe("locked");
		// License liệt kê ⇒ mở.
		expect(readState("pro", "pine_editor", { narrowing: ["pine_editor"] })).toBe("granted");
	});

	it("narrowing KHÔNG thể nâng quyền: cap bị thu hẹp vẫn locked ở enterprise", () => {
		const narrowed = resolveCapabilities({
			tier: "enterprise",
			narrowing: ["basic_chart", "common_indicators"],
		});
		expect(narrowed.server_workspace.state).toBe("locked");
		expect(narrowed.basic_chart.state).toBe("granted");
		// Giao với capabilitiesFor ⇒ tập con, không phải hợp.
		expect(narrowed.basic_chart.state === "granted").toBe(true);
	});
});

describe("S2: context không mount ⇒ fail-closed (không phải cấp quyền)", () => {
	it("useResolvedCapabilities ngoài provider trả tier=null và chỉ Community", () => {
		const box: { ctx: ReturnType<typeof useResolvedCapabilities> | null } = { ctx: null };
		function Capture() {
			box.ctx = useResolvedCapabilities();
			return null;
		}
		renderToStaticMarkup(<Capture />);
		expect(box.ctx?.tier).toBeNull();
		expect(box.ctx?.caps.pine_editor.state).toBe("locked");
		expect(box.ctx?.caps.basic_chart.state).toBe("granted");
	});
});

describe("RD-01 (DOCK_SSOT_B1): multi mount provider quanh WorkspaceRightDockSlot", () => {
	it("structural lock: provider 1 dòng bọc trực tiếp slot với tier={patTier}", () => {
		const source = readFileSync(path.resolve(__dirname, "../VNInvestMultiCharts.tsx"), "utf8");
		// Quy ước format (plan AC2, PLAN_AUDIT xác minh): provider viết 1 dòng
		// `<CapabilityProvider tier={patTier}>` ngay trước slot; props slot (:1736-1758)
		// KHÔNG chứa chuỗi `/>` nên lazy match dừng đúng ở thẻ đóng của slot.
		// Đổi format (vd `tier={patTier ?? "free"}`) phải cập nhật test này.
		expect(source).toMatch(
			/<CapabilityProvider tier=\{patTier\}>\s*<WorkspaceRightDockSlot[\s\S]*?\/>\s*<\/CapabilityProvider>/,
		);
	});
});
