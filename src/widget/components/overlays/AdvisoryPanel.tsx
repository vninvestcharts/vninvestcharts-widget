/**
 * WE2 P3a-03: AdvisoryPanel (moved from src/lib/advisory/AdvisoryPanel.tsx)
 *
 * Pure-presentational panel displaying AI advisory session results.
 * Data is fetched externally (demo shell → VNInvestClient) and passed
 * via props so this component has zero API dependency (testable).
 * All text goes through useWidgetI18n().t() — no hardcoded Vietnamese.
 *
 * Layout: vertical card — decision badge + confidence + 4 agent rows + explanation.
 */

import { useState } from "react";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import type {
	AdvisoryDecision,
	AdvisoryResult,
	AdvisorySessionV2,
	AgentScore,
} from "../../../lib/types/vninvest";
import styles from "../../styles/advisory-panel.module.css";

// ── Constants ─────────────────────────────────────────────────────────────────

const DECISION_STYLES: Record<AdvisoryDecision, { bg: string; color: string }> = {
	STRONG_BUY: { bg: "#0d6b2e", color: "#ffffff" },
	BUY: { bg: "#22a85e", color: "#ffffff" },
	HOLD: { bg: "#6c757d", color: "#ffffff" },
	SELL: { bg: "#e67e22", color: "#ffffff" },
	STRONG_SELL: { bg: "#c0392b", color: "#ffffff" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreToPercent(score: number): number {
	return Math.round((score + 100) / 2);
}

function scoreBarColor(score: number): string {
	if (score > 30) return "#22a85e";
	if (score < -30) return "#c0392b";
	return "#6c757d";
}

function formatWeight(w: number): string {
	return `${Math.round(w * 100)}%`;
}

function formatConfidence(c: number): string {
	return `${Math.round(c * 100)}%`;
}

function formatTimestamp(iso: string): string {
	try {
		return new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
	} catch {
		return iso;
	}
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface AgentRowProps {
	agent: AgentScore;
	isExpanded: boolean;
	onToggle: () => void;
}

function AgentRow({ agent, isExpanded, onToggle }: AgentRowProps) {
	const { t } = useWidgetI18n();
	const pct = scoreToPercent(agent.score);
	const barColor = scoreBarColor(agent.score);

	const decisionKey = `advisory.decision.${agent.signal}`;
	const decisionLabel = t(decisionKey);
	const agentKey = `advisory.agent.${agent.name}`;
	const label = t(agentKey);

	return (
		<div
			style={{
				borderBottom: "1px solid #2a2a2a",
				paddingBottom: "8px",
				marginBottom: "8px",
			}}
		>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: "8px",
					cursor: "pointer",
					userSelect: "none",
				}}
				onClick={onToggle}
				title={isExpanded ? t("advisory.collapse") : t("advisory.expand")}
			>
				<span style={{ flex: 1, fontSize: "12px", color: "#c0c0c0", fontWeight: 500 }}>
					{label}
					<span style={{ color: "#707070", fontSize: "11px", marginLeft: "4px" }}>
						({formatWeight(agent.weight)})
					</span>
				</span>
				<span
					style={{
						fontSize: "10px",
						fontWeight: 700,
						padding: "2px 6px",
						borderRadius: "4px",
						background: "#6c757d",
						color: "#ffffff",
						letterSpacing: "0.5px",
					}}
				>
					{decisionLabel}
				</span>
				<span style={{ color: "#707070", fontSize: "10px" }}>
					{isExpanded ? "▲" : "▼"}
				</span>
			</div>

			<div
				style={{
					height: "4px",
					background: "#2a2a2a",
					borderRadius: "2px",
					marginTop: "6px",
					overflow: "hidden",
				}}
			>
				<div
					style={{
						height: "100%",
						width: `${pct}%`,
						background: barColor,
						borderRadius: "2px",
						transition: "width 0.3s ease",
					}}
				/>
			</div>

			{isExpanded && agent.explanation ? (
				<div
					style={{
						marginTop: "8px",
						fontSize: "11px",
						color: "#b0b0b0",
						lineHeight: "1.5",
						whiteSpace: "pre-wrap",
						wordBreak: "break-word",
					}}
				>
					{agent.explanation}
				</div>
			) : null}
		</div>
	);
}

// ── Native session view (follow-up advisory V2) ───────────────────────────────

interface SessionViewProps {
	session: AdvisorySessionV2;
	isLoading: boolean;
	symbol?: string;
	onRefresh?: () => void;
	onClose?: () => void;
}

function SessionView({ session, isLoading, symbol, onRefresh, onClose }: SessionViewProps) {
	const { t } = useWidgetI18n();
	const decision = session.aggregate?.decision ?? null;
	const summary = session.executive_summary;

	return (
		<div className={styles.panel} data-testid="advisory-panel">
			<div className={styles.header}>
				<span className={styles.title}>
					{t("advisory.title")}{symbol ? ` — ${symbol}` : ""}
				</span>
				<div className={styles.headerActions}>
					{onRefresh ? (
						<button
							onClick={onRefresh}
							disabled={isLoading}
							title={t("advisory.refresh")}
							className={styles.refreshBtn}
						>
							↻
						</button>
					) : null}
					{onClose ? (
						<button
							onClick={onClose}
							title={t("advisory.close")}
							className={styles.closeBtn}
						>
							×
						</button>
					) : null}
				</div>
			</div>

			<div className={styles.body}>
				{isLoading ? (
					<>
						<SkeletonRow />
						<SkeletonRow />
					</>
				) : session.queued ? (
					<div className={styles.emptyState} data-testid="advisory-queued">
						<div className={styles.emptyIcon}>⏳</div>
						{t("advisory.queued")}
						{session.message ? <div style={{ fontSize: "11px" }}>{session.message}</div> : null}
					</div>
				) : !decision && !summary ? (
					<div className={styles.emptyState} data-testid="advisory-empty">
						<div className={styles.emptyIcon}>🤖</div>
						{session.message || t("advisory.empty")}
					</div>
				) : (
					<>
						{decision ? (
							<div className={styles.decisionBadge}>
								<div className={styles.decisionLabel} data-testid="advisory-decision">
									{(decision.action ?? "—").toUpperCase()}
								</div>
								<div className={styles.confidence}>
									<div className={styles.confidenceLabel}>
										{t("advisory.risk")}: {decision.risk ?? "—"}
									</div>
									<div className={styles.confidenceValue}>
										{t("advisory.score")}: {decision.score ?? "—"}
									</div>
								</div>
							</div>
						) : null}

						{summary?.summary_text ? (
							<div className={styles.explanationContent} data-testid="advisory-explanation">
								{summary.summary_text}
							</div>
						) : null}

						{session.components.length > 0 ? (
							<div style={{ marginTop: "8px" }}>
								<div style={{ fontSize: "11px", fontWeight: 600, color: "#909090", marginBottom: "6px" }}>
									{t("advisory.components")}
								</div>
								{session.components.filter((c) => !c.is_deleted).map((c) => (
									<div
										key={c.id}
										data-testid="advisory-component-row"
										style={{ borderBottom: "1px solid #2a2a2a", paddingBottom: "6px", marginBottom: "6px" }}
									>
										<div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
											<span style={{ flex: 1, fontSize: "12px", color: "#c0c0c0", fontWeight: 500 }}>
												{c.indicator_name}
											</span>
											<span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px", background: "#6c757d", color: "#ffffff" }}>
												{c.status}
											</span>
										</div>
										{c.rationale_text ? (
											<div style={{ marginTop: "4px", fontSize: "11px", color: "#b0b0b0", lineHeight: "1.5" }}>
												{c.rationale_text}
											</div>
										) : null}
									</div>
								))}
							</div>
						) : null}

						<div className={styles.timestamp}>
							{t("advisory.provider")}: {session.effective_ai_provider ?? session.effective_ai_source ?? "—"}
						</div>
					</>
				)}
			</div>
		</div>
	);
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonRow() {
	return (
		<div
			style={{
				height: "40px",
				background: "#1e1e1e",
				borderRadius: "4px",
				marginBottom: "8px",
				animation: "pulse 1.2s ease-in-out infinite",
			}}
		/>
	);
}

// ── Main component ────────────────────────────────────────────────────────────

export interface AdvisoryPanelProps {
	show: boolean;
	result: AdvisoryResult | null;
	isLoading: boolean;
	symbol?: string;
	onRefresh?: () => void;
	onClose?: () => void;
	/**
	 * Follow-up advisory V2: native session from GET .../ai-advisory-session/.
	 * When provided (even empty), the V2 view renders instead of the legacy result view.
	 */
	session?: AdvisorySessionV2 | null;
}

export function AdvisoryPanel({
	show,
	result,
	isLoading,
	symbol,
	onRefresh,
	onClose,
	session,
}: AdvisoryPanelProps) {
	const { t } = useWidgetI18n();
	const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
	const [explanationOpen, setExplanationOpen] = useState(false);

	if (!show) return null;

	if (session) {
		return (
			<SessionView
				session={session}
				isLoading={isLoading}
				symbol={symbol}
				onRefresh={onRefresh}
				onClose={onClose}
			/>
		);
	}

	return (
		<div
			className={styles.panel}
			data-testid="advisory-panel"
		>
			{/* Header */}
			<div className={styles.header}>
				<span className={styles.title}>
					{t("advisory.title")}{symbol ? ` — ${symbol}` : ""}
				</span>
				<div className={styles.headerActions}>
					{onRefresh ? (
						<button
							onClick={onRefresh}
							disabled={isLoading}
							title={t("advisory.refresh")}
							className={styles.refreshBtn}
						>
							↻
						</button>
					) : null}
					{onClose ? (
						<button
							onClick={onClose}
							title={t("advisory.close")}
							className={styles.closeBtn}
						>
							×
						</button>
					) : null}
				</div>
			</div>

			{/* Body */}
			<div className={styles.body}>
				{isLoading ? (
					<>
						<SkeletonRow />
						<SkeletonRow />
						<SkeletonRow />
						<SkeletonRow />
					</>
				) : result ? (
					<>
						{/* Decision badge */}
						{result.decision ? (
							<div className={styles.decisionBadge}>
								{(() => {
									const decisionStyle = DECISION_STYLES[result.decision] ?? DECISION_STYLES.HOLD;
									return (
										<div
											className={`${styles.decisionLabel} ${styles[`decision${result.decision}` as keyof typeof styles]}`}
											data-testid="advisory-decision"
										>
											{t(`advisory.decision.${result.decision}`)}
										</div>
									);
								})()}
								<div className={styles.confidence}>
									<div className={styles.confidenceLabel}>{t("advisory.confidence")}</div>
									<div className={styles.confidenceValue}>{formatConfidence(result.confidence)}</div>
								</div>
							</div>
						) : null}

						{/* Agent scorecards */}
						<div className={styles.agentRows}>
							{result.agents.map((agent) => (
								<AgentRow
									key={agent.name}
									agent={agent}
									isExpanded={expandedAgent === agent.name}
									onToggle={() =>
										setExpandedAgent((prev) =>
											prev === agent.name ? null : agent.name,
										)
									}
								/>
							))}
						</div>

						{/* Overall explanation */}
						{result.explanation ? (
							<div>
								<button
									onClick={() => setExplanationOpen((v) => !v)}
									className={styles.explanationToggle}
								>
									{explanationOpen ? t("advisory.hideSummary") : t("advisory.showSummary")}
								</button>
								{explanationOpen ? (
									<div
										className={styles.explanationContent}
										data-testid="advisory-explanation"
									>
										{result.explanation}
									</div>
								) : null}
							</div>
						) : null}

						{/* Timestamp */}
						<div className={styles.timestamp}>
							{formatTimestamp(result.triggered_at)}
						</div>
					</>
				) : (
					<div className={styles.emptyState} data-testid="advisory-empty">
						<div className={styles.emptyIcon}>🤖</div>
						{t("advisory.empty")}
					</div>
				)}
			</div>
		</div>
	);
}