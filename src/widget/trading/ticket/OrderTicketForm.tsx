// Task TVP-B1: OrderTicketForm — thân form đặt lệnh dùng chung Modal + Dock.
// Tách nguyên vẹn logic/state từ OrderTicketModal (testids giữ nguyên để
// 9 tests modal cũ pass không sửa). Không portal, không overlay ở đây.
import { useRef, useState } from "react";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import type { MarketRules } from "../../../lib/core/trading/MarketRules";
import type { OrderType, OrderValidationInput, TradingPosition } from "../../../lib/core/trading/types";
import { RiskCalculatorView } from "./RiskCalculatorView";
import { buildCandidate, buildOrderReview, parseNumber, validateCandidate } from "./orderTicketModel";
import { OrderReviewSheet } from "./OrderReviewSheet";
import styles from "./OrderTicketModal.module.css";

export interface OrderTicketAccount {
	equity: number;
	freeMargin: number;
	buyingPower: number;
}

export interface OrderTicketFormProps {
	side: "buy" | "sell";
	symbol: string;
	lastPrice: number;
	rules: MarketRules;
	account: OrderTicketAccount;
	currentPosition?: TradingPosition | null;
	onClose: () => void;
	onSubmit: (order: OrderValidationInput) => void;
	/** Edit-mode (Task 10): prefill + lưu qua onModify thay vì đặt lệnh mới. */
	initialValues?: { price?: number; stopPrice?: number };
	/** Qty preset từ strip (mặc định = lot của rules). */
	initialQuantity?: number;
	initialType?: OrderType;
	editOrderId?: string;
	onModify?: (orderId: string, patch: { price?: number; stopPrice?: number }) => void;
}

