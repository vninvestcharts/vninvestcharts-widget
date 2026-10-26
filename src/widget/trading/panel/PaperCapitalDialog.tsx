/**
 * PaperCapitalDialog — mô phỏng nộp vốn: nhập vốn ban đầu + preset nhanh,
 * xác nhận thì reset tài khoản về đúng số đó (per-chart qua onConfirm).
 */
import { useState } from "react";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import { MAX_PAPER_BALANCE } from "../../../lib/core/trading/MarketRules";
import styles from "./TradingBottomPanel.module.css";

export interface PaperCapitalDialogProps {
	open: boolean;
	currency: string;
	defaultAmount: number;
	onConfirm: (amount: number) => void;
	onCancel: () => void;
}

function presetsFor(currency: string): number[] {
	return currency === "USD" ? [10_000, 50_000, 100_000, 500_000] : [100_000_000, 500_000_000, 1_000_000_000, 5_000_000_000];
}

function formatAmount(v: number, currency: string): string {
	// S1 i18n: dùng Intl currency (không hardcode "đ"/"$") để qua audit:hardcoded-text.
	try {
		return new Intl.NumberFormat(currency === "USD" ? "en-US" : "vi-VN", {
			style: "currency",
			currency: currency === "USD" ? "USD" : "VND",
			maximumFractionDigits: 0,
		}).format(v);
	} catch {
		return String(v);
	}
}

export function PaperCapitalDialog({ open, currency, defaultAmount, onConfirm, onCancel }: PaperCapitalDialogProps) {
	const { t } = useWidgetI18n();
	const [draft, setDraft] = useState<string | null>(null);
	const shown = draft ?? String(defaultAmount);
	const parsed = Number(shown.replace(/[^0-9]/g, ""));
	const valid = shown !== "" && Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_PAPER_BALANCE;

	if (!open) return null;
	return (
		<div className={styles.capitalOverlay} data-testid="capital-dialog" role="dialog" aria-modal="true">
			<div className={styles.capitalBox}>
				<div className={styles.capitalTitle}>
					{t("widget.trading.refillTitle", { defaultValue: "Deposit paper capital" })}
				</div>
				<div className={styles.capitalHint}>
					{t("widget.trading.refillMessage", {
						defaultValue: "Reset the account back to the capital you enter.",
					})}
				</div>
				<div className={styles.capitalPresets}>
					{presetsFor(currency).map((p) => (
						<button
							key={p}
							type="button"
							className={styles.capitalPreset}
							data-testid={`capital-preset-${p}`}
							onClick={() => setDraft(String(p))}
						>
							{formatAmount(p, currency)}
						</button>
					))}
				</div>
				<label className={styles.capitalField}>
					{t("widget.trading.refillAmount", { defaultValue: "Capital" })}
					<input
						data-testid="capital-input"
						inputMode="numeric"
						value={draft ?? defaultAmount.toLocaleString("en-US")}
						onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
						onKeyDown={(e) => {
							if (e.key === "Enter" && valid) onConfirm(parsed);
							if (e.key === "Escape") onCancel();
						}}
					/>
				</label>
				{!valid && (
					<div className={styles.capitalError} data-testid="capital-error">
						{t("widget.trading.refillInvalid", {
							defaultValue: "Enter an amount from 1 to 1,000,000,000,000",
						})}
					</div>
				)}
				<div className={styles.capitalActions}>
					<button type="button" data-testid="capital-cancel" onClick={onCancel}>
						{t("widget.trading.cancel", { defaultValue: "Cancel" })}
					</button>
					<button
						type="button"
						data-testid="capital-confirm"
						disabled={!valid}
						onClick={() => {
							if (valid) {
								onConfirm(parsed);
								setDraft(null);
							}
						}}
					>
						{t("widget.trading.confirm", { defaultValue: "Confirm" })}
					</button>
				</div>
			</div>
		</div>
	);
}
