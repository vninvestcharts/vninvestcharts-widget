// OrderReviewSheet — bước XÁC NHẬN lệnh (Pha 1 trust fixes, TICKET_TRUST_2026-10-24).
// Dumb presentational: nhận view-model đã tính sẵn + 2 callback, KHÔNG tự validate,
// KHÔNG tự tính toán ⇒ dock và modal hiển thị giống hệt nhau, không drift.
import { useEffect, useRef } from "react";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import type { OrderReviewView } from "./orderTicketModel";
import { formatOrderTypeLabel } from "./orderTicketModel";
import styles from "./OrderTicketModal.module.css";

export interface OrderReviewSheetProps {
	review: OrderReviewView;
	onConfirm: () => void;
	onCancel: () => void;
	/** Nút confirm bị khóa khi lệnh không hợp lệ (fail-closed). */
	confirmDisabled?: boolean;
	/** Lý do khóa nút — PHẢI hiện trong review, không được khoá im lặng (O3). */
	disabledReason?: string | null;
}

function formatNumber(value: number | undefined): string | null {
	if (value == null || !Number.isFinite(value)) return null;
	return value.toLocaleString("en-US");
}

export function OrderReviewSheet({ review, onConfirm, onCancel, confirmDisabled, disabledReason }: OrderReviewSheetProps) {
	const { t, locale } = useWidgetI18n();
	// O6: khi review mở, nút submit đã unmount ⇒ focus rơi về body. Đưa focus vào
	// chính sheet để screen-reader đọc được tóm tắt trước khi user bấm.
	const sheetRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		sheetRef.current?.focus();
	}, []);
	const sideLabel =
		review.side === "buy"
			? t("widget.trading.buy", { defaultValue: "Buy" })
			: t("widget.trading.sell", { defaultValue: "Sell" });
	const rows: { key: string; label: string; value: string; testId?: string }[] = [
		{ key: "side", label: t("widget.trading.side", { defaultValue: "Side" }), value: sideLabel },
		{ key: "symbol", label: t("widget.trading.symbol", { defaultValue: "Symbol" }), value: review.symbol },
		{
			key: "type",
			label: t("widget.trading.orderType", { defaultValue: "Order type" }),
			value: formatOrderTypeLabel(review.type, locale === "en" ? "en" : "vi"),
		},
		{
			key: "quantity",
			label: t("widget.trading.quantity", { defaultValue: "Quantity" }),
			value: formatNumber(review.quantity) ?? "-",
		},
		{
			key: "price",
			label: t("widget.trading.price", { defaultValue: "Price" }),
			value: formatNumber(review.price) ?? "-",
		},
		{
			key: "notional",
			label: t("widget.trading.orderValue", { defaultValue: "Order value" }),
			value: formatNumber(review.notional) ?? "-",
			testId: "order-review-notional",
		},
	];
	const tp = formatNumber(review.takeProfitPrice);
	if (tp) rows.push({ key: "tp", label: t("widget.trading.takeProfit", { defaultValue: "Take profit" }), value: tp });
	const sl = formatNumber(review.stopLossPrice);
	if (sl) rows.push({ key: "sl", label: t("widget.trading.stopLoss", { defaultValue: "Stop loss" }), value: sl });
	const margin = formatNumber(review.requiredMargin);
	if (margin) {
		rows.push({
			key: "margin",
			label: t("widget.trading.requiredMargin", { defaultValue: "Required margin" }),
			value: margin,
		});
	}
	rows.push({
		key: "buyingPower",
		label: t("widget.trading.buyingPower", { defaultValue: "Buying power" }),
		value: formatNumber(review.buyingPower) ?? "-",
	});

	return (
		<div className={styles.review} data-testid="order-review" ref={sheetRef} tabIndex={-1}>
			<div className={styles.reviewTitle}>{t("widget.trading.reviewTitle", { defaultValue: "Confirm order" })}</div>
			<dl className={styles.reviewRows}>
				{rows.map((row) => (
					<div className={styles.reviewRow} key={row.key}>
						<dt className={styles.reviewLabel}>{row.label}</dt>
						<dd className={styles.reviewValue} data-testid={row.testId}>{row.value}</dd>
					</div>
				))}
			</dl>
			{disabledReason ? (
				<div className={styles.error} data-testid="order-review-error">
					{disabledReason}
				</div>
			) : null}
			<div className={styles.reviewActions}>
				<button type="button" data-testid="order-review-cancel" onClick={onCancel}>
					{t("widget.trading.cancel", { defaultValue: "Cancel" })}
				</button>
				<button
					type="button"
					data-testid="order-review-confirm"
					className={review.side === "buy" ? styles.submitBuy : styles.submitSell}
					disabled={confirmDisabled}
					onClick={onConfirm}
				>
					{t("widget.trading.confirm", { defaultValue: "Confirm" })}
				</button>
			</div>
		</div>
	);
}
