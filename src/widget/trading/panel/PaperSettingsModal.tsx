/**
 * S1-polish: PaperSettingsModal — runtime paper config (§8 audit).
 * Controlled draft; S3 hook owns persistence/sync. Themed seg/field/btn
 * controls, focus trap + return focus, X/backdrop/Esc close.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import { IconX } from "../../components/common/Icons";
import {
	DEFAULT_PAPER_RUNTIME_CONFIG,
	validatePaperRuntimeConfig,
	INTEGRITY_FAILURE_MODES,
	type CostBasisMethod,
	type PaperRuntimeConfig,
	type PnlDisplayMode,
} from "../config/paperRuntimeConfig";
import styles from "./PaperSettingsModal.module.css";

export interface PaperSettingsModalProps {
	open: boolean;
	initial: PaperRuntimeConfig;
	perChartOverride: boolean;
	onToggleOverride: (override: boolean) => void;
	onSave: (config: Partial<PaperRuntimeConfig>) => void;
	onCancel: () => void;
	/** S4-polish: hide settlement cycle for non-VN markets (meaningless for crypto). */
	hideSettlement?: boolean;
	/**
	 * Audit-2 P0#3: hide VN-specific fee rows (sell tax, flat VND
	 * commission) for non-VN profiles — crypto uses maker/taker only.
	 */
	hideVnFees?: boolean;
}

type TabId = "fees" | "execution" | "pnl" | "rules";

