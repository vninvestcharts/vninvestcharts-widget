// Task 07: OrderTicketModal — phiếu đặt lệnh qua Portal (.vnsc-root).
// Task TVP-B1: rút gọn thành wrapper mỏng quanh OrderTicketForm dùng chung
// với Dock Panel. Mọi logic/state/testids nằm trong Form (tests cũ giữ nguyên).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MarketRules } from "../../../lib/core/trading/MarketRules";
import type { OrderType, OrderValidationInput, TradingPosition } from "../../../lib/core/trading/types";
import { OrderTicketForm, type OrderTicketAccount } from "./OrderTicketForm";
import styles from "./OrderTicketModal.module.css";

export type { OrderTicketAccount };

export interface OrderTicketModalProps {
	open: boolean;
	side: "buy" | "sell";
	symbol: string;
	lastPrice: number;
	rules: MarketRules;
	account: OrderTicketAccount;
	currentPosition?: TradingPosition | null;
	mountTarget?: Element | null;
	onClose: () => void;
	onSubmit: (order: OrderValidationInput) => void;
	/** Edit-mode (Task 10): prefill + lưu qua onModify thay vì đặt lệnh mới. */
	initialValues?: { price?: number; stopPrice?: number };
	initialQuantity?: number;
	initialType?: OrderType;
	editOrderId?: string;
	onModify?: (orderId: string, patch: { price?: number; stopPrice?: number }) => void;
}

export function OrderTicketModal({
	open,
	mountTarget,
	onClose,
	...formProps
}: OrderTicketModalProps) {
	const anchorRef = useRef<HTMLDivElement>(null);
	const [target, setTarget] = useState<Element | null>(null);

	useEffect(() => {
		if (!open || typeof document === "undefined") return;
		// Ticket portal lên workspace root (multi) để fixed overlay phủ toàn viewport:
		// portal vào .vnsc-root của cell sẽ bị slot kẹp/đè theo DOM-order từng ô (bug 2x2).
		// Single-chart không có workspace root nên rớt về root của chính chart (giữ nguyên).
		const anchor = anchorRef.current;
		setTarget(
			mountTarget ?? anchor?.closest(".vnsc-multicharts-root") ?? anchor?.closest(".vnsc-root") ?? document.body,
		);
	}, [open, mountTarget]);

	useEffect(() => {
		if (!open) return;
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [open, onClose]);

	if (!open) return null;

	const dialog = (
		<div className={styles.overlay} data-testid="order-ticket-overlay" onClick={(e) => {
			if (e.target === e.currentTarget) onClose();
		}}>
			<OrderTicketForm {...formProps} onClose={onClose} />
		</div>
	);

	return (
		<>
			<div ref={anchorRef} style={{ display: "none" }} />
			{target ? createPortal(dialog, target) : dialog}
		</>
	);
}
