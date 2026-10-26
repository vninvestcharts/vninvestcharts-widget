// Task 10: TradingContext — single source per-chart: dual brokers Live/Replay,
// persistence, audio, ticket/edit/close-request state, panelProps builder.
// Thay thế usePaperTradingPanel (đã xóa, test migrate sang đây).
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AsyncStorageAdapter, AudioAdapter } from "@vninvestcharts/engine-react";
import { VirtualBrokerEngine } from "../../../lib/core/trading/VirtualBrokerEngine";
import { workingOrdersMargin } from "../../../lib/core/trading/orderMargin";
import { MarketDataPort } from "../../../lib/core/trading/MarketDataPort";
import { VN_SPOT_RULES, resolveMarketProfile, DEFAULT_PAPER_BALANCE_USD, type MarketRules } from "../../../lib/core/trading/MarketRules";
import type { ReplayOHLCBar } from "../../../lib/core/replay/replayTradingTypes";
import type { EnrichedDatum } from "../../../lib/core/calculators/types";
import type { OrderSide, OrderValidationInput, TradingOrder } from "../../../lib/core/trading/types";
import { InMemoryStorageAdapter } from "../../../lib/core/trading/storage/InMemoryStorageAdapter";
import { TradingStorage } from "../../../lib/core/trading/storage/TradingStorage";
import { resolvePaperEnabled, readLegacyPaperEnabled } from "../visibility/paperVisibility";
import { useOptionalWorkspacePaperVisibility } from "../../context/WorkspacePaperVisibilityContext";
import type { TradingBottomPanelProps } from "../panel/TradingBottomPanel";
import {
	registerPaperPanelBinding,
	unregisterPaperPanelBinding,
	type PaperPanelSnapshot,
} from "./PaperPanelRegistry";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import { usePaperRuntimeConfig } from "../hooks/usePaperRuntimeConfig";
import { usePaperIntegrityAlerts } from "../hooks/usePaperIntegrityAlerts";
import type { PaperRuntimeConfig } from "../config/paperRuntimeConfig";

export interface TradingReplayFeed {
	active: boolean;
	playing: boolean;
	bar: ReplayOHLCBar | null;
	timestamp: number;
}

export interface TradingProviderProps {
	symbol: string;
	bars: readonly EnrichedDatum[];
	rules?: MarketRules;
	initialBalance?: number;
	replayActive?: boolean;
	replayPlaying?: boolean;
	replayBar?: ReplayOHLCBar | null;
	/**
	 * Task 11: inject broker/port dùng chung (multi-chart singleton). Khi có,
	 * provider KHÔNG tạo engine riêng (không hydrate/reset giùm — chủ sở hữu quản lý).
	 */
	externalBroker?: VirtualBrokerEngine;
	externalPort?: MarketDataPort;
	/** A6: replay owner (useReplayTrading/useWorkspaceReplayTrading) — provider must not reset/feed it. */
	externalReplayBroker?: VirtualBrokerEngine;
	externalReplayPort?: MarketDataPort;
	/** A6: owner session epoch; internal replay book resets, external book is never reset. */
	replayEpoch?: number;
	liveStorageNamespace?: string;
	storageAdapter?: AsyncStorageAdapter;
	audioAdapter?: AudioAdapter;
	/** Task TVP-A0: prop ép bật/tắt (ưu tiên cao nhất). Mặc định đọc localStorage. */
	defaultEnabled?: boolean;
	/** Task M1+M2: định danh chart (multi) cho namespace persist + gating. */
	chartId?: string;
	/** Task M2: chỉ chart active nhận hotkey. Mặc định true (single-chart không ảnh hưởng). */
	isActiveChart?: boolean;
	children: ReactNode;
}

export interface TicketState {
	open: boolean;
	side: OrderSide;
	price?: number;
	/** Qty preset từ strip (không có = lot mặc định của rules). */
	quantity?: number;
}

export interface EditTarget {
	orderId: string;
	price?: number;
	stopPrice?: number;
}

