/**
 * A10 — the pattern picker.
 *
 * PLAN_FRONTEND_PROPLUS_TRACKA_2026-09-28 §3.9. A panel the user opens
 * deliberately, which is what makes §3.9.4 hold: the scan runs when the user
 * asks for it, never in the background while they pan or zoom.
 *
 * The tier and device gate is not re-implemented here. `auto_pattern` is
 * already `pro`-gated and already in `DEVICE_HEAVY` in `CapabilityResolver`,
 * so `CapabilityGate` gives the plan's §3.9.3 (off at `free`, off on mobile)
 * and §9.1.8 (`LockedFeature`, not a silent hide) for free — and gives them
 * in the one place they are auditable.
 *
 * Every string goes through `t()`. The shape names and the detail line are
 * the only user-visible text and both are resolved by the host's dictionary.
 */

import { useCallback, useMemo, useState } from "react";
import { CapabilityGate } from "../CapabilityGate";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import {
	getPatternDetectionAdapter,
	type DetectedPattern,
	type PatternBar,
	type PatternShapeId,
} from "../../patterns/patternContract";
import {
	runAutoPatternScan,
	summarizePatterns,
	type PatternSummary,
	type ScanSkipReason,
} from "../../patterns/autoPatternScan";

export interface PatternScanPanelProps {
	readonly bars: readonly PatternBar[];
	/** How many trailing bars are still forming; 1 on a live chart. */
	readonly formingBars?: number;
	/** Called with the scan result so the host can create the drawings. */
	readonly onDraw: (patterns: readonly DetectedPattern[]) => void;
	/** `false` while the user is panning or zooming — plan §3.9.4. */
	readonly idle?: boolean;
}

const SHAPE_I18N_KEY: Readonly<Record<PatternShapeId, string>> = {
	headAndShoulders: "pattern.shape.headAndShoulders",
	inverseHeadAndShoulders: "pattern.shape.inverseHeadAndShoulders",
	doubleTop: "pattern.shape.doubleTop",
	doubleBottom: "pattern.shape.doubleBottom",
	triangle: "pattern.shape.triangle",
};

const SKIP_KEY: Readonly<Record<ScanSkipReason, string>> = {
	disabled: "pattern.scan.skippedDisabled",
	busy: "pattern.scan.skippedBusy",
	"no-data": "pattern.scan.noData",
	unavailable: "pattern.scan.unavailable",
};

function pct(value: number): string {
	return `${Math.round(value * 100)}%`;
}

/** `confirmed · 82% · R²0.91` — i18n key plus interpolated numbers. */
function detailLabel(t: (key: string) => string, p: PatternSummary): string {
	const r2 = p.degenerateFit ? t("pattern.detail.r2Unknown") : `R²${p.rSquared.toFixed(2)}`;
	return `${t("pattern.detail.confirmed")} · ${pct(p.confidence)} · ${r2} · ${t("pattern.detail.bars")} ${p.barsInPattern}`;
}