export function OrderTicketForm({
	side,
	symbol,
	lastPrice,
	rules,
	account,
	currentPosition,
	onClose,
	onSubmit,
	initialValues,
	initialQuantity,
	initialType,
	editOrderId,
	onModify,
}: OrderTicketFormProps) {
	const { t } = useWidgetI18n();
	const [orderType, setOrderType] = useState<OrderType>(initialType ?? "market");
	const [priceText, setPriceText] = useState(initialValues?.price != null ? String(initialValues.price) : "");
	const [stopText, setStopText] = useState(initialValues?.stopPrice != null ? String(initialValues.stopPrice) : "");
	const [quantity, setQuantity] = useState(initialQuantity ?? rules.lotSize);
	// Draft text while typing (null = show committed quantity). Lets the user
	// clear the field and type freely; commit (≥1) happens on blur/Enter.
	const [qtyDraft, setQtyDraft] = useState<string | null>(null);
	const [tpOn, setTpOn] = useState(false);
	const [tpText, setTpText] = useState("");
	const [slOn, setSlOn] = useState(false);
	const [slText, setSlText] = useState("");
	const [trailText, setTrailText] = useState("");
	const isEdit = editOrderId != null && onModify != null;
	const [editSyncKey, setEditSyncKey] = useState<string | undefined>(editOrderId);
	// Pha 1 trust fixes (AC5): đặt lệnh qua modal CŨNG phải qua bước xác nhận.
	const [reviewing, setReviewing] = useState(false);
	if (editSyncKey !== editOrderId) {
		setEditSyncKey(editOrderId);
		setPriceText(initialValues?.price != null ? String(initialValues.price) : "");
		setStopText(initialValues?.stopPrice != null ? String(initialValues.stopPrice) : "");
		if (initialType) setOrderType(initialType);
	}

	const limitPrice = orderType === "limit" ? parseNumber(priceText) : undefined;
	const stopPrice = orderType === "stop" ? parseNumber(stopText) : undefined;
	const tpPrice = tpOn ? parseNumber(tpText) : undefined;
	const slPrice = slOn ? parseNumber(slText) : undefined;
	const trailTicks = slOn ? parseNumber(trailText) : undefined;
	const { candidate } = buildCandidate({
		symbol,
		side,
		type: orderType,
		quantity,
		limitPrice,
		stopPrice,
		takeProfitPrice: tpPrice,
		stopLossPrice: slPrice,
		trailingStopDeltaTicks: trailTicks,
	});
	// Nguồn DUY NHẤT cho rules+risk (như dock) ⇒ không drift giữa 2 mặt, và có
	// `requiredMargin` cho bước xác nhận (Pha 1).
	const validation = validateCandidate(
		candidate,
		rules,
		{ ...account, baseCurrency: rules.baseCurrency },
		lastPrice,
		currentPosition ?? undefined,
	);
	const error = !validation.ruleOk
		? validation.ruleReason
		: !validation.riskOk
			? validation.riskReason
			: orderType === "limit" && limitPrice == null
				? t("widget.trading.price", { defaultValue: "Price" })
				: orderType === "stop" && stopPrice == null
					? t("widget.trading.stopPrice", { defaultValue: "Stop price" })
					: null;
	const canSaveEdit =
		orderType === "limit" ? limitPrice != null : orderType === "stop" || orderType === "trailing_stop" ? stopPrice != null : false;
	const entryPrice = limitPrice ?? stopPrice ?? lastPrice;
	const title =
		side === "buy"
			? t("widget.trading.ticketBuyTitle", { defaultValue: "Buy {symbol}", symbol })
			: t("widget.trading.ticketSellTitle", { defaultValue: "Sell {symbol}", symbol });

	const panelRef = useRef<HTMLDivElement>(null);
	const closeRef = useRef<HTMLButtonElement>(null);
	// UX-02: shared dialog focus contract — initial focus, Tab loop, Escape and
	// focus restore. The ticket previously had `role="dialog"` with no focus
	// management at all, so keyboard focus stayed on the trigger behind it.
	// AC9: khi review đang mở, Escape HUỶ review (không đóng modal). Listener của
	// useDialogFocus chạy ở capture phase trên document + stopPropagation ⇒ listener
	// window của modal không nhận event ⇒ modal không bị đóng.
	useDialogFocus(panelRef, {
		open: true,
		onEscape: reviewing ? () => setReviewing(false) : onClose,
		initialFocusRef: closeRef,
	});

	const review = buildOrderReview({
		candidate,
		markPrice: lastPrice,
		contractMultiplier: rules.contractMultiplier ?? 1,
		requiredMargin: validation.requiredMargin,
		buyingPower: account.buyingPower,
	});

	return (
		<div ref={panelRef} className={styles.modal} role="dialog" aria-modal="true" aria-label={title}>
			<div className={styles.header}>
				<span data-testid="ticket-title">{title}</span>
				<button ref={closeRef} type="button" className={styles.closeBtn} data-testid="ticket-close" onClick={onClose} aria-label={t("toast.dismiss", { defaultValue: "Close" })}>
					✕
				</button>
			</div>
			{reviewing ? (
				<OrderReviewSheet
					review={review}
					confirmDisabled={error != null}
					disabledReason={error ?? null}
					onCancel={() => setReviewing(false)}
					onConfirm={() => {
						if (error != null) return;
						setReviewing(false);
						onSubmit(candidate);
					}}
				/>
			) : (
				<>
					{isEdit ? (
						<div className={styles.tifRow} data-testid="edit-type-label">
							{t("widget.trading.editOrder", { defaultValue: "Edit order" })}: {orderType}
						</div>
					) : (
						<div className={styles.tabs} role="tablist">
							{(["market", "limit", "stop"] as const).map((type) => (
								<button
									key={type}
									type="button"
									role="tab"
									aria-selected={orderType === type}
									className={orderType === type ? styles.activeTab : styles.tab}
									data-testid={`type-${type}`}
									onClick={() => setOrderType(type)}
								>
									{t(`widget.trading.${type}`, { defaultValue: type })}
								</button>
							))}
						</div>
					)}
					{orderType === "limit" && (
						<label className={styles.field}>
							{t("widget.trading.price", { defaultValue: "Price" })}
							<input data-testid="limit-price" inputMode="decimal" value={priceText} onChange={(e) => setPriceText(e.target.value)} />
						</label>
					)}
					{orderType === "stop" && (
						<label className={styles.field}>
							{t("widget.trading.stopPrice", { defaultValue: "Stop price" })}
							<input data-testid="stop-price" inputMode="decimal" value={stopText} onChange={(e) => setStopText(e.target.value)} />
						</label>
					)}
					{isEdit ? (
						<div className={styles.tifRow} data-testid="edit-qty-label">
							{t("widget.trading.quantity", { defaultValue: "Quantity" })}: {quantity.toLocaleString("en-US")}
						</div>
					) : (
						<label className={styles.field}>
							{t("widget.trading.quantity", { defaultValue: "Quantity" })}
							<input
								data-testid="ticket-qty"
								inputMode="numeric"
								value={qtyDraft ?? String(quantity)}
								onChange={(e) => {
									const digits = e.target.value.replace(/[^0-9]/g, "");
									setQtyDraft(digits);
									if (digits !== "") {
										const parsed = Number.parseInt(digits, 10);
										if (Number.isFinite(parsed)) setQuantity(Math.max(1, parsed));
									}
								}}
								onBlur={() => {
									if (qtyDraft === null) return;
									if (qtyDraft === "") {
										setQtyDraft(null);
										return;
									}
									setQuantity(Math.max(1, Number.parseInt(qtyDraft, 10)));
									setQtyDraft(null);
								}}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										(e.target as HTMLInputElement).blur();
									}
								}}
							/>
						</label>
					)}
					{!isEdit && (
						<>
							<div className={styles.row}>
								<label>
									<input type="checkbox" data-testid="tp-check" checked={tpOn} onChange={(e) => setTpOn(e.target.checked)} />
									{t("widget.trading.takeProfit", { defaultValue: "Take profit" })}
								</label>
								{tpOn && <input data-testid="tp-price" inputMode="decimal" value={tpText} onChange={(e) => setTpText(e.target.value)} />}
							</div>
							<div className={styles.row}>
								<label>
									<input type="checkbox" data-testid="sl-check" checked={slOn} onChange={(e) => setSlOn(e.target.checked)} />
									{t("widget.trading.stopLoss", { defaultValue: "Stop loss" })}
								</label>
								{slOn && <input data-testid="sl-price" inputMode="decimal" value={slText} onChange={(e) => setSlText(e.target.value)} />}
							</div>
							{slOn && (
								<label className={styles.field}>
									{t("widget.trading.trailingDelta", { defaultValue: "Trail (ticks)" })}
									<input data-testid="trail-ticks" inputMode="numeric" value={trailText} onChange={(e) => setTrailText(e.target.value)} />
								</label>
							)}
						</>
					)}
					<div className={styles.tifRow} data-testid="tif-row">
						{t("widget.trading.timeInForce", { defaultValue: "Time in force" })}:{" "}
						{t("widget.trading.gtc", { defaultValue: "GTC" })}
					</div>
					{!isEdit && (
						<>
							<RiskCalculatorView
								entryPrice={entryPrice}
								quantity={quantity}
								takeProfitPrice={tpPrice}
								stopLossPrice={slPrice}
								contractMultiplier={rules.contractMultiplier ?? 1}
								accountEquity={account.equity}
							/>
							<div className={styles.preview} data-testid="margin-preview">
								<span>
									{t("widget.trading.buyingPower", { defaultValue: "Buying power" })}: {account.buyingPower.toLocaleString("en-US")}
								</span>
								{validation.requiredMargin != null && (
									<span>
										{t("widget.trading.requiredMargin", { defaultValue: "Required margin" })}:{" "}
										{validation.requiredMargin.toLocaleString("en-US")}
									</span>
								)}
							</div>
						</>
					)}
					{error && (
						<div className={styles.error} data-testid="ticket-error">
							{error}
						</div>
					)}
					<div className={styles.footer}>
						<button type="button" data-testid="ticket-cancel" onClick={onClose}>
							{t("widget.trading.cancel", { defaultValue: "Cancel" })}
						</button>
						<button
							type="button"
							data-testid="ticket-submit"
							className={side === "buy" ? styles.submitBuy : styles.submitSell}
							disabled={isEdit ? !canSaveEdit : error != null}
							onClick={() => {
								if (isEdit && editOrderId && onModify) {
									// Edit = sửa lệnh đã có, KHÔNG phải lệnh mới ⇒ bypass review (AC7/O7).
									onModify(editOrderId, {
										price: orderType === "limit" ? limitPrice : undefined,
										stopPrice: orderType === "stop" || orderType === "trailing_stop" ? stopPrice : undefined,
									});
									return;
								}
								// AC5: lệnh mới ⇒ mở review, chưa gửi.
								setReviewing(true);
							}}
						>
							{isEdit
								? t("widget.trading.save", { defaultValue: "Save" })
								: t("widget.trading.placeOrder", { defaultValue: "Place order" })}
						</button>
					</div>
				</>
			)}
		</div>
	);
}
