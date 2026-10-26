import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import { useVNInvestChartsState } from "../../context/VNInvestChartsStateContext";
import { usePortalRoot } from "../../context/VNInvestChartsContext";
import { usePortalAdapter } from "../../hooks/usePortalAdapter";
import { AlertCondition, AlertConditionType, AlertSource } from "../../../lib/alerts/types";
import { buildIndicatorSeriesKey } from "../../../lib/core/seriesValueResolver";
import { outputKeysFor } from "../../../lib/indicators/outputKeys";
import type { PortalAdapter } from "@vninvestcharts/engine-react";

export interface AlertsModalProps {
	open: boolean;
	onClose: () => void;
	symbol: string;
	timeframe: string;
	alertManager: any; // AlertManager instance
	portalAdapter?: PortalAdapter;
	/**
	 * P1-5c: portal rơi vào `document.body` (ngoài `.vnsc-root`) ⇒ token `--vnsc-*` KHÔNG
	 * resolve ⇒ modal **tối trong tối** ở light mode. `isDark`/`themePreset` để dựng
	 * scope giống `SettingsModal.tsx:456-459`.
	 */
	isDark?: boolean;
	themePreset?: string;
}

/**
 * SSOT cho các key giá mà nhánh `type: "price"` đọc được.
 *
 * Trước đây danh sách này bị viết lặp ở hai `<select>` và **không ai validate
 * nó**, nên form có thể persist một key không tồn tại. Đó không phải chuyện giả định:
 * `AlertsModal.tsx:197-208` (effect cũ) ghi đè `sourceAKey` bằng output của indicator
 * kể cả khi `sourceAType === "price"`, và với RSI (output đầu là `"line"`) điều đó làm
 * alert lưu `{type:"price", key:"line"}`. `AlertEvaluator.getValue` đọc `datum["line"]`
 * → `undefined` → `null` ⇒ **không bao giờ fire**. Tệ hơn: `<select>` có `value="line"`
 * khớp 0 `<option>` nên trình duyệt hiển thị option đầu (`close`) — **UI khẳng định một
 * điều kiện, alert lưu điều kiện khác**.
 *
 * Vì vậy giá trị ở đây vừa sinh `<option>` vừa là predicate: một key không thuộc đây
 * là key không đọc được, và form không được lưu nó.
 */
export const PRICE_SOURCE_KEYS = ["close", "open", "high", "low"] as const;

export function isPriceSourceKey(key: string | undefined): boolean {
	return PRICE_SOURCE_KEYS.includes(key as (typeof PRICE_SOURCE_KEYS)[number]);
}

/** Everything the create-alert form collects, as one flat bag, so the builder
 *  below stays pure and testable without mounting React or the portal. */
export interface AlertDraftInput {
	id: string;
	symbol: string;
	timeframe: string;
	sourceAType: "price" | "indicator";
	sourceAKey: string;
	sourceAIndicatorId: string;
	condition: AlertConditionType;
	sourceBType: "value" | "price" | "indicator";
	sourceBValue: string;
	sourceBKey: string;
	sourceBIndicatorId: string;
	frequency: AlertCondition["frequency"];
	actionPopup: boolean;
	actionSound: boolean;
	webhookUrl: string;
	message: string;
	createdAt: number;
}

/**
 * The source-B half of an alert, in the shape it is PERSISTED.
 *
 * The threshold lives at `sourceB.value` — NOT at a top-level `sourceBValue`.
 * Four independent places agree on that key and none mentions the other:
 *   - src/lib/alerts/types.ts:12        `AlertSource.value?: number` ("for sourceB")
 *   - src/lib/alerts/types.ts:15-33     `AlertCondition` has NO `sourceBValue`
 *   - src/lib/alerts/AlertEvaluator.ts:38-40   reads `source.value`
 *   - src/lib/alerts/AlertManager.ts:136       JSON.stringify(this.alerts), verbatim
 *
 * A missing or non-numeric threshold is stored as `value: undefined`, i.e. the
 * key is simply ABSENT from the persisted JSON, and AlertEvaluator.getValue then
 * returns null so the alert can never fire. It must NOT be coerced to 0:
 * "price > 0" is a real, wrong, user-visible alert, while a null threshold fails
 * closed. This is the third fabricated zero this repo has been bitten by.
 */
