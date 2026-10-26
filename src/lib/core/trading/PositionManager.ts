// Task 03: PMS — Netting (default) / Hedging, giá vốn bình quân,
// đóng một phần, đảo chiều, T+2 availableQuantity. PnL theo giá vốn bình quân.
import type { ExitReason, PositionSide, TradingPosition } from "./types";

export interface PositionManagerOptions {
	hedgingMode?: boolean;
	/** Hệ số nhân hợp đồng (phái sinh VN30: 100000). Default 1 cho spot. */
	contractMultiplier?: number;
	/** S5: phương pháp giá vốn cho vị thế MỞ MỚI ("average" mặc định). */
	costBasisMethod?: CostBasisMethod;
}

export type CostBasisMethod = "average" | "fifo";

/** S5: một lô mua/bán của vị thế FIFO (timestamp immutable để audit). */
export interface PositionLot {
	lotId: string;
	quantity: number;
	price: number;
	timestamp: number;
}

export interface OpenPositionRequest {
	symbol: string;
	side: PositionSide;
	quantity: number;
	price: number;
	timestamp: number;
	settlementDate?: number;
	/** S5: commission + tax already charged for this fill. Carried to the close. */
	entryFees?: number;
}

export interface ClosePositionResult {
	closedQuantity: number;
	realizedPnl: number;
	/**
	 * S5: fees charged when this position was OPENED, attributed to the close.
	 *
	 * `realizedPnl` is the price difference only. The fee for the ENTRY leg was
	 * already taken out of cash when the position opened, so a consumer that reports
	 * "net P&L for this round trip" has to subtract it too - otherwise the entry fee
	 * is missing from the trade record while still being missing from the cash total,
	 * and the two never reconcile. That gap was exactly 12,850 on a 100-share FPT
	 * round trip, which is what the netPnl invariant test caught.
	 */
	entryFees: number;
	remaining: TradingPosition | null;
}

function dirOf(side: PositionSide): number {
	return side === "long" ? 1 : -1;
}

export class PositionManager {
	private readonly hedgingMode: boolean;
	private readonly multiplier: number;
	private costBasisMethod: CostBasisMethod;
	private readonly positions = new Map<string, TradingPosition>();
	/**
	 * S5: sidecar FIFO lots keyed by position id (không đụng TradingPosition
	 * type → storage tương thích; vị thế mở trước khi bật fifo giữ average).
	 */
	private readonly lots = new Map<string, PositionLot[]>();
	private seq = 0;
	private lotSeq = 0;

	constructor(options: PositionManagerOptions = {}) {
		this.hedgingMode = options.hedgingMode ?? false;
		this.multiplier = options.contractMultiplier ?? 1;
		this.costBasisMethod = options.costBasisMethod ?? "average";
	}

	/** S2/S5: đổi method — chỉ áp dụng vị thế MỞ MỚI (prospective, §10 Q2). */
	setCostBasisMethod(method: CostBasisMethod): void {
		this.costBasisMethod = method;
	}

	clear(): void {
		this.positions.clear();
		this.lots.clear();
		this.seq = 0;
		this.lotSeq = 0;
	}

	/**
	 * S5: khớp đóng `quantity` vào các lô cũ nhất, trả realized + cập nhật
	 * entryPrice = bình quân gia quyền các lô còn lại (giữ updateMarkPrice
	 * và mọi công thức hiển thị nguyên vẹn ở cả 2 mode).
	 */
	private matchCloseLots(position: TradingPosition, quantity: number, exitPrice: number): number {
		const positionLots = this.lots.get(position.id);
		if (!positionLots || positionLots.length === 0) {
			return (exitPrice - position.entryPrice) * dirOf(position.side) * quantity * this.multiplier;
		}
		let remaining = quantity;
		let realized = 0;
		while (remaining > 0 && positionLots.length > 0) {
			const lot = positionLots[0];
			const take = Math.min(remaining, lot.quantity);
			realized += (exitPrice - lot.price) * dirOf(position.side) * take * this.multiplier;
			lot.quantity -= take;
			remaining -= take;
			if (lot.quantity <= 0) positionLots.shift();
		}
		const leftQty = positionLots.reduce((sum, lot) => sum + lot.quantity, 0);
		if (leftQty > 0) {
			position.entryPrice =
				positionLots.reduce((sum, lot) => sum + lot.quantity * lot.price, 0) / leftQty;
		}
		return realized;
	}

	private trackLot(position: TradingPosition, quantity: number, price: number, timestamp: number): void {
		const positionLots = this.lots.get(position.id) ?? [];
		positionLots.push({ lotId: `lot_${++this.lotSeq}`, quantity, price, timestamp });
		this.lots.set(position.id, positionLots);
	}

	/** Hydrate từ storage (Task 06). */
	restoreState(positions: TradingPosition[]): void {
		this.clear();
		for (const position of positions) {
			this.positions.set(position.id, { ...position });
			const n = Number(/^pos_(\d+)$/.exec(position.id)?.[1]);
			if (Number.isInteger(n) && n >= this.seq) this.seq = n + 1;
		}
	}

	listPositions(): TradingPosition[] {
		return [...this.positions.values()];
	}

	getPositionById(positionId: string): TradingPosition | undefined {
		return this.positions.get(positionId);
	}

	getPosition(symbol: string): TradingPosition | undefined {
		return this.listPositions().find((p) => p.symbol === symbol);
	}

