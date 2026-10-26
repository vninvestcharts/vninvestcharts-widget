// Task TVP-B1: TradingDockPanel — ticket dock 280px cho sidebar (TV parity).
// Dùng chung orderTicketModel + RiskCalculatorView + i18n + css ticket (không
// duplicate logic đặt lệnh). Modal độc lập tiếp tục tồn tại (co-existence).
import { useEffect, useRef, useState } from "react";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import { isVnProfile, type MarketRules } from "../../../lib/core/trading/MarketRules";
import type { OrderSide, OrderType, OrderValidationInput, TimeInForce, TradingPosition } from "../../../lib/core/trading/types";
import { RiskCalculatorView } from "./RiskCalculatorView";
import {
	buildCandidate,
	buildOrderReview,
	formatSubmitSummary,
	offsetTicksToPrice,
	parseNumber,
	riskPercentToDistance,
	validateCandidate,
} from "./orderTicketModel";
import { OrderReviewSheet } from "./OrderReviewSheet";
import type { OrderTicketAccount } from "./OrderTicketForm";
import type { SeriesTier } from "../../../lib/core";
import styles from "./OrderTicketModal.module.css";
import dockStyles from "./TradingDockPanel.module.css";

export type ExitUnit = "price" | "ticks" | "percent";

export interface TradingDockPanelProps {
	side?: OrderSide;
	symbol: string;
	lastPrice: number;
	rules: MarketRules;
	account: OrderTicketAccount;
	currentPosition?: TradingPosition | null;
	onSubmit: (order: OrderValidationInput) => void;
	onClose?: () => void;
	/**
	 * Unified paper-trading gate: when false the submit button is disabled
	 * (same TradingContext.tradingEnabled source as the quick-trade header).
	 */
	disabled?: boolean;
	/**
	 * S5b/S1: quyền đặt lệnh nâng cao (trailing_stop cần `paper_advanced`).
	 * `undefined` = legacy (không gate). Truyền `tierGated.allows("paper_advanced")`
	 * để license `caps` cũng được tôn trọng — suy ra từ `toSeriesTier(tier)` sẽ bỏ
	 * qua narrowing, đó chính là bug hai-nguồn-sự-thật của S1.
	 */
	canUseAdvancedOrders?: boolean;
	/**
	 * O6/replay_trading (13.03 §4): sub-gate ô đặt lệnh khi chạy trong replay.
	 * Chỉ khóa đúng một chiều (replay === true && grant === false); live không
	 * ảnh hưởng, `undefined` = legacy (không gate) — cùng quy ước với
	 * `canUseAdvancedOrders`. Truyền `tierGated.allows("replay_trading")`.
	 */
	canUseReplayTrading?: boolean;
	/** Chế độ replay của chart chứa ticket (host truyền, xem VNInvestCharts). */
	isReplayMode?: boolean;
}