export function buildAlertSourceB(input: {
	sourceBType: "value" | "price" | "indicator";
	sourceBValue: string;
	sourceBKey: string;
	sourceBIndicatorId: string;
}): AlertSource {
	if (input.sourceBType === "value") {
		// Number("") === 0 and parseFloat("abc") === NaN, so a bare parse invents a
		// threshold out of nothing. Accept only a finite DECIMAL number: Number() alone
		// would also re-interpret "0x10" as 16 and "1_000" as 1000, which a price
		// threshold field must not silently do (parseFloat("0x10") is 0 = the old bug).
		const trimmed = input.sourceBValue.trim();
		const parsed = /^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/.test(trimmed) ? Number(trimmed) : NaN;
		// Absent, not null and not 0: omit the key entirely so the persisted JSON has
		// no "value" to deserialize into a fabricated threshold.
		return Number.isFinite(parsed) ? { type: "value", value: parsed } : { type: "value" };
	}
	if (input.sourceBType === "price") return { type: "price", key: input.sourceBKey };
	return { type: "indicator", indicatorId: input.sourceBIndicatorId, key: input.sourceBKey };
}

/** The exact object handed to AlertManager.addAlert(). Pure — no Date.now(),
 *  no React state, so a test can assert the persisted shape deterministically. */