export function PatternScanPanel({ bars, formingBars, onDraw, idle = true }: PatternScanPanelProps): React.ReactNode {
	const { t } = useWidgetI18n();
	// Rule 15: the detector is private. `shapes` is the adapter's list, not a
	// copy kept here — a shape added to engine-pro must not need a public edit.
	const adapter = getPatternDetectionAdapter();
	const shapes = adapter?.shapes ?? [];
	const [selected, setSelected] = useState<readonly PatternShapeId[]>(() => [...shapes]);
	const [results, setResults] = useState<readonly PatternSummary[]>([]);
	const [skipped, setSkipped] = useState<ScanSkipReason | null>("no-data");

	const toggle = useCallback((shape: PatternShapeId) => {
		setSelected((prev) =>
			prev.includes(shape) ? prev.filter((s) => s !== shape) : [...prev, shape],
		);
	}, []);

	const shapeLabel = useCallback(
		(shape: PatternShapeId) => t(SHAPE_I18N_KEY[shape]),
		[t],
	);

	const scan = useCallback(() => {
		// `idle` is false mid-gesture, so the scan is skipped rather than
		// deferred: a scan taken while the user is dragging measures a
		// viewport they are about to leave.
		const result = runAutoPatternScan({
			bars,
			enabled: true,
			idle,
			shapes: selected,
			formingBars,
		});
		setSkipped(result.skipped);
		setResults(summarizePatterns(result.patterns));
		onDraw(result.patterns);
	}, [bars, formingBars, idle, onDraw, selected]);

	const allSelected = useMemo(
		() => shapes.length > 0 && selected.length === shapes.length,
		[selected.length, shapes.length],
	);

	// Fail closed: no Pro module, no detector. The gate still renders, so a
	// Pro user sees an actionable message instead of a dead "Scan" button.
	if (!adapter) {
		return (
			<CapabilityGate capability="auto_pattern">
				<section className="vnsc-pattern-scan" aria-label={t("pattern.scan.title")}>
					<header className="vnsc-pattern-scan__header">
						<h3 className="vnsc-pattern-scan__title">{t("pattern.scan.title")}</h3>
						<p className="vnsc-pattern-scan__hint">{t("pattern.scan.hint")}</p>
					</header>
					<p
						className="vnsc-pattern-scan__unavailable"
						role="status"
						data-unavailable="pattern-detection"
					>
						{t("pattern.scan.unavailable")}
					</p>
				</section>
			</CapabilityGate>
		);
	}

	return (
		<CapabilityGate capability="auto_pattern">
			<section className="vnsc-pattern-scan" aria-label={t("pattern.scan.title")}>
				<header className="vnsc-pattern-scan__header">
					<h3 className="vnsc-pattern-scan__title">{t("pattern.scan.title")}</h3>
					<p className="vnsc-pattern-scan__hint">{t("pattern.scan.hint")}</p>
				</header>

				<fieldset className="vnsc-pattern-scan__shapes">
					<legend className="vnsc-pattern-scan__legend">{t("pattern.scan.shapes")}</legend>
					{shapes.map((shape) => (
						<label key={shape} className="vnsc-pattern-scan__shape">
							<input
								type="checkbox"
								checked={selected.includes(shape)}
								onChange={() => toggle(shape)}
								data-shape={shape}
							/>
							<span>{shapeLabel(shape)}</span>
						</label>
					))}
					<button
						type="button"
						className="vnsc-pattern-scan__toggle-all"
						onClick={() => setSelected(allSelected ? [] : [...shapes])}
					>
						{allSelected ? t("pattern.scan.clearAll") : t("pattern.scan.selectAll")}
					</button>
				</fieldset>

				<button
					type="button"
					className="vnsc-pattern-scan__run"
					onClick={scan}
					disabled={!idle || selected.length === 0}
					data-testid="pattern-scan-run"
				>
					{t("pattern.scan.run")}
				</button>

				{skipped ? (
					<p className="vnsc-pattern-scan__skipped" role="status" data-skipped={skipped}>
						{t(SKIP_KEY[skipped])}
					</p>
				) : results.length === 0 ? (
					<p className="vnsc-pattern-scan__empty" role="status">
						{t("pattern.scan.none")}
					</p>
				) : (
					<ul className="vnsc-pattern-scan__results">
						{results.map((r) => (
							<li key={r.id} className="vnsc-pattern-scan__result" data-shape={r.shape}>
								<span className="vnsc-pattern-scan__result-shape">{shapeLabel(r.shape)}</span>
								<span className="vnsc-pattern-scan__result-detail">
									{detailLabel(t, r)}
								</span>
								<span className="vnsc-pattern-scan__result-direction" data-direction={r.direction}>
									{t(r.direction === "bullish" ? "pattern.direction.bullish" : "pattern.direction.bearish")}
								</span>
							</li>
						))}
					</ul>
				)}
			</section>
		</CapabilityGate>
	);
}