export interface TradingContextValue {
	mode: "live" | "replay";
	symbol: string;
	rules: MarketRules;
	broker: VirtualBrokerEngine;
	port: MarketDataPort;
	tradingEnabled: boolean;
	setTradingEnabled: (enabled: boolean) => void;
	/**
	 * A4 (QUICKTRADE_PILLS): read-only từ paper config — đổi qua Settings → Execution
	 * (hoặc toggle trong panel modal). Strip đọc để quyết định click pill đặt lệnh
	 * ngay hay mở ticket.
	 */
	oneClickTrading: boolean;
	isActiveChart: boolean;
	panelProps: Omit<TradingBottomPanelProps, "onClose">;
	ticket: TicketState;
	openTicket: (side: OrderSide, price?: number, quantity?: number) => void;
	closeTicket: () => void;
	editTarget: EditTarget | null;
	startEditOrder: (orderId: string) => void;
	cancelEdit: () => void;
	closeRequested: boolean;
	requestClose: () => void;
	cancelCloseRequest: () => void;
	confirmCloseAll: () => void;
	oneKeyClose: boolean;
	setOneKeyClose: (enabled: boolean) => void;
	/** Đặt lệnh qua broker + log rejection (one-click/ticket đỡ im lặng). */
	placeOrder: (input: OrderValidationInput) => TradingOrder;
}

const TradingContext = createContext<TradingContextValue | null>(null);

export function useTradingContext(): TradingContextValue {
	const value = useContext(TradingContext);
	if (!value) throw new Error("useTradingContext must be used inside <TradingProvider>");
	return value;
}

const LOG_CAP = 200;

interface EnginePair {
	broker: VirtualBrokerEngine;
	port: MarketDataPort;
}

function barTime(bar: EnrichedDatum): number {
	const date = bar.date;
	return date instanceof Date ? date.getTime() : new Date(date).getTime();
}

const TRADING_ENABLED_KEY = "vnsc.paper.enabled";

function marketPort(): MarketDataPort {
	return new MarketDataPort({
		tickSizeProvider: (sym, price) => resolveMarketProfile(sym).getTickSize(price),
	});
}

export function liveNamespace(explicit: string | undefined, chartId: string | undefined, profile: string): string {
	return explicit ?? (chartId ? `vnsc_paper_live_${profile}_${chartId}` : `vnsc_paper_live_${profile}`);
}

function createLivePair(rules: MarketRules, initialBalance: number | undefined, storageAdapter?: AsyncStorageAdapter, namespace?: string): EnginePair {
	// NOTE: createIndexedDBAdapter là async factory — không gọi được trong render path
	// đồng bộ. Default InMemory (deterministic, test-friendly); app resolve IndexedDB
	// async rồi inject qua storageAdapter (follow-up). Xem ledger Task 10.
	const port = marketPort();
	const broker = new VirtualBrokerEngine({
		rules,
		marketDataPort: port,
		storageAdapter: storageAdapter ?? new InMemoryStorageAdapter(),
		storageNamespace: namespace ?? "vnsc_paper_live",
		initialBalance,
		// P1.1: live broker khớp market ngay tại mark (replay broker giữ nến-kế).
		fillMarketOnPlace: true,
	});
	return { broker, port };
}

function createReplayPair(rules: MarketRules): EnginePair {
	const port = marketPort();
	const broker = new VirtualBrokerEngine({ rules, marketDataPort: port });
	return { broker, port };
}