export function PaperSettingsModal({
	open,
	initial,
	perChartOverride,
	onToggleOverride,
	onSave,
	onCancel,
	hideSettlement = false,
	hideVnFees = false,
}: PaperSettingsModalProps) {
	const { t } = useWidgetI18n();
	const [tab, setTab] = useState<TabId>("fees");
	const [draft, setDraft] = useState<Partial<PaperRuntimeConfig>>({});
	const boxRef = useRef<HTMLDivElement>(null);
	const returnFocusRef = useRef<Element | null>(null);

	// Focus management: remember opener, autofocus first control, restore on close.
	useEffect(() => {
		if (!open) return;
		returnFocusRef.current = document.activeElement;
		const first = boxRef.current?.querySelector<HTMLElement>("input, button:not([data-autofocus-skip])");
		first?.focus();
		return () => {
			(returnFocusRef.current as HTMLElement | null)?.focus?.();
		};
	}, [open]);

	if (!open) return null;

	const merged: PaperRuntimeConfig = { ...initial, ...draft };
	const errors = validatePaperRuntimeConfig(merged);
	const valid = errors.length === 0;
	const set = (patch: Partial<PaperRuntimeConfig>) => setDraft((prev) => ({ ...prev, ...patch }));
	const errorFor = (field: string) => errors.find((e) => e.field === field)?.message;

	const trapTab = (e: React.KeyboardEvent) => {
		if (e.key === "Escape") {
			onCancel();
			return;
		}
		if (e.key !== "Tab" || !boxRef.current) return;
		const focusables = Array.from(
			boxRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])"),
		);
		if (focusables.length === 0) return;
	 const first = focusables[0];
		const last = focusables[focusables.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	};

	const tabs: Array<{ id: TabId; label: string }> = [
		{ id: "fees", label: t("widget.trading.tabFees") },
		{ id: "execution", label: t("widget.trading.tabExec") },
		{ id: "pnl", label: t("widget.trading.tabPnl") },
		{ id: "rules", label: t("widget.trading.tabRules") },
	];

	const dialog = (
		<div
			className={styles.backdrop}
			data-testid="paper-settings-modal"
			role="dialog"
			aria-modal="true"
			aria-label={t("widget.trading.settingsTitle")}
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) onCancel();
			}}
			onKeyDown={trapTab}
		>
			<div className={styles.modal} ref={boxRef}>
				<div className={styles.head}>
					<span>{t("widget.trading.settingsTitle")}</span>
					<button
						type="button"
						className={styles.closeBtn}
						data-testid="paper-settings-close"
						aria-label={t("widget.trading.cancel", { defaultValue: "Cancel" })}
						onClick={onCancel}
					>
						<IconX size={13} />
					</button>
				</div>
				<div className={styles.body}>
					<div className={`${styles.seg} ${styles.tablist}`} role="tablist" aria-label={t("widget.trading.settingsTitle")}>
						{tabs.map((item) => (
							<button
								key={item.id}
								type="button"
								role="tab"
								aria-selected={tab === item.id}
								data-testid={`paper-settings-tab-${item.id}`}
								onClick={() => setTab(item.id)}
							>
								{item.label}
							</button>
						))}
					</div>
					{tab === "fees" && (
						<div role="tabpanel">
							<div className={styles.row}>
								<span>{t("widget.trading.commissionRate")}</span>
								<div className={styles.field}>
									<input
										data-testid="paper-settings-fee"
										inputMode="decimal"
										value={String(merged.brokerFeeRate * 100)}
										onChange={(e) => {
											const v = Number(e.target.value);
											if (e.target.value === "" || Number.isFinite(v)) set({ brokerFeeRate: (Number.isFinite(v) ? v : 0) / 100 });
										}}
									/>
									<span>%</span>
								</div>
							</div>
							{errorFor("brokerFeeRate") && <div className={styles.error} data-testid="paper-settings-error-fee">{errorFor("brokerFeeRate")}</div>}
							{!hideVnFees && (
								<>
									<div className={styles.row}>
										<span>{t("widget.trading.taxRate")}</span>
										<div className={styles.field}>
											<input
												data-testid="paper-settings-tax"
												inputMode="decimal"
												value={String(merged.taxRate * 100)}
												onChange={(e) => {
													const v = Number(e.target.value);
													if (e.target.value === "" || Number.isFinite(v)) set({ taxRate: (Number.isFinite(v) ? v : 0) / 100 });
												}}
											/>
											<span>%</span>
										</div>
									</div>
									{errorFor("taxRate") && <div className={styles.error} data-testid="paper-settings-error-tax">{errorFor("taxRate")}</div>}
									<div className={styles.row}>
										<span>{t("widget.trading.commissionFixed")}</span>
										<div className={styles.field}>
											<input
												data-testid="paper-settings-commission"
												inputMode="numeric"
												value={String(merged.commissionPerContract)}
												onChange={(e) => {
													const digits = e.target.value.replace(/[^0-9]/g, "");
													set({ commissionPerContract: digits === "" ? 0 : Number.parseInt(digits, 10) });
												}}
											/>
											<span>đ</span>
										</div>
									</div>
									{errorFor("commissionPerContract") && <div className={styles.error}>{errorFor("commissionPerContract")}</div>}
								</>
							)}
						</div>
					)}
					{tab === "execution" && (
						<div role="tabpanel">
							<div className={styles.row}>
								<span>{t("widget.trading.slippageTicks")}</span>
								<div className={styles.field}>
									<input
										data-testid="paper-settings-slippage"
										inputMode="numeric"
										value={String(merged.slippageTicks)}
										onChange={(e) => {
											const digits = e.target.value.replace(/[^0-9]/g, "");
											set({ slippageTicks: digits === "" ? 0 : Number.parseInt(digits, 10) });
										}}
									/>
									<span>ticks</span>
								</div>
							</div>
							{errorFor("slippageTicks") && <div className={styles.error}>{errorFor("slippageTicks")}</div>}
							<div className={styles.row}>
								<span>{t("widget.trading.leverage")}</span>
								<div className={styles.field}>
									<input
										data-testid="paper-settings-leverage"
										inputMode="numeric"
										value={String(merged.maxLeverage)}
										onChange={(e) => {
											const digits = e.target.value.replace(/[^0-9]/g, "");
											set({ maxLeverage: digits === "" ? 1 : Number.parseInt(digits, 10) });
										}}
									/>
									<span>×</span>
								</div>
							</div>
							{errorFor("maxLeverage") && <div className={styles.error}>{errorFor("maxLeverage")}</div>}
							{/* A4 (QUICKTRADE_PILLS): one-click là config persist — thay toggle ⚡
							    session-only cũ trên strip. Label dùng key có sẵn `oneClick`. */}
							<label className={styles.checkRow}>
								<input
									type="checkbox"
									data-testid="paper-settings-oneclick"
									checked={merged.oneClickTrading}
									onChange={(e) => set({ oneClickTrading: e.target.checked })}
								/>
								<span
									title={t("widget.trading.oneClickHint", {
										defaultValue: "Buy/Sell buttons place market orders instantly without opening the ticket",
									})}
								>
									{t("widget.trading.oneClick")}
								</span>
							</label>
						</div>
					)}
					{tab === "pnl" && (
						<div role="tabpanel">
							<div className={styles.row}>
								<span>{t("widget.trading.costBasisMethod")}</span>
								<div className={styles.seg}>
									{(["average", "fifo"] as CostBasisMethod[]).map((m) => (
										<button
											key={m}
											type="button"
											aria-pressed={merged.costBasisMethod === m}
											data-testid={`paper-settings-basis-${m}`}
											title={m === "average" ? t("widget.trading.weightedAverage") : t("widget.trading.fifo")}
											onClick={() => set({ costBasisMethod: m })}
										>
											{m === "average" ? t("widget.trading.weightedAverage") : t("widget.trading.fifoShort")}
										</button>
									))}
								</div>
							</div>
							<div className={styles.row}>
								<span>{t("widget.trading.pnlDisplayMode")}</span>
								<div className={styles.seg}>
									{(["gross", "net"] as PnlDisplayMode[]).map((m) => (
										<button
											key={m}
											type="button"
											aria-pressed={merged.pnlDisplayMode === m}
											data-testid={`paper-settings-pnl-${m}`}
											onClick={() => set({ pnlDisplayMode: m })}
										>
											{m === "gross" ? t("widget.trading.pnlGross") : t("widget.trading.pnlNet")}
										</button>
									))}
								</div>
							</div>
							<div className={styles.hint}>{t("widget.trading.pnlNetHint", { defaultValue: "Net = after fees and slippage" })}</div>
						</div>
					)}
					{tab === "rules" && (
						<div role="tabpanel">
							{!hideSettlement && (
								<div className={styles.row}>
									<span>{t("widget.trading.settlementDays")}</span>
									<div className={styles.seg}>
										{[0, 1, 2, 3].map((d) => (
											<button
												key={d}
												type="button"
												aria-pressed={merged.settlementDays === d}
												data-testid={`paper-settings-settle-${d}`}
												onClick={() => set({ settlementDays: d })}
											>
												T+{d}
											</button>
										))}
									</div>
								</div>
							)}
							<label className={styles.checkRow}>
								<input
									type="checkbox"
									data-testid="paper-settings-short"
									checked={merged.allowShortSelling}
									onChange={(e) => set({ allowShortSelling: e.target.checked })}
								/>
								{t("widget.trading.allowShortSelling")}
							</label>
							{/* F-TRADE-01: người dùng chọn cách xử lý khi pipeline gặp lỗi toàn vẹn.
						    Ba lựa chọn vì mỗi lựa chọn đổi một thứ khác nhau: mức báo, mức
						    khóa lệnh, và cách lệnh hỏng được ghi nhận. */}
							<div className={styles.row}>
								<span>{t("widget.trading.integrityFailureMode")}</span>
								<div className={styles.seg}>
									{INTEGRITY_FAILURE_MODES.map((mode) => (
										<button
											key={mode}
											type="button"
											aria-pressed={merged.integrityFailureMode === mode}
											data-testid={`paper-settings-integrity-${mode}`}
											title={t(`widget.trading.integrityMode_${mode}_hint`)}
											onClick={() => set({ integrityFailureMode: mode })}
										>
											{t(`widget.trading.integrityMode_${mode}`)}
										</button>
									))}
								</div>
							</div>
							<div className={styles.hint}>
								{t("widget.trading.integrityFailureModeHint")}
							</div>
						</div>
					)}
					<label className={styles.checkRow}>
						<input
							type="checkbox"
							data-testid="paper-settings-override"
							checked={perChartOverride}
							onChange={(e) => onToggleOverride(e.target.checked)}
						/>
						{t("widget.trading.perChartOverride")}
					</label>
				</div>
				<div className={styles.foot}>
					<button
						type="button"
						className={styles.btn}
						data-testid="paper-settings-reset"
						title={t("widget.trading.resetDefaults")}
						onClick={() => setDraft({ ...DEFAULT_PAPER_RUNTIME_CONFIG })}
					>
						{t("widget.trading.resetDefaults")}
					</button>
					<span className={styles.footSpacer} />
					<button type="button" className={styles.btn} data-testid="paper-settings-cancel" onClick={onCancel}>
						{t("widget.trading.cancel", { defaultValue: "Cancel" })}
					</button>
					<button
						type="button"
						className={`${styles.btn} ${styles.btnPrimary}`}
						data-testid="paper-settings-save"
						disabled={!valid}
						onClick={() => {
							if (valid) onSave({ ...draft, effectiveFrom: Date.now() });
						}}
					>
						{t("widget.trading.confirm", { defaultValue: "Confirm" })}
					</button>
				</div>
			</div>
		</div>
	);

	// Portal out of the bottom-panel stacking context (capped at z-40, ticket
	// paints above). document.body keeps tokens (global stylesheet); SSR-safe.
	if (typeof document === "undefined") return dialog;
	return createPortal(dialog, document.body);
}
