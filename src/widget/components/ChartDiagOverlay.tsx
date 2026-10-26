import { useState } from "react";

export interface ChartDiagSnapshot {
	enginePresent: boolean;
	forkEngineSet: boolean;
	isForkRuntime: boolean;
	bars: number;
	enriched: number;
	plot: number;
	panes: string;
	chartType: string;
	tier: string;
	dataError: string;
	engineRange: string;
	canvases: string;
	/** Engine-side scale domains per pane (NaN/garbage domain = render killer). */
	domains: string;
	/** Engine paneSpecs ids (empty = specs feed never fired = root cause). */
	specs: string;
	/** Non-finite OHLC scan over engine enrichedData (count + first bad index). */
	nanScan: string;
	/** Last bar close + date ISO (stale-data check). */
	lastBar: string;
}

const FLAG_QUERY = /(?:^\?|&)vnsc_diag=(1|true)\b/;
const FLAG_KEY = "vnsc_diag";

export function isDiagEnabled(): boolean {
	try {
		if (typeof window !== "undefined" && window.localStorage?.getItem(FLAG_KEY) === "1") return true;
		if (typeof window !== "undefined" && FLAG_QUERY.test(window.location.search)) return true;
	} catch {
		/* private mode — diag stays off */
	}
	return false;
}

/**
 * BLACKSCREEN-DIAG: query-gated runtime readout (?vnsc_diag=1 or localStorage).
 * Zero production impact: renders nothing unless the flag is set. Used to
 * capture exact engine/data/pane state from a black-screen browser.
 */
export function ChartDiagOverlay({ getSnapshot }: { getSnapshot: () => ChartDiagSnapshot }) {
	const [collapsed, setCollapsed] = useState(false);
	const [tick, setTick] = useState(0);
	if (!isDiagEnabled()) return null;
	let snap: ChartDiagSnapshot | null = null;
	try {
		snap = getSnapshot();
	} catch (e) {
		snap = null;
	}
	const rows: Array<[string, string]> = snap
		? [
			["engine", snap.enginePresent ? "present" : "MISSING"],
			["forkEngine", snap.forkEngineSet ? "set" : "NULL"],
			["runtime", snap.isForkRuntime ? "fork" : "legacy/other"],
			["bars/enriched/plot", `${snap.bars}/${snap.enriched}/${snap.plot}`],
			["panes", snap.panes],
			["chartType", snap.chartType],
			["tier", snap.tier],
			["dataError", snap.dataError],
			["engineRange", snap.engineRange],
			["canvases", snap.canvases],
			["domains", snap.domains],
			["specs", snap.specs],
			["nanScan", snap.nanScan],
			["lastBar", snap.lastBar],
		]
		: [["error", "snapshot-threw"]];
	return (
		<div
			data-testid="chart-diag-overlay"
			style={{
				position: "absolute",
				top: 8,
				right: 8,
				zIndex: 2000,
				background: "rgba(0,0,0,0.85)",
				color: "#7CFC98",
				fontFamily: "monospace",
				fontSize: 11,
				lineHeight: 1.5,
				padding: "8px 10px",
				borderRadius: 8,
				border: "1px solid #22c55e",
				maxWidth: 420,
				pointerEvents: "auto",
			}}
		>
			<div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: collapsed ? 0 : 4 }}>
				<strong>vnsc-diag</strong>
				<button type="button" onClick={() => setTick((v) => v + 1)} style={btnStyle} data-testid="diag-refresh">
					refresh
				</button>
				<button type="button" onClick={() => setCollapsed((v) => !v)} style={btnStyle}>
					{collapsed ? "show" : "hide"}
				</button>
			</div>
			{!collapsed && (
				<table>
					<tbody>
						{rows.map(([k, v]) => (
							<tr key={`${k}-${tick}`}>
								<td style={{ paddingRight: 8, opacity: 0.7 }}>{k}</td>
								<td style={{ overflowWrap: "anywhere" }}>{v}</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}

const btnStyle: React.CSSProperties = {
	background: "transparent",
	color: "inherit",
	border: "1px solid currentColor",
	borderRadius: 4,
	fontSize: 10,
	cursor: "pointer",
	padding: "1px 6px",
};