	openPosition(request: OpenPositionRequest): TradingPosition {
		if (!Number.isFinite(request.quantity) || request.quantity <= 0) {
			throw new Error("Position quantity must be positive");
		}
		if (!Number.isFinite(request.price) || request.price <= 0) {
			throw new Error("Position price must be positive");
		}
		const sameSide = this.listPositions().find((p) => p.symbol === request.symbol && p.side === request.side);
		if (sameSide) {
			sameSide.entryPrice =
				(sameSide.quantity * sameSide.entryPrice + request.quantity * request.price) /
				(sameSide.quantity + request.quantity);
			sameSide.quantity += request.quantity;
			sameSide.availableQuantity += request.settlementDate == null ? request.quantity : 0;
			sameSide.updatedAt = request.timestamp;
			if (this.costBasisMethod === "fifo" && this.lots.has(sameSide.id)) {
				this.trackLot(sameSide, request.quantity, request.price, request.timestamp);
			}
			return sameSide;
		}
		if (!this.hedgingMode) {
			const opposite = this.listPositions().find((p) => p.symbol === request.symbol);
			if (opposite) return this.offsetOpposite(opposite, request);
		}
		return this.createPosition(request);
	}

	private offsetOpposite(existing: TradingPosition, request: OpenPositionRequest): TradingPosition {
		const dir = dirOf(existing.side);
		const fifo = this.costBasisMethod === "fifo" && this.lots.has(existing.id);
		if (request.quantity < existing.quantity) {
			const realized = fifo
				? this.matchCloseLots(existing, request.quantity, request.price)
				: (request.price - existing.entryPrice) * dir * request.quantity * this.multiplier;
			existing.quantity -= request.quantity;
			existing.availableQuantity = Math.max(0, existing.availableQuantity - request.quantity);
			existing.realizedPnl += realized;
			existing.updatedAt = request.timestamp;
			return existing;
		}
		const realized = fifo
			? this.matchCloseLots(existing, existing.quantity, request.price)
			: (request.price - existing.entryPrice) * dir * existing.quantity * this.multiplier;
		this.positions.delete(existing.id);
		this.lots.delete(existing.id);
		const remainder = request.quantity - existing.quantity;
		const realizedTotal = existing.realizedPnl + realized;
		if (remainder === 0) {
			return { ...existing, quantity: 0, availableQuantity: 0, realizedPnl: realizedTotal };
		}
		const reversed = this.createPosition({
			symbol: request.symbol,
			side: request.side,
			quantity: remainder,
			price: request.price,
			timestamp: request.timestamp,
		});
		reversed.realizedPnl = realizedTotal;
		return reversed;
	}

	private createPosition(request: OpenPositionRequest): TradingPosition {
		const position: TradingPosition = {
			id: `pos_${++this.seq}`,
			symbol: request.symbol,
			side: request.side,
			quantity: request.quantity,
			availableQuantity: request.settlementDate == null ? request.quantity : 0,
			entryPrice: request.price,
			currentPrice: request.price,
			unrealizedPnl: 0,
			realizedPnl: 0,
			entryFees: request.entryFees ?? 0,
			settlementDate: request.settlementDate,
			createdAt: request.timestamp,
			updatedAt: request.timestamp,
		};
		this.positions.set(position.id, position);
		if (this.costBasisMethod === "fifo") {
			this.trackLot(position, request.quantity, request.price, request.timestamp);
		}
		return position;
	}

	closePosition(
		positionId: string,
		quantity: number,
		exitPrice: number,
		timestamp: number,
		_reason?: ExitReason,
		options?: { enforceAvailable?: boolean },
	): ClosePositionResult {
		const position = this.positions.get(positionId);
		if (!position) throw new Error(`Position not found: ${positionId}`);
		const enforceAvailable = options?.enforceAvailable ?? true;
		const limit = enforceAvailable ? position.availableQuantity : position.quantity;
		if (!Number.isFinite(quantity) || quantity <= 0 || quantity > limit) {
			throw new Error("Close quantity exceeds available quantity");
		}
		const fifo = this.costBasisMethod === "fifo" && this.lots.has(position.id);
		const realized = fifo
			? this.matchCloseLots(position, quantity, exitPrice)
			: (exitPrice - position.entryPrice) * dirOf(position.side) * quantity * this.multiplier;
		const quantityBefore = position.quantity;
		position.quantity -= quantity;
		position.availableQuantity = Math.max(0, position.availableQuantity - quantity);
		position.realizedPnl += realized;
		position.updatedAt = timestamp;
		// S5: the entry fee is pro-rated onto the quantity being closed, so a partial exit
		// carries its share and the rest stays on the position for the next close.
		const heldEntryFees = position.entryFees ?? 0;
		const entryFees = quantityBefore > 0 ? (heldEntryFees * quantity) / quantityBefore : 0;
		const remainingEntryFees = heldEntryFees - entryFees;
		if (position.quantity === 0) {
			this.positions.delete(positionId);
			this.lots.delete(positionId);
			return { closedQuantity: quantity, realizedPnl: realized, entryFees, remaining: null };
		}
		position.entryFees = remainingEntryFees;
		return {
			closedQuantity: quantity,
			realizedPnl: realized,
			entryFees,
			remaining: position,
		};
	}

	updateMarkPrice(symbol: string, price: number, timestamp: number): void {
		for (const position of this.positions.values()) {
			if (position.symbol !== symbol) continue;
			position.currentPrice = price;
			position.unrealizedPnl = (price - position.entryPrice) * dirOf(position.side) * position.quantity * this.multiplier;
			position.updatedAt = timestamp;
		}
	}

	applySettlement(now: number): void {
		for (const position of this.positions.values()) {
			if (position.settlementDate != null && now >= position.settlementDate) {
				position.availableQuantity = position.quantity;
				position.updatedAt = now;
			}
		}
	}
}