export function buildAlertDraft(input: AlertDraftInput): AlertCondition {
	const sourceA: AlertSource =
		input.sourceAType === "price"
			? { type: "price", key: input.sourceAKey }
			: { type: "indicator", indicatorId: input.sourceAIndicatorId, key: input.sourceAKey };

	const defaultMsg = `${input.symbol} (${input.timeframe}): ${input.sourceAType === "price" ? "Price" : input.sourceAIndicatorId} ${input.condition} ${input.sourceBType === "value" ? input.sourceBValue : "target"}`;

	return {
		id: input.id,
		symbol: input.symbol,
		timeframe: input.timeframe,
		sourceA,
		condition: input.condition,
		sourceB: buildAlertSourceB(input),
		frequency: input.frequency,
		actions: {
			popup: input.actionPopup,
			sound: input.actionSound,
			email: false,
			webhook: input.webhookUrl || undefined,
		},
		message: input.message || defaultMsg,
		createdAt: input.createdAt,
		isTriggered: false,
	};
}
export function AlertsModal({ open, onClose, symbol, timeframe, alertManager, portalAdapter, isDark = true, themePreset }: AlertsModalProps) {
	const { t } = useWidgetI18n();
	const { paneState } = useVNInvestChartsState();
	const portalRoot = usePortalRoot();
	const { portalTarget } = usePortalAdapter({ portalAdapter: portalAdapter! });
	const backdropRef = useRef<HTMLDivElement>(null);
	const [alerts, setAlerts] = useState<AlertCondition[]>([]);

	// Form states
	const [sourceAType, setSourceAType] = useState<"price" | "indicator">("price");
	const [sourceAKey, setSourceAKey] = useState("close");
	const [sourceAIndicatorId, setSourceAIndicatorId] = useState("");

	const [condition, setCondition] = useState<AlertConditionType>("crossing_up");

	const [sourceBType, setSourceBType] = useState<"value" | "price" | "indicator">("value");
	const [sourceBValue, setSourceBValue] = useState("100");
	const [sourceBKey, setSourceBKey] = useState("close");
	const [sourceBIndicatorId, setSourceBIndicatorId] = useState("");

	const [frequency, setFrequency] = useState<AlertCondition["frequency"]>("once");
	const [actionPopup, setActionPopup] = useState(true);
	const [actionSound, setActionSound] = useState(true);
	const [webhookUrl, setWebhookUrl] = useState("");
	const [message, setMessage] = useState("");

	useEffect(() => {
		if (open) {
			setAlerts(alertManager.getAlerts());
		}
	}, [open, alertManager]);

	// Extract active indicators from all panes
	const activeIndicators = useMemo(() => {
		const list: { id: string; type: string; label: string; keys: readonly string[] }[] = [];
		paneState.panes.forEach((p) => {
			p.series.forEach((s, sIdx) => {
				if (s.id && s.type !== "Volume" && s.type !== "Candlestick" && s.type !== "HollowCandle" && s.type !== "OHLC" && s.type !== "HeikinAshi" && s.type !== "Line" && s.type !== "Area" && s.type !== "Bar") {
					const label = `${s.type} (${s.id.slice(-4)})`;
					// SSOT, shared with tabs/IndicatorParamsForm.tsx — the two used to carry
					// verbatim copies of this map and both had already drifted
					// (`StrengthElder: ["bull","bear"]` against a `{bullPower,bearPower}` value).
					// `[]` means "scalar, or outputs we cannot name" and is passed through as-is;
					// it must never become a single blank option, because
					// `AlertEvaluator.getValue` would read `val[""]` and get undefined forever.
					const keys = outputKeysFor(s.type);
					list.push({ id: s.id, type: s.type, label, keys });
				}
			});
		});
		return list;
	}, [paneState.panes]);

	const onCloseRef = useRef(onClose);
	useEffect(() => {
		onCloseRef.current = onClose;
	});

	// Escape closes the modal. Every other overlay in this repo already does this
	// (`RightSidebarDockHost.tsx:335`, `ShortcutHelpModal`), and this one did not, so a
	// keyboard user could get trapped behind a full-screen backdrop with no way out.
	// It also blocked the alerts E2E: the backdrop is `position: fixed; inset: 0`, so
	// every control underneath it is unclickable until the modal goes away.
	useEffect(() => {
		if (!open) return;
		// Prefer the OWNING document of the host element over the ambient one: the
		// widget ships as an IIFE that mounts into a ShadowRoot and as an iframe
		// embed, and a keydown listener on the top-level document is not
		// guaranteed to be the one that receives the event there.
		//
		// The ambient fallback is load-bearing, not belt-and-braces:
		//   1. VNInvestCharts.tsx:2843 mounts this modal CONDITIONALLY
		//      (`alertsModalOpen && ... <LazyAlertsModal open={alertsModalOpen} />`),
		//      so its FIRST render already has `open === true`.
		//   2. usePortalAdapter seeds `portalTarget` with useState(null) and only
		//      fills it from its own effect, so it is null on that first render.
		//   3. The `if (!open || !portalTarget) return null` guard therefore skips the
		//      createPortal, so `backdropRef.current` is STILL null when this effect runs.
		// Reading ownerDocument alone bailed on the first pass, and with deps
		// `[open]` only the effect never retried once the ref attached: Escape was
		// dead on every open. The backdrop is `position: fixed; inset: 0`, so the
		// keyboard user was trapped — the exact outcome the handler exists to
		// prevent. Fixed by BOTH the fallback above and `portalTarget` in the deps.
		const doc =
			backdropRef.current?.ownerDocument ??
			/* eslint-disable-next-line no-restricted-globals -- required fallback: on the first render of a conditionally mounted modal the backdrop ref is still null, so ownerDocument is unavailable and the Escape handler would never bind */
			(typeof document === "undefined" ? null : document);
		if (!doc) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onCloseRef.current();
		};
		doc.addEventListener("keydown", onKey);
		return () => doc.removeEventListener("keydown", onKey);
		// `open` only. Not `onClose`: the parent passes an inline arrow
		// (`onClose={() => setAlertsModalOpen(false)}`), so its identity changes on every
		// render of a chart that re-renders on every live tick, and this effect used to
		// unsubscribe and resubscribe every time. That churn is not harmless — an Escape
		// measured as needing TWO presses to close, because the effect only runs AFTER paint
		// while the form is already in the DOM, so a keypress arriving in that window hits a
		// document with no listener attached. A stable handler keeps one subscription for the
		// whole time the modal is open.
		//
		// `portalTarget` IS a dep, and the ambient `document` fallback above is
		// load-bearing rather than belt-and-braces. See the long note above: this
		// component mounts conditionally, so its first render already has
		// `open === true` while `portalTarget` is still null, `backdropRef.current`
		// is still null, and the effect would otherwise bail and never retry.
	}, [open, portalTarget]);

	// Initialize indicator choices.
	//
	// The `sourceAType`/`sourceBType` guards are load-bearing, not tidiness. This effect
	// used to write an indicator's output key into `sourceAKey`/`sourceBKey` with no
	// regard for which type was selected, so on any chart that has an indicator (RSI's
	// first output is "line") a price alert persisted `{type:"price", key:"line"}`.
	// `AlertEvaluator.getValue` reads `datum["line"]` → undefined → null, so the alert
	// could never fire — and because the `<select>`'s value matched no `<option>`, the
	// browser rendered the first option instead, so the form read "Close" while the
	// stored alert evaluated something else entirely.
	//
	// `sourceBType`'s own onChange only sets the type (see the select below), so this
	// effect is also the only thing that populates source B when the user picks
	// "indicator" there. That is why the guard tests the type rather than being dropped.
	useEffect(() => {
		if (activeIndicators.length === 0) return;
		if (sourceAType === "indicator" && !sourceAIndicatorId) {
			setSourceAIndicatorId(activeIndicators[0].id);
			setSourceAKey(activeIndicators[0].keys[0]);
		}
		if (sourceBType === "indicator" && !sourceBIndicatorId) {
			setSourceBIndicatorId(activeIndicators[0].id);
			setSourceBKey(activeIndicators[0].keys[0]);
		}
	}, [activeIndicators, sourceAIndicatorId, sourceBIndicatorId, sourceAType, sourceBType]);

	const handleCreateAlert = () => {
		// Last gate before persistence. The effect guards above and the SSOT option list
		// make this unreachable through the form, which is the point: the alert the user
		// sees must be the alert that gets evaluated. If it ever IS reached, the alert
		// would persist a key `AlertEvaluator.getValue` cannot read and would sit in the
		// list labelled "Active" forever, so refuse rather than store a dead record.
		if (sourceAType === "price" && !isPriceSourceKey(sourceAKey)) {
			console.error(`Alert not created: price source key ${JSON.stringify(sourceAKey)} is not in PRICE_SOURCE_KEYS`);
			return;
		}
		if (sourceBType === "price" && !isPriceSourceKey(sourceBKey)) {
			console.error(`Alert not created: price source key ${JSON.stringify(sourceBKey)} is not in PRICE_SOURCE_KEYS`);
			return;
		}
		const newAlert = buildAlertDraft({
			id: `alert-${Date.now()}`,
			createdAt: Date.now(),
			symbol,
			timeframe,
			sourceAType,
			sourceAKey,
			sourceAIndicatorId,
			condition,
			sourceBType,
			sourceBValue,
			sourceBKey,
			sourceBIndicatorId,
			frequency,
			actionPopup,
			actionSound,
			webhookUrl,
			message,
		});

		alertManager.addAlert(newAlert);
		setAlerts(alertManager.getAlerts());
		setMessage("");
	};

	const handleDeleteAlert = (id: string) => {
		alertManager.removeAlert(id);
		setAlerts(alertManager.getAlerts());
	};

	const handleToggleAlert = (id: string) => {
		alertManager.toggleAlert(id);
		setAlerts(alertManager.getAlerts());
	};

	if (!open || !portalTarget) return null;

	return createPortal(
		<div
			ref={backdropRef}
			className="vnsc-root"
			data-chart-mode={isDark ? "dark" : "light"}
			data-chart-theme={themePreset}
			role="dialog"
			aria-modal="true"
			data-testid="alerts-backdrop"
			onClick={(e) => e.target === backdropRef.current && onClose()}
			style={{
				position: "fixed",
				inset: 0,
				background: "rgba(0, 0, 0, 0.6)",
				backdropFilter: "blur(4px)",
				display: "flex",
				justifyContent: "center",
				alignItems: "center",
				zIndex: 9999,
				color: "var(--vnsc-text-primary, #e0e0e0)",
				fontFamily: "Inter, sans-serif",
			}}
		>
			<div
				style={{
					background: "var(--vnsc-bg-primary, #0c1017)",
					border: "1px solid var(--vnsc-border, #202b3c)",
					borderRadius: "8px",
					width: "820px",
					maxHeight: "95vh",
					display: "flex",
					flexDirection: "column",
					boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
					overflow: "hidden",
				}}
			>
				{/* Header */}
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", borderBottom: "1px solid var(--vnsc-border, #202b3c)" }}>
					<h3 style={{ margin: 0, fontSize: "15px", fontWeight: "bold" }}>
						{t("ui.alert.create") || "Create Alert"} - {symbol} ({timeframe})
					</h3>
					<button onClick={onClose} style={{ background: "none", border: "none", color: "var(--vnsc-text-secondary, #787b86)", fontSize: "18px", cursor: "pointer" }}>×</button>
				</div>

				{/* Content */}
				<div
					style={{
						padding: "16px 20px",
						display: "flex",
						gap: "20px",
						alignItems: "stretch",
						background: "var(--vnsc-bg-primary, #0c1017)",
					}}
				>
					{/* Left Column: Form */}
					<div style={{ flex: 1.2, display: "flex", flexDirection: "column", gap: "10px", minWidth: 0 }}>
						{/* Condition Section */}
						<div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
							<span style={{ fontSize: "11px", fontWeight: "bold", color: "var(--vnsc-text-secondary, #787b86)" }}>{t("ui.alert.condition") || "Condition"}</span>

							{/* Source A */}
							<div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
								<select
									value={sourceAType} data-testid="alert-source-a-type"
									onChange={(e) => {
										const type = e.target.value as "price" | "indicator";
										setSourceAType(type);
										if (type === "price") setSourceAKey("close");
										else if (activeIndicators.length > 0) {
											const ind = activeIndicators.find(i => i.id === sourceAIndicatorId) || activeIndicators[0];
											setSourceAIndicatorId(ind.id);
											setSourceAKey(ind.keys[0]);
										}
									}}
									style={{ flex: 1, padding: "6px 8px", background: "var(--vnsc-bg-input, #131b26)", border: "1px solid var(--vnsc-border-input, #202b3c)", borderRadius: "4px", color: "var(--vnsc-text-primary, #d1d4dc)", fontSize: "12px" }}
								>
									<option value="price">{t("ui.indicator.settings.source.price") || "Price"}</option>
									{activeIndicators.length > 0 && <option value="indicator">{t("ui.indicator.settings.source.indicators") || "Indicator"}</option>}
								</select>

								{sourceAType === "price" ? (
									<select
										value={sourceAKey} data-testid="alert-source-a-key"
										onChange={(e) => setSourceAKey(e.target.value)}
										style={{ flex: 1, padding: "6px 8px", background: "var(--vnsc-bg-input, #131b26)", border: "1px solid var(--vnsc-border-input, #202b3c)", borderRadius: "4px", color: "var(--vnsc-text-primary, #d1d4dc)", fontSize: "12px" }}
									>
										{PRICE_SOURCE_KEYS.map((k) => (
											<option key={k} value={k}>{k.charAt(0).toUpperCase() + k.slice(1)}</option>
										))}
									</select>
								) : (
									<>
										<select
											value={sourceAIndicatorId} data-testid="alert-source-a-indicator"
											onChange={(e) => {
												setSourceAIndicatorId(e.target.value);
												const ind = activeIndicators.find(i => i.id === e.target.value);
												if (ind) setSourceAKey(ind.keys[0] || "");
											}}
											style={{ flex: 1.5, padding: "6px 8px", background: "var(--vnsc-bg-input, #131b26)", border: "1px solid var(--vnsc-border-input, #202b3c)", borderRadius: "4px", color: "var(--vnsc-text-primary, #d1d4dc)", fontSize: "12px" }}
										>
											{activeIndicators.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
										</select>
										<select
											value={sourceAKey} data-testid="alert-source-a-output"
											onChange={(e) => setSourceAKey(e.target.value)}
											style={{ flex: 1, padding: "6px 8px", background: "var(--vnsc-bg-input, #131b26)", border: "1px solid var(--vnsc-border-input, #202b3c)", borderRadius: "4px", color: "var(--vnsc-text-primary, #d1d4dc)", fontSize: "12px" }}
										>
											{/* No blank "Output" option: an empty sub-key would read `val[""]` -> undefined on
										    every bar, i.e. a permanently dead alert offered as a working choice. */}
											{(activeIndicators.find(i => i.id === sourceAIndicatorId)?.keys ?? []).map(k => (
												<option key={k} value={k}>{k}</option>
											))}
										</select>
									</>
								)}
							</div>

							{/* Crossing Condition Type */}
							<select
								value={condition} data-testid="alert-condition"
								onChange={(e) => setCondition(e.target.value as AlertConditionType)}
								style={{ padding: "6px 8px", background: "var(--vnsc-bg-input, #131b26)", border: "1px solid var(--vnsc-border-input, #202b3c)", borderRadius: "4px", color: "var(--vnsc-text-primary, #d1d4dc)", fontSize: "12px" }}
							>
								<option value="crossing">{t("ui.alert.crossing") || "Crossing"}</option>
								<option value="crossing_up">{t("ui.alert.crossingUp") || "Crossing Up"}</option>
								<option value="crossing_down">{t("ui.alert.crossingDown") || "Crossing Down"}</option>
								<option value="greater_than">{t("ui.alert.greaterThan") || "Greater Than"}</option>
								<option value="less_than">{t("ui.alert.lessThan") || "Less Than"}</option>
							</select>

							{/* Source B */}
							<div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
								<select
									value={sourceBType} data-testid="alert-source-b-type"
									onChange={(e) => setSourceBType(e.target.value as "price" | "value" | "indicator")}
									style={{ flex: 1, padding: "6px 8px", background: "var(--vnsc-bg-input, #131b26)", border: "1px solid var(--vnsc-border-input, #202b3c)", borderRadius: "4px", color: "var(--vnsc-text-primary, #d1d4dc)", fontSize: "12px" }}
								>
									<option value="value">{t("ui.alert.value") || "Value"}</option>
									<option value="price">{t("ui.alert.price") || "Price"}</option>
									{activeIndicators.length > 0 && <option value="indicator">{t("ui.alert.indicator") || "Indicator"}</option>}
								</select>

								{sourceBType === "value" ? (
									<input
										type="number"
										data-testid="alert-threshold"
										value={sourceBValue}
										onChange={(e) => setSourceBValue(e.target.value)}
										style={{ flex: 2, padding: "6px 8px", background: "var(--vnsc-bg-input, #131b26)", border: "1px solid var(--vnsc-border-input, #202b3c)", borderRadius: "4px", color: "var(--vnsc-text-primary, #d1d4dc)", fontSize: "12px" }}
									/>
								) : sourceBType === "price" ? (
									<select
										value={sourceBKey} data-testid="alert-source-b-key"
										onChange={(e) => setSourceBKey(e.target.value)}
										style={{ flex: 2, padding: "6px 8px", background: "var(--vnsc-bg-input, #131b26)", border: "1px solid var(--vnsc-border-input, #202b3c)", borderRadius: "4px", color: "var(--vnsc-text-primary, #d1d4dc)", fontSize: "12px" }}
									>
										{PRICE_SOURCE_KEYS.map((k) => (
											<option key={k} value={k}>{k.charAt(0).toUpperCase() + k.slice(1)}</option>
										))}
									</select>
								) : (
									<>
										<select
											value={sourceBIndicatorId} data-testid="alert-source-b-indicator"
											onChange={(e) => {
												setSourceBIndicatorId(e.target.value);
												const ind = activeIndicators.find(i => i.id === e.target.value);
												if (ind) setSourceBKey(ind.keys[0] || "");
											}}
											style={{ flex: 1.5, padding: "6px 8px", background: "var(--vnsc-bg-input, #131b26)", border: "1px solid var(--vnsc-border-input, #202b3c)", borderRadius: "4px", color: "var(--vnsc-text-primary, #d1d4dc)", fontSize: "12px" }}
										>
											{activeIndicators.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
										</select>
										<select
											value={sourceBKey} data-testid="alert-source-b-output"
											onChange={(e) => setSourceBKey(e.target.value)}
											style={{ flex: 1, padding: "6px 8px", background: "var(--vnsc-bg-input, #131b26)", border: "1px solid var(--vnsc-border-input, #202b3c)", borderRadius: "4px", color: "var(--vnsc-text-primary, #d1d4dc)", fontSize: "12px" }}
										>
											{/* See the source-A note: no blank "Output" option. */}
											{(activeIndicators.find(i => i.id === sourceBIndicatorId)?.keys ?? []).map(k => (
												<option key={k} value={k}>{k}</option>
											))}
										</select>
									</>
								)}
							</div>
						</div>

						{/* Options Section */}
						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
							<label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
								<span style={{ fontSize: "11px", color: "var(--vnsc-text-secondary, #787b86)", fontWeight: "bold" }}>{t("ui.alert.frequency") || "Frequency"}</span>
								<select
									value={frequency} data-testid="alert-frequency"
									onChange={(e) => setFrequency(e.target.value as "continuous" | "once" | "once_per_bar" | "once_per_bar_close")}
									style={{ padding: "6px 8px", background: "var(--vnsc-bg-input, #131b26)", border: "1px solid var(--vnsc-border-input, #202b3c)", borderRadius: "4px", color: "var(--vnsc-text-primary, #d1d4dc)", fontSize: "12px" }}
								>
									<option value="once">{t("ui.alert.once") || "Only Once"}</option>
									<option value="once_per_bar">{t("ui.alert.oncePerBar") || "Once Per Bar"}</option>
									{/* `once_per_bar_close` is DELIBERATELY not offered.
								    Measured: it behaved identically to `once_per_bar` — 2 fires over 2
								    bars, the same bar — and it fired on `isClosed: false` too, because it
								    checks no flag at all. The bar-close flag it would need does not
								    exist on the enriched datum: keys are
								    [date, open, high, low, close, volume, index, dataIndex,
								    aoColor, indicatorValues], with no `isClosed`. Offering a choice
								    that cannot be honoured is the same defect as the form rendering
								    "Close" while storing "line".
								    The VALUE stays in `AlertCondition["frequency"]` on purpose:
								    alerts already stored with it keep working (the evaluator still
								    handles it, identically to `once_per_bar`), consumers compiling
								    against the public type are not broken, and restoring the option
								    once adapters carry a close flag is a one-line change.
								    Do not "fix" this by deleting the union member. */}
									<option value="continuous">{t("ui.alert.continuous") || "Continuous"}</option>
								</select>
							</label>

							<label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
								<span style={{ fontSize: "11px", color: "var(--vnsc-text-secondary, #787b86)", fontWeight: "bold" }}>{t("ui.alert.actions") || "Actions"}</span>
								<div style={{ display: "flex", gap: "12px", height: "100%", alignItems: "center" }}>
									<label style={{ display: "flex", gap: "4px", alignItems: "center", fontSize: "12px" }}>
										<input type="checkbox" checked={actionPopup} onChange={(e) => setActionPopup(e.target.checked)} />
										Popup
									</label>
									<label style={{ display: "flex", gap: "4px", alignItems: "center", fontSize: "12px" }}>
										<input type="checkbox" checked={actionSound} onChange={(e) => setActionSound(e.target.checked)} />
										Sound
									</label>
								</div>
							</label>
						</div>

						<label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
							<span style={{ fontSize: "11px", color: "var(--vnsc-text-secondary, #787b86)", fontWeight: "bold" }}>{t("ui.alert.webhook") || "Webhook URL"}</span>
							<input
								type="text"
								placeholder="https://example.com/webhook"
								value={webhookUrl}
								onChange={(e) => setWebhookUrl(e.target.value)}
								style={{ padding: "6px 8px", background: "var(--vnsc-bg-input, #131b26)", border: "1px solid var(--vnsc-border-input, #202b3c)", borderRadius: "4px", color: "var(--vnsc-text-primary, #d1d4dc)", fontSize: "12px" }}
							/>
						</label>

						<label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
							<span style={{ fontSize: "11px", color: "var(--vnsc-text-secondary, #787b86)", fontWeight: "bold" }}>{t("ui.alert.message") || "Alert Message"}</span>
							<textarea
								rows={2}
								data-testid="alert-message"
								placeholder="Enter alert message"
								value={message}
								onChange={(e) => setMessage(e.target.value)}
								style={{ padding: "6px 8px", background: "var(--vnsc-bg-input, #131b26)", border: "1px solid var(--vnsc-border-input, #202b3c)", borderRadius: "4px", color: "var(--vnsc-text-primary, #d1d4dc)", resize: "none", fontSize: "12px" }}
							/>
						</label>

						<button
							data-testid="alert-create"
							onClick={handleCreateAlert}
							style={{
								padding: "8px",
								background: "var(--vnsc-accent, #2962ff)",
								border: "none",
								borderRadius: "4px",
								color: "var(--vnsc-text-on-primary, #fff)",
								fontWeight: "bold",
								cursor: "pointer",
								fontSize: "12px",
								marginTop: "4px",
							}}
						>
							{t("ui.alert.create") || "Create Alert"}
						</button>
					</div>

					{/* Right Column: Active List */}
					<div style={{ flex: 0.8, display: "flex", flexDirection: "column", borderLeft: "1px solid var(--vnsc-border, #202b3c)", paddingLeft: "20px", minWidth: 0 }}>
						<h4 style={{ margin: "0 0 12px 0", fontSize: "13px", color: "var(--vnsc-text-secondary, #787b86)", fontWeight: "bold" }}>
							{t("ui.alert.activeAlerts") || "Active Alerts"} ({alerts.length})
						</h4>
						<div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1, maxHeight: "310px", overflowY: "auto", paddingRight: "4px" }}>
							{alerts.map((a) => (
								<div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "var(--vnsc-bg-input, #131b26)", borderRadius: "4px", border: "1px solid var(--vnsc-border-input, #202b3c)", gap: "8px" }}>
									<div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
										<span style={{ fontSize: "11px", fontWeight: "bold", textDecoration: a.isTriggered ? "line-through" : "none", color: a.isTriggered ? "var(--vnsc-text-secondary, #787b86)" : "var(--vnsc-text-on-primary, #fff)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={a.message}>
											{a.message}
										</span>
										<span style={{ fontSize: "9px", color: "var(--vnsc-text-secondary, #787b86)" }}>
											{new Date(a.createdAt).toLocaleString()}
										</span>
										{/* Webhook delivery status, on the row rather than in a toast.
										    A toast is gone in eight seconds and the console is not open; this is
										    where someone looks when they ask "why did my endpoint never fire",
										    and it survives a reload because the failure is stored on the alert.
										    Only rendered for an alert that actually HAS a webhook — an alert
										    with none has nothing to fail. */}
										{a.actions.webhook && a.lastDeliveryError ? (
											<span
												data-testid="alert-delivery-error"
												style={{
													fontSize: "9px",
													fontWeight: "bold",
													color: "var(--vnsc-color-bearish, #ef5350)",
													whiteSpace: "nowrap",
													overflow: "hidden",
													textOverflow: "ellipsis",
												}}
												title={`${a.lastDeliveryError.reason}${a.lastDeliveryError.status ? ` (HTTP ${a.lastDeliveryError.status})` : ""} — ${new Date(a.lastDeliveryError.at).toLocaleString()}`}
											>
												{t("ui.alert.deliveryFailed") || "Webhook delivery failed"}
												{a.lastDeliveryError.status ? ` · HTTP ${a.lastDeliveryError.status}` : ""} ·{" "}
												{new Date(a.lastDeliveryError.at).toLocaleTimeString()}
											</span>
										) : null}
									</div>
									<div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
										<button
											onClick={() => handleToggleAlert(a.id)}
											style={{
												padding: "3px 6px",
												fontSize: "10px",
												background: a.isTriggered ? "var(--vnsc-color-bullish, #2e7d32)" : "color-mix(in srgb, var(--vnsc-text-secondary, #787b86) 35%, transparent)",
												border: "none",
												borderRadius: "3px",
												color: "var(--vnsc-text-on-primary, #fff)",
												cursor: "pointer",
											}}
										>
											{a.isTriggered ? (t("ui.alert.reset") || "Reset") : (t("ui.alert.active") || "Active")}
										</button>
										<button
											onClick={() => handleDeleteAlert(a.id)}
											style={{
												padding: "3px 6px",
												fontSize: "10px",
												background: "var(--vnsc-color-error, #c62828)",
												border: "none",
												borderRadius: "3px",
												color: "var(--vnsc-text-on-primary, #fff)",
												cursor: "pointer",
											}}
										>
											{t("ui.alert.delete") || "Delete"}
										</button>
									</div>
								</div>
							))}
							{alerts.length === 0 && <span style={{ fontSize: "11px", color: "var(--vnsc-text-secondary, #787b86)", fontStyle: "italic" }}>{t("ui.alert.noAlerts") || "No alerts configured."}</span>}
						</div>
					</div>
				</div>
			</div>
		</div>,
		portalTarget
	);
}