export function TradingProvider({
	symbol,
	bars,
	rules: rulesProp,
	initialBalance,
	replayActive,
	replayPlaying,
	replayBar,
	liveStorageNamespace,
	storageAdapter,
	audioAdapter,
	externalBroker,
	externalPort,
	externalReplayBroker,
	externalReplayPort,
	replayEpoch,
	defaultEnabled,
	chartId,
	isActiveChart,
	children,
}: TradingProviderProps) {
	// Task M2: chart không active (multi) không nhận hotkey. Mặc định true
	// để single-chart (không truyền prop) giữ nguyên hành vi.
	const isActive = isActiveChart ?? true;
	// Task M4: visibility suy từ matrix mỗi render (reactive theo workspace store,
	// không snapshot 1 lần như localStorage cũ). Single-chart: legacy như cũ.
	const paperVisibility = useOptionalWorkspacePaperVisibility();
	// S1 i18n: log từ chối lệnh qua key (audit:hardcoded-text), defaultValue English.
	const { t } = useWidgetI18n();
	// Toggle runtime trong session (mắt/CTA) — thắng cả prop (hợp đồng TVP-A0).
	const [localOverride, setLocalOverride] = useState<boolean | undefined>(undefined);
	const tradingEnabled = resolvePaperEnabled({
		localOverride,
		defaultEnabled,
		chartId,
		perChart: paperVisibility?.perChart,
		master: paperVisibility?.master,
		legacyEnabled: readLegacyPaperEnabled(),
	});
	const liveRef = useRef<EnginePair | null>(null);
	const replayRef = useRef<EnginePair | null>(null);
	const replayExternalRef = useRef<VirtualBrokerEngine | null>(null);
	const liveProfileRef = useRef<string | null>(null);
	// Task M3: nhớ broker ngoài đang dùng để rớt về local khi brokerFor nhả (crypto/phái sinh).
	const liveExternalRef = useRef<VirtualBrokerEngine | null>(null);
	const logRef = useRef<{ timestamp: number; message: string }[]>([]);
	// TVP-B3 fix: quy tắc theo thị trường của symbol (FPT -> spot, BTCUSDT ->
	// crypto, VN30F* -> phái sinh). Prop rules tường minh luôn thắng.
	const resolvedRules = rulesProp ?? resolveMarketProfile(symbol);
	// F-TRADE-01: lựa chọn của người dùng về cách xử lý lỗi toàn vẹn. Hook cảnh báo được
	// gọi bên dưới, SAU khi `broker` đã được suy ra — vì broker được tạo trong effect và
	// `liveRef.current` lúc render đầu vẫn là `null`. Gọi ở trên sẽ subscribe vào `null`
	// rồi không bao giờ chạy lại (ref không đổi identity ⇒ dependency không đổi).
	const paperRuntime = usePaperRuntimeConfig({
		profile: resolvedRules.profile,
		chartId,
		baseRules: resolvedRules,
	});
	const integrityMode = paperRuntime.config.integrityFailureMode;
	if (externalBroker) {
		// Task M3 shared broker (multi): dùng thẳng singleton của workspace.
		if (liveRef.current?.broker !== externalBroker) {
			liveRef.current = { broker: externalBroker, port: externalPort ?? marketPort() };
			liveProfileRef.current = null;
		}
		liveExternalRef.current = externalBroker;
	} else if (liveExternalRef.current || !liveRef.current || (liveProfileRef.current && liveProfileRef.current !== resolvedRules.profile)) {
		liveExternalRef.current = null;
		const switched = liveRef.current != null;
		const balance = initialBalance ?? (resolvedRules.baseCurrency === "USD" ? DEFAULT_PAPER_BALANCE_USD : undefined);
		// Task M1: namespace theo chartId để các chart cùng profile không đè state.
		// Không chartId (single) giữ key legacy để tương thích ngược.
		const namespace = liveNamespace(liveStorageNamespace, chartId, resolvedRules.profile);
		liveRef.current = createLivePair(resolvedRules, balance, storageAdapter, namespace);
		if (switched) {
			logRef.current = [
				...logRef.current.slice(-(LOG_CAP - 1)),
				{ timestamp: Date.now(), message: `Switched market profile (${liveProfileRef.current} -> ${resolvedRules.profile}): fresh paper book` },
			];
		}
		liveProfileRef.current = resolvedRules.profile;
	}
	if (externalReplayBroker) {
		const existing = replayRef.current;
		if (!existing || existing.broker !== externalReplayBroker || (externalReplayPort && existing.port !== externalReplayPort)) {
			replayRef.current = {
				broker: externalReplayBroker,
				port: externalReplayPort ?? existing?.port ?? marketPort(),
			};
		}
		replayExternalRef.current = externalReplayBroker;
	} else if (replayExternalRef.current) {
		replayExternalRef.current = null;
		replayRef.current = createReplayPair(resolvedRules);
	} else if (!replayRef.current) {
		replayRef.current = createReplayPair(resolvedRules);
	}
	const [tick, setTick] = useState(0);
	// Task M4: ghi xuyên qua store — multi: override riêng chart (không đụng key
	// global); single: localOverride session + key legacy để test/hành vi cũ nguyên vẹn.
	const setTradingEnabled = useCallback(
		(enabled: boolean) => {
			if (paperVisibility && chartId) {
				paperVisibility.setChart(chartId, enabled);
			} else {
				setLocalOverride(enabled);
				try {
					window.localStorage.setItem(TRADING_ENABLED_KEY, enabled ? "1" : "0");
				} catch {
					// Bỏ qua khi storage bị chặn (private mode).
				}
			}
			setTick((v) => v + 1);
		},
		[paperVisibility, chartId],
	);
	const replay: TradingReplayFeed = useMemo(() => {
		const barDate = replayBar?.date;
		return {
			active: Boolean(replayActive),
			playing: Boolean(replayPlaying),
			bar: replayBar ?? null,
			timestamp: typeof barDate === "number" ? barDate : barDate instanceof Date ? barDate.getTime() : Date.now(),
		};
	}, [replayActive, replayPlaying, replayBar]);
	const [ticket, setTicket] = useState<TicketState>({ open: false, side: "buy" });
	const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
	const [closeRequested, setCloseRequested] = useState(false);
	const [oneKeyClose, setOneKeyCloseState] = useState(false);
	const oneKeyCloseRef = useRef(false);
	const setOneKeyClose = useCallback((enabled: boolean) => {
		oneKeyCloseRef.current = enabled;
		setOneKeyCloseState(enabled);
	}, []);
	const fedRef = useRef<{ symbol: string; timestamp: number }>({ symbol: "", timestamp: Number.NEGATIVE_INFINITY });
	const fedReplayRef = useRef<number>(Number.NEGATIVE_INFINITY);
	const replayEpochRef = useRef(replayEpoch ?? 0);

	const mode: "live" | "replay" = replay.active ? "replay" : "live";
	const pair = (mode === "replay" ? replayRef.current : liveRef.current) as EnginePair;
	const broker = pair.broker;
	const port = pair.port;
	const isExternalReplay = Boolean(externalReplayBroker);

	// F-TRADE-01: nối lỗi toàn vẹn của broker vào toast, theo lựa chọn của người dùng.
	// Ở đây `broker` đã có hiệu lực (re-render mỗi khi ref đổi) nên hook subscribe đúng.
	usePaperIntegrityAlerts({ broker, mode: integrityMode });

	const pushLog = (message: string) => {
		logRef.current = [...logRef.current.slice(-(LOG_CAP - 1)), { timestamp: Date.now(), message }];
	};

	useEffect(() => {
		const offs = [
			broker.on("fill", (t) => {
				pushLog(`Fill ${t.side} ${t.fillQuantity} ${t.symbol} @ ${t.fillPrice}`);
				try {
					audioAdapter?.playAlertSound(784, 200, 0.4);
				} catch {
					// Audio best-effort.
				}
				setTick((v) => v + 1);
			}),
			broker.on("orderChange", () => setTick((v) => v + 1)),
			broker.on("positionChange", () => setTick((v) => v + 1)),
			broker.on("accountChange", () => setTick((v) => v + 1)),
		];
		return () => {
			offs.forEach((off) => off());
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [mode, audioAdapter]);

	useEffect(() => {
		// Task M3: shared broker do owner (useWorkspaceLiveTrading) hydrate — tránh N charts hydrate đè nhau.
		if (externalBroker) return;
		// Task M1 (fix race): migration CHẠY TRƯỚC hydrate trong cùng 1 effect
		// tuần tự — hydrate 2 effect riêng sẽ đọc state trước khi migrate ghi xong.
		void (async () => {
			if (chartId && storageAdapter) {
				const newNs = liveNamespace(liveStorageNamespace, chartId, resolvedRules.profile);
				const oldNs = `vnsc_paper_live_${resolvedRules.profile}`;
				if (newNs !== oldNs) {
					try {
						const store = new TradingStorage(storageAdapter, newNs);
						if (!(await store.loadState())) {
							const data = await new TradingStorage(storageAdapter, oldNs).loadState();
							if (data) await store.saveState(data);
						}
					} catch {
						// Best-effort: lỗi storage không chặn khởi động.
					}
				}
			}
			try {
				await broker.hydrate();
			} catch {
				// State hỏng: giữ session trắng thay vì crash mount.
			}
			setTick((v) => v + 1);
		})();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		const resume = () => {
			try {
				(audioAdapter as unknown as { resume?: () => void } | undefined)?.resume?.();
			} catch {
				// Bỏ qua.
			}
		};
		window.addEventListener("pointerdown", resume, { once: true });
		window.addEventListener("keydown", resume, { once: true });
		return () => {
			window.removeEventListener("pointerdown", resume);
			window.removeEventListener("keydown", resume);
		};
	}, [audioAdapter]);

	useEffect(() => {
		if (mode !== "live") return;
		const fed = fedRef.current;
		const stamped = bars
			.map((bar) => ({ bar, time: barTime(bar) }))
			.filter((b) => Number.isFinite(b.time));
		const fresh = fed.symbol !== symbol ? stamped.slice(-1) : stamped.filter((b) => b.time > fed.timestamp);
		for (const { bar, time } of fresh) {
			const replayBar = { open: bar.open, high: bar.high, low: bar.low, close: bar.close, date: bar.date };
			port.feedBar(symbol, replayBar);
			broker.onBar(symbol, replayBar, time);
		}
		if (fresh.length > 0) {
			fedRef.current = { symbol, timestamp: fresh[fresh.length - 1].time };
		}
		setTick((v) => v + 1);
	}, [mode, symbol, bars, broker, port]);

	useLayoutEffect(() => {
		const epoch = replayEpoch ?? 0;
		if (replayEpochRef.current === epoch) return;
		replayEpochRef.current = epoch;
		fedReplayRef.current = Number.NEGATIVE_INFINITY;
		if (isExternalReplay) return;
		replayRef.current?.broker.resetAccount();
		setTick((v) => v + 1);
	}, [replayEpoch, isExternalReplay]);

	useEffect(() => {
		if (isExternalReplay) return;
		if (mode !== "replay") {
			replayRef.current?.broker.resetAccount();
			fedReplayRef.current = Number.NEGATIVE_INFINITY;
			setTick((v) => v + 1);
			return;
		}
		const feed = replay?.bar;
		if (!feed || replay.timestamp <= fedReplayRef.current) return;
		fedReplayRef.current = replay.timestamp;
		port.feedBar(symbol, feed);
		broker.onBar(symbol, feed, replay.timestamp);
		setTick((v) => v + 1);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [mode, replay, symbol, broker, port, isExternalReplay]);

	const account = broker.getAccount();

	const openTicket = (side: OrderSide, price?: number, quantity?: number) => {
		setEditTarget(null);
		setTicket({ open: true, side, price, quantity });
	};

	// P1-S1: cell tự đăng ký binding cho panel multi bám active chart.
	// Chỉ khi có chartId (cell multi); single không cần (panel riêng qua context).
	useEffect(() => {
		if (!chartId) return;
		const buildSnapshot = (): PaperPanelSnapshot => {
			const allOrders = broker.getOrders();
			const allPositions = broker.getPositions();
			const marks: Record<string, number> = {};
			for (const position of allPositions) marks[position.symbol] = position.currentPrice;
			return {
				account: broker.getAccount(),
				positions: allPositions,
				orders: allOrders.filter((o) => o.status === "working"),
				orderHistory: allOrders,
				ordersMargin: workingOrdersMargin(allOrders, allPositions, resolvedRules, marks),
				analytics: broker.getAnalytics(),
				log: logRef.current,
				tradingEnabled,
				onEnableTrading: () => setTradingEnabled(true),
			};
		};
		registerPaperPanelBinding({
			chartId,
			symbol,
			shared: liveExternalRef.current != null,
			getSnapshot: buildSnapshot,
			closePosition: (positionId: string) => {
				try {
					const ok = broker.closePosition(positionId);
					setTick((v) => v + 1);
					return ok;
				} catch {
					return false;
				}
			},
			reversePosition: (positionId: string) => {
				const position = broker.getPositions().find((p) => p.id === positionId);
				if (!position) return;
				try {
					broker.closePosition(positionId);
					broker.placeOrder({
						symbol: position.symbol,
						side: position.side === "long" ? "sell" : "buy",
						type: "market",
						quantity: position.quantity,
					});
				} catch {
					// Best-effort như panelProps.
				}
				setTick((v) => v + 1);
			},
			cancelOrder: (orderId: string) => {
				const ok = broker.cancelOrder(orderId);
				setTick((v) => v + 1);
				return ok;
			},
			closeAllPositions: (reason?: string) => {
				const n = broker.closeAllPositions(reason);
				setTick((v) => v + 1);
				return n;
			},
			getOrders: () => broker.getOrders(),
			// S2 (P5 parity F1-A): đặt lệnh qua broker của cell (cho dock form workspace).
			placeOrder: (input) => {
				const placed = broker.placeOrder(input);
				setTick((v) => v + 1);
				return placed;
			},
			resetAccount: (initialBalance?: number) => {
				broker.resetAccount(initialBalance);
				setTick((v) => v + 1);
			},
			applyRuntimeConfig: (patch) => {
				const summary = broker.applyRuntimeConfig(patch);
				setTick((v) => v + 1);
				return summary;
			},
			subscribe: (listener: () => void) => {
				const offs = [
					broker.on("orderChange", listener),
					broker.on("positionChange", listener),
					broker.on("accountChange", listener),
					broker.on("fill", listener),
				];
				return () => offs.forEach((off) => off());
			},
		});
		return () => unregisterPaperPanelBinding(chartId);
		// tradingEnabled/setTradingEnabled: toggle mắt 👁 re-register → notify registry
		// để panel multi đổi sang CTA/bật lại ngay, thống nhất singlechart.
	}, [chartId, symbol, broker, resolvedRules, tradingEnabled, setTradingEnabled]);

	const value: TradingContextValue = useMemo(() => {
		const allOrders = broker.getOrders();
		const allPositions = broker.getPositions();
		const marks: Record<string, number> = {};
		for (const position of allPositions) marks[position.symbol] = position.currentPrice;
		const panelProps = {
			account: broker.getAccount(),
			positions: allPositions,
			orders: allOrders.filter((o) => o.status === "working"),
			orderHistory: allOrders,
			ordersMargin: workingOrdersMargin(allOrders, allPositions, resolvedRules, marks),
			analytics: broker.getAnalytics(),
			log: logRef.current,
			onClosePosition: (positionId: string) => {
				try {
					broker.closePosition(positionId);
				} catch (error) {
					pushLog(`Close failed: ${error instanceof Error ? error.message : "unknown"}`);
				}
				setTick((v) => v + 1);
			},
			onReversePosition: (positionId: string) => {
				const position = broker.getPositions().find((p) => p.id === positionId);
				if (!position) return;
				const { symbol: sym, side, quantity } = position;
				try {
					broker.closePosition(positionId);
					const reversed = broker.placeOrder({
						symbol: sym,
						side: side === "long" ? "sell" : "buy",
						type: "market",
						quantity,
					});
					if (reversed.status === "rejected") {
						pushLog(`Reverse rejected: ${reversed.rejectCode ?? "unknown"}`);
					}
				} catch (error) {
					pushLog(`Reverse failed: ${error instanceof Error ? error.message : "unknown"}`);
				}
				setTick((v) => v + 1);
			},
			onCancelOrder: (orderId: string) => {
				broker.cancelOrder(orderId);
				setTick((v) => v + 1);
			},
			// P1.3: bulk actions (optional — panel ẩn khi không truyền).
			onCloseAllPositions: () => {
				broker.closeAllPositions("manual");
				setTick((v) => v + 1);
			},
			onCancelAllOrders: () => {
				for (const order of broker.getOrders()) {
					if (order.status === "working") {
						broker.cancelOrder(order.id);
					}
				}
				setTick((v) => v + 1);
			},
			onResetAccount: (initialBalance?: number) => {
				broker.resetAccount(initialBalance);
				setTick((v) => v + 1);
			},
			tradingEnabled,
			onEnableTrading: () => setTradingEnabled(true),
			// F-UX-6 (A7): single-chart modal cần 2 field này — trước đây thiếu nên
			// `TradingPanelHeader` luôn nhận `initial` = DEFAULT và save là no-op.
			paperConfig: paperRuntime.config,
			onSavePaperConfig: (patch: Partial<PaperRuntimeConfig>) => {
				paperRuntime.save(patch);
				setTick((v) => v + 1);
			},
		};
		return {
			mode,
			symbol,
			rules: resolvedRules,
			broker,
			port,
			tradingEnabled,
			setTradingEnabled,
			oneClickTrading: paperRuntime.config.oneClickTrading,
			isActiveChart: isActive,
			panelProps,
			ticket,
			openTicket,
			closeTicket: () => setTicket((prev) => ({ ...prev, open: false })),
			editTarget,
			startEditOrder: (orderId: string) => {
				const order = broker.getOrders().find((o) => o.id === orderId);
				if (!order) return;
				setEditTarget({ orderId, price: order.price, stopPrice: order.stopPrice });
				setTicket({ open: true, side: order.side });
			},
			cancelEdit: () => {
				setEditTarget(null);
				setTicket((prev) => ({ ...prev, open: false }));
			},
			closeRequested,
			requestClose: () => {
				if (oneKeyCloseRef.current) {
					try {
						broker.closeAllPositions("manual", symbol);
					} catch {
						// Đóng được bao nhiêu hay bấy nhiêu.
					}
					setTick((v) => v + 1);
					return;
				}
				setCloseRequested(true);
			},
			cancelCloseRequest: () => setCloseRequested(false),
			confirmCloseAll: () => {
				try {
					broker.closeAllPositions("manual", symbol);
				} catch {
					// Đóng được bao nhiêu hay bấy nhiêu (closeAllPositions tự skip).
				}
				setCloseRequested(false);
				setTick((v) => v + 1);
			},
			oneKeyClose,
			setOneKeyClose,
			placeOrder: (input: OrderValidationInput) => {
				const placed = broker.placeOrder(input);
				if (placed.status === "rejected") {
					pushLog(t("widget.trading.orderRejected", {
						side: input.side,
						quantity: input.quantity,
						symbol: input.symbol,
						code: placed.rejectCode ?? "unknown",
						defaultValue: "Order rejected: {side} {quantity} {symbol} ({code})",
					}));
				}
				setTick((v) => v + 1);
				return placed;
			},
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [mode, symbol, ticket, editTarget, closeRequested, oneKeyClose, account.equity, account.balance, tick, tradingEnabled, setTradingEnabled, isActive, paperRuntime.version]);

	return <TradingContext.Provider value={value}>{children}</TradingContext.Provider>;
}