export function TradingDockPanel({
	side: initialSide = "buy",
	symbol,
	lastPrice,
	rules,
	account,
	currentPosition,
	onSubmit,
	onClose,
	disabled = false,
	canUseAdvancedOrders,
	canUseReplayTrading,
	isReplayMode,
}: TradingDockPanelProps) {
	const { t, locale } = useWidgetI18n();
	const [side, setSide] = useState<OrderSide>(initialSide);
	const [orderType, setOrderType] = useState<OrderType>("limit");
	// P1.2b: TIF selector (mã quốc tế GTC/DAY/IOC/FOK — không cần i18n key).
	const [timeInForce, setTimeInForce] = useState<TimeInForce>("GTC");
	const [priceText, setPriceText] = useState(() => (lastPrice > 0 ? String(lastPrice) : ""));
	const userEditedPriceRef = useRef(false);
	const prevSymbolRef = useRef(symbol);

	useEffect(() => {
		if (prevSymbolRef.current !== symbol) {
			prevSymbolRef.current = symbol;
			userEditedPriceRef.current = false;
			if (lastPrice > 0) {
				setPriceText(String(lastPrice));
			}
			return;
		}
		if (!userEditedPriceRef.current && priceText === "" && lastPrice > 0) {
			setPriceText(String(lastPrice));
		}
	}, [symbol, lastPrice, priceText]);

	const [useOffset, setUseOffset] = useState(false);
	const [offsetText, setOffsetText] = useState("1");
	const [quantity, setQuantity] = useState(rules.lotSize);
	// Draft text while typing (null = show committed quantity).
	const [qtyDraft, setQtyDraft] = useState<string | null>(null);
	const [exitUnit, setExitUnit] = useState<ExitUnit>("price");
	const [tpText, setTpText] = useState("");
	const [slText, setSlText] = useState("");
	const [trailText, setTrailText] = useState("5");
	// Pha 1 trust fixes: bấm submit chỉ MỞ review, chưa bắn lệnh (AC1).
	const [reviewing, setReviewing] = useState(false);
	// Pha 2 (P2-6): chế độ gọn — market nhanh, ẩn TP/SL/risk.
	const [quickMode, setQuickMode] = useState(false);

	const handleSideChange = (newSide: OrderSide) => {
		setSide(newSide);
		if (priceText === "" && lastPrice > 0) {
			setPriceText(String(lastPrice));
		}
	};

	// S5b: trailing_stop là lệnh nâng cao (chỉ pro+). Free thấy tab khóa, không chọn/submit được.
	const isAdvancedOrderLocked = (type: OrderType): boolean =>
		type === "trailing_stop" && canUseAdvancedOrders !== undefined && !canUseAdvancedOrders;
	// O6: trong replay mà thiếu grant `replay_trading` thì khóa toàn bộ submit.
	const isReplayTradingLocked = isReplayMode === true && canUseReplayTrading === false;

	const handleOrderTypeChange = (newType: OrderType) => {
		if (isAdvancedOrderLocked(newType)) return;
		setOrderType(newType);
		if ((newType === "limit" || newType === "plo" || newType === "stop" || newType === "trailing_stop") && priceText === "" && lastPrice > 0) {
			setPriceText(String(lastPrice));
		}
		if (newType === "trailing_stop" && trailText === "") {
			setTrailText("5");
		}
	};

	const tickSize = rules.getTickSize(lastPrice);
	const mult = rules.contractMultiplier ?? 1;
	const limitPrice =
		orderType === "limit" || orderType === "plo"
			? orderType === "limit" && useOffset
				? offsetTicksToPrice(lastPrice, side, parseNumber(offsetText) ?? 0, tickSize)
				: parseNumber(priceText)
			: undefined;
	const stopPrice = orderType === "stop" || orderType === "trailing_stop" ? parseNumber(priceText) : undefined;
	const entryRef = limitPrice ?? stopPrice ?? lastPrice;
	const dirTp = side === "buy" ? 1 : -1;

	const toExitPrice = (text: string, isTakeProfit: boolean): number | undefined => {
		if (exitUnit === "price") return parseNumber(text);
		const value = parseNumber(text);
		if (value == null) return undefined;
		const dir = isTakeProfit ? dirTp : -dirTp;
		if (exitUnit === "ticks") {
			return entryRef + dir * value * tickSize;
		}
		const distance = riskPercentToDistance(value, account.equity, quantity, mult);
		if (distance == null) return undefined;
		return entryRef + dir * distance;
	};

	const tpPrice = toExitPrice(tpText, true);
	const slPrice = toExitPrice(slText, false);
	const trailTicks = orderType === "trailing_stop" ? parseNumber(trailText) : undefined;
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
		timeInForce,
	});
	const validation = validateCandidate(candidate, rules, { ...account, baseCurrency: rules.baseCurrency }, lastPrice, currentPosition ?? undefined);
	const missingPrice =
		(orderType === "limit" || orderType === "plo") && limitPrice == null
			? t("widget.trading.price", { defaultValue: "Price" })
			: (orderType === "stop" || orderType === "trailing_stop") && stopPrice == null
				? t("widget.trading.stopPrice", { defaultValue: "Stop price" })
				: null;
	const missingTrailDelta =
		orderType === "trailing_stop" && (trailTicks == null || !(trailTicks > 0))
			? t("widget.trading.trailingDelta", { defaultValue: "Trail (ticks)" })
			: null;
	const error = !validation.ruleOk
		? validation.ruleReason
		: !validation.riskOk
			? validation.riskReason
			: missingPrice
				? missingPrice
				: missingTrailDelta;
	const summary = formatSubmitSummary({
		side,
		quantity,
		symbol,
		price: limitPrice ?? stopPrice,
		type: orderType,
		locale: locale === "en" ? "en" : "vi",
	});
	const review = buildOrderReview({
		candidate,
		markPrice: lastPrice,
		contractMultiplier: mult,
		requiredMargin: validation.requiredMargin,
		buyingPower: account.buyingPower,
	});

	return (
		<div className={dockStyles.dock} data-testid="trading-dock-panel" data-quick={quickMode ? "1" : "0"}>
			<label className={styles.row} style={{ justifyContent: "space-between" }}>
				<span className={dockStyles.tifLabel}>{t("widget.trading.quickMode", { defaultValue: "Quick (market only)" })}</span>
				<input
					type="checkbox"
					data-testid="dock-quick-mode"
					checked={quickMode}
					onChange={(e) => setQuickMode(e.target.checked)}
				/>
			</label>
			<div className={styles.header}>
				<span data-testid="dock-title">
					{side === "buy"
						? t("widget.trading.ticketBuyTitle", { defaultValue: "Buy {symbol}", symbol })
						: t("widget.trading.ticketSellTitle", { defaultValue: "Sell {symbol}", symbol })}
				</span>
				{onClose && (
					<button type="button" className={styles.closeBtn} data-testid="dock-close" onClick={onClose}>
						✕
					</button>
				)}
			</div>
			{reviewing ? (
				<OrderReviewSheet
					review={review}
					confirmDisabled={disabled || error != null}
					disabledReason={error ?? null}
					onCancel={() => setReviewing(false)}
					onConfirm={() => {
						if (disabled || error != null) return;
						setReviewing(false);
						onSubmit(candidate);
					}}
				/>
			) : (
				<>
					{currentPosition && currentPosition.quantity !== 0 && (
						<div className={dockStyles.positionRow} data-testid="dock-position">
							<span>{t("widget.trading.position", { defaultValue: "Position" })}: {currentPosition.quantity.toLocaleString("en-US")} @ {currentPosition.entryPrice.toLocaleString("en-US")}</span>
							<span>{t("widget.trading.unrealizedPnl", { defaultValue: "P&L" })}: {currentPosition.unrealizedPnl.toLocaleString("en-US")}</span>
						</div>
					)}
					<div className={styles.tabs} role="tablist">
						{(["buy", "sell"] as const).map((s) => (
							<button
								key={s}
								type="button"
								role="tab"
								aria-selected={side === s}
								className={side === s ? styles.activeTab : styles.tab}
								data-testid={`dock-side-${s}`}
								onClick={() => handleSideChange(s)}
							>
								{s === "buy" ? t("widget.trading.buy", { defaultValue: "Buy" }) : t("widget.trading.sell", { defaultValue: "Sell" })}
							</button>
						))}
					</div>
					<div className={styles.tabs} role="tablist">
						{(isVnProfile(rules.profile)
							? (["market", "limit", "stop", "trailing_stop", "ato", "atc", "mp", "mtl", "plo"] as const)
							: (["market", "limit", "stop", "trailing_stop"] as const)
						).map((type) => {
							const locked = isAdvancedOrderLocked(type);
							return (
								<button
									key={type}
									type="button"
									role="tab"
									aria-selected={orderType === type}
									className={orderType === type ? styles.activeTab : styles.tab}
									data-testid={`dock-type-${type}`}
									disabled={locked}
									title={locked ? (t("premium.upgrade") || "Upgrade Now") : undefined}
									onClick={() => handleOrderTypeChange(type)}
								>
									{t(`widget.trading.${type}`, { defaultValue: type.toUpperCase() })}{locked ? " 🔒 Pro" : ""}
								</button>
							);
						})}
					</div>
					<label className={dockStyles.tifRow} data-testid="dock-tif-row">
						<span className={dockStyles.tifLabel}>{t("widget.trading.timeInForce", { defaultValue: "Time in force" })}</span>
						<select
							className={dockStyles.tifSelect}
							data-testid="dock-tif"
							value={timeInForce}
							onChange={(e) => setTimeInForce(e.target.value as TimeInForce)}
						>
							{(["GTC", "DAY", "IOC", "FOK"] as const).map((tif) => (
								<option key={tif} value={tif} data-testid={`dock-tif-${tif}`}>
									{tif}
								</option>
							))}
						</select>
					</label>
					{(orderType === "limit" || orderType === "plo") && (
						<>
							<label className={styles.field}>
								{t("widget.trading.price", { defaultValue: "Price" })}
								<input
									data-testid="dock-price"
									inputMode="decimal"
									value={priceText}
									onChange={(e) => {
										userEditedPriceRef.current = true;
										setPriceText(e.target.value);
									}}
									disabled={orderType === "limit" && useOffset}
								/>
							</label>
							{orderType === "limit" && (
								<>
									<label className={styles.row}>
										<input
											type="checkbox"
											data-testid="dock-offset-check"
											checked={useOffset}
											onChange={(e) => {
												const next = e.target.checked;
												setUseOffset(next);
												// R5: bỏ check offset mà giá rỗng → điền lại lastPrice.
												if (!next && priceText === "" && lastPrice > 0) {
													setPriceText(String(lastPrice));
												}
											}}
										/>
										{t("widget.trading.offsetFromMark", { defaultValue: "Offset from market (ticks)" })}
									</label>
									{useOffset && (
										<label className={styles.field}>
											{t("widget.trading.offsetTicks", { defaultValue: "Offset ticks" })}
											<input data-testid="dock-offset-ticks" inputMode="numeric" value={offsetText} onChange={(e) => setOffsetText(e.target.value)} />
										</label>
									)}
								</>
							)}
						</>
					)}
					{(orderType === "stop" || orderType === "trailing_stop") && (
						<label className={styles.field}>
							{t("widget.trading.stopPrice", { defaultValue: "Stop price" })}
							<input
								data-testid="dock-price"
								inputMode="decimal"
								value={priceText}
								onChange={(e) => {
									userEditedPriceRef.current = true;
									setPriceText(e.target.value);
								}}
							/>
						</label>
					)}
					{orderType === "stop" && (
						<div className={dockStyles.hint} data-testid="dock-stop-hint">
							{t("widget.trading.stopTypeHint", { defaultValue: "Stop-market: when price touches the stop level, the order fills at market (stop-market). Stop-limit (trigger + limit price) isn't supported yet." })}
						</div>
					)}
					{(orderType === "trailing_stop" || slText.trim() !== "") && (
						<label className={styles.field}>
							{t("widget.trading.trailingDelta", { defaultValue: "Trail (ticks)" })}
							<input data-testid="dock-trail-ticks" inputMode="numeric" value={trailText} onChange={(e) => setTrailText(e.target.value.replace(/[^0-9]/g, ""))} />
						</label>
					)}
					<label className={styles.field}>
						{t("widget.trading.quantity", { defaultValue: "Quantity" })}
						<input
							data-testid="dock-qty"
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
					<div
						className={styles.row}
						role="group"
						aria-label={t("widget.trading.quantity", { defaultValue: "Quantity" })}
					>
						{([25, 50, 75, 100] as const).map((pct) => {
							const refPrice = limitPrice ?? stopPrice ?? (lastPrice > 0 ? lastPrice : undefined);
							const lot = Math.max(1, rules.lotSize);
							const raw = refPrice != null && refPrice > 0
								? Math.floor(((pct / 100) * account.buyingPower) / refPrice / lot) * lot
								: 0;
							const chipQty = Math.max(lot, raw);
							return (
								<button
									key={pct}
									type="button"
									className={styles.tab}
									data-testid={`dock-qty-pct-${pct}`}
									disabled={refPrice == null}
									onClick={() => {
										setQuantity(chipQty);
										setQtyDraft(null);
									}}
								>
									{pct}%
								</button>
							);
						})}
					</div>
					<div className={styles.row}>
						<span className={styles.sectionLabel}>{t("widget.trading.exitUnit", { defaultValue: "TP/SL unit" })}</span>
						{(["price", "ticks", "percent"] as const).map((unit) => (
							<button
								key={unit}
								type="button"
								aria-pressed={exitUnit === unit}
								className={exitUnit === unit ? styles.activeTab : styles.tab}
								data-testid={`dock-exit-${unit}`}
								onClick={() => setExitUnit(unit)}
							>
								{unit === "price"
									? t("widget.trading.unitPrice", { defaultValue: "Price" })
									: unit === "ticks"
										? t("widget.trading.unitTicks", { defaultValue: "Ticks" })
										: t("widget.trading.unitPercent", { defaultValue: "% equity" })}
							</button>
						))}
					</div>
					{!quickMode && (
						<>
							<div className={dockStyles.dualField + " dock-tpsl"}>
								<label className={styles.field}>
									{t("widget.trading.takeProfit", { defaultValue: "Take profit" })}
									<input data-testid="dock-tp" inputMode="decimal" value={tpText} onChange={(e) => setTpText(e.target.value)} />
								</label>
								<label className={styles.field}>
									{t("widget.trading.stopLoss", { defaultValue: "Stop loss" })}
									<input data-testid="dock-sl" inputMode="decimal" value={slText} onChange={(e) => setSlText(e.target.value)} />
								</label>
							</div>
							<div className={styles.row}>
								{([1, 2] as const).map((pct) => (
									<button
										key={pct}
										type="button"
										className={styles.tab}
										data-testid={`dock-sl-preset-${pct}`}
										disabled={entryRef <= 0}
										onClick={() => {
											const dist = riskPercentToDistance(pct, account.equity, quantity, mult);
											if (dist == null) return;
											const price = side === "buy" ? entryRef - dist : entryRef + dist;
											setSlText(String(Math.round(price / tickSize) * tickSize));
										}}
									>
									-{pct}%
									</button>
								))}
							</div>
							<div className={dockStyles.riskCompact}>
								<RiskCalculatorView
									entryPrice={entryRef}
									quantity={quantity}
									takeProfitPrice={tpPrice}
									stopLossPrice={slPrice}
									contractMultiplier={mult}
									accountEquity={account.equity}
								/>
							</div>
						</>
					)}
					{error && (
						<div className={styles.error} data-testid="dock-error">
							{error}
						</div>
					)}
					<button
						type="button"
						className={side === "buy" ? dockStyles.submitBar : `${dockStyles.submitBar} ${dockStyles.submitBarSell}`}
						data-testid="dock-submit"
						disabled={disabled || error != null || isAdvancedOrderLocked(orderType) || isReplayTradingLocked}
						title={disabled || isReplayTradingLocked ? t("dock.tradingDisabled") : summary}
						aria-disabled={disabled || isReplayTradingLocked}
						onClick={() => {
							if (isAdvancedOrderLocked(orderType) || isReplayTradingLocked) return;
							// AC1: bước 1 chỉ mở review — lệnh chưa bắn cho tới khi user Xác nhận.
							setReviewing(true);
						}}
					>
						{summary}
					</button>
				</>
			)}
		</div>
	);
}
