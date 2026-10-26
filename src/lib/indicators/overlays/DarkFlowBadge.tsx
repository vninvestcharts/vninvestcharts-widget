/**
 * DarkFlowBadge — Slice H-04
 * Displays VNInvest dark flow strength (0–100) as a compact badge overlay
 * anchored to the top-right corner of the price pane.
 *
 * Strength tiers:
 *   0–29  → grey  (no signal)
 *  30–59  → amber (low/medium activity)
 *  60–79  → cyan  (elevated)
 *  80–100 → red   (strong dark flow)
 */

import type { DarkFlowSignalType } from "../../types/vninvest";

export interface DarkFlowBadgeProps {
	/** 0–100 composite strength score. */
	strength: number;
	/** Signal type label from detect_dark_flow. */
	signalType?: DarkFlowSignalType;
}

function strengthTier(v: number): { label: string; cssClass: string } {
	if (v >= 80) return { label: "Mạnh", cssClass: "gc-darkflow-badge--strong" };
	if (v >= 60) return { label: "Vừa", cssClass: "gc-darkflow-badge--mid" };
	if (v >= 30) return { label: "Thấp", cssClass: "gc-darkflow-badge--low" };
	return { label: "Yếu", cssClass: "gc-darkflow-badge--none" };
}

const SIGNAL_LABELS: Record<DarkFlowSignalType, string> = {
	none: "–",
	absorption: "HẤP THỤ",
	iceberg: "ICEBERG",
	twap_bot: "TWAP",
	mixed: "HỖN HỢP",
};

export function DarkFlowBadge({ strength, signalType = "none" }: DarkFlowBadgeProps): React.ReactNode {
	const tier = strengthTier(strength);
	const sigLabel = SIGNAL_LABELS[signalType] ?? signalType.toUpperCase();
	return (
		<div className={`gc-darkflow-badge ${tier.cssClass}`} title={`Dark Flow Strength: ${strength.toFixed(0)}`}>
			<span className="gc-darkflow-badge__label">Dark Flow</span>
			<span className="gc-darkflow-badge__strength">{strength.toFixed(0)}</span>
			<span className="gc-darkflow-badge__tier">{tier.label}</span>
			{signalType !== "none" && (
				<span className="gc-darkflow-badge__sig">{sigLabel}</span>
			)}
		</div>
	);
}
