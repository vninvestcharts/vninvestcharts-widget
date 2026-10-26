export interface RawOHLCV {
	date: Date;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

export interface IndicatorBandValue {
	top: number;
	middle: number;
	bottom: number;
}

export interface IndicatorMacdValue {
	macd: number;
	signal: number;
	divergence: number;
}

export interface IndicatorWhaleValue {
	whaleBuyVol?: number;
	whaleSellVol?: number;
}

export interface IndicatorKdjValue {
	k: number;
	d: number;
	j: number;
}

export interface IndicatorDmiValue {
	plusDI: number;
	minusDI: number;
	adx: number;
}

export interface IndicatorBrarValue {
	ar: number;
	br: number;
}

export interface IndicatorMtmValue {
	mtm: number;
	signal: number;
}

export interface IndicatorEmvValue {
	emv: number;
	signal: number;
}

export interface IndicatorTrixValue {
	trix: number;
	signal: number;
}

export interface IndicatorDmaValue {
	ddd: number;
	ama: number;
}

export interface IndicatorPsyValue {
	psy: number;
	signal: number;
}

export interface IndicatorCrValue {
	cr: number;
	ma1: number;
	ma2: number;
	ma3: number;
	ma4: number;
}

export interface IndicatorStrengthElderValue {
	bullPower: number;
	bearPower: number;
}

export interface IndicatorIchimokuValue {
	tenkan: number;
	kijun: number;
	senkouA: number;
	senkouB: number;
	chikou: number;
}

export interface IndicatorSupertrendValue {
	supertrend: number;
	direction: number;
	upperBand: number;
	lowerBand: number;
}

export interface IndicatorKeltnerValue {
	upper: number;
	middle: number;
	lower: number;
}

export interface IndicatorDonchianValue {
	upper: number;
	middle: number;
	lower: number;
}

export type IndicatorMARibbonValue = Record<string, number>;

export interface IndicatorAlligatorValue {
	jaw: number;
	teeth: number;
	lips: number;
}

export interface IndicatorFractalValue {
	bearish: number;
	bullish: number;
}

export interface IndicatorGatorValue {
	upper: number;
	lower: number;
}

export interface IndicatorPivotValue {
	pp: number;
	r1: number;
	s1: number;
	r2: number;
	s2: number;
	r3: number;
	s3: number;
}

export interface IndicatorVwapValue {
	vwap: number;
	upper1: number;
	lower1: number;
	upper2: number;
	lower2: number;
	upper3: number;
	lower3: number;
}

export interface IndicatorAcValue {
	ac: number;
	color: string;
}

export interface TPOBlock {
	price: number;
	letter: string;
	volume: number;
	timeStart: number;
	timeEnd: number;
}

export interface MarketProfileData {
	tpoBlocks: TPOBlock[];
	poc: number;
	valueAreaHigh: number;
	valueAreaLow: number;
	initialBalanceHigh: number;
	initialBalanceLow: number;
	profileHigh: number;
	profileLow: number;
}

export interface VolumeProfileLevel {
	price: number;
	volume: number;
	buyVolume: number;
	sellVolume: number;
}

export interface VolumeProfileData {
	priceLevels: VolumeProfileLevel[];
	poc: number;
	valueAreaHigh: number;
	valueAreaLow: number;
	highVolumeNodes: number[];
	lowVolumeNodes: number[];
}

export interface FootprintLevel {
	price: number;
	bidVolume: number;
	askVolume: number;
	delta: number;
	deltaPercent: number;
	totalVolume: number;
}

export interface FootprintBar {
	timestamp: number;
	open: number;
	high: number;
	low: number;
	close: number;
	priceLevels: FootprintLevel[];
}

export interface DeltaProfileData {
	cumulativeDelta: number[];
	barDelta: number[];
	deltaSMA: number[];
	divergenceSignals: Array<{ index: number; type: "bullish" | "bearish" }>;
}

export interface IndicatorDeltaProfileValue {
	cumulativeDelta: number;
	barDelta: number;
	deltaSMA: number;
	divergence?: "bullish" | "bearish";
}

export interface IndicatorWyckoffValue {
	direction: number; // 1 for up swing, -1 for down swing
	zigzag: number;    // The price value of the zigzag line at this bar
	waveVolume: number;// Cumulative volume of the current wave so far
	waveDuration: number; // Bar count of the current wave so far
	isPivot: boolean;  // True if this bar is a peak or trough
}

export type IndicatorDatumValue =
	| number
	| IndicatorBandValue
	| IndicatorMacdValue
	| IndicatorWhaleValue
	| IndicatorKdjValue
	| IndicatorDmiValue
	| IndicatorBrarValue
	| IndicatorMtmValue
	| IndicatorEmvValue
	| IndicatorTrixValue
	| IndicatorDmaValue
	| IndicatorPsyValue
	| IndicatorCrValue
	| IndicatorStrengthElderValue
	| IndicatorIchimokuValue
	| IndicatorSupertrendValue
	| IndicatorKeltnerValue
	| IndicatorDonchianValue
	| IndicatorMARibbonValue
	| IndicatorAlligatorValue
	| IndicatorFractalValue
	| IndicatorGatorValue
	| IndicatorPivotValue
	| IndicatorVwapValue
	| IndicatorAcValue
	| MarketProfileData
	| VolumeProfileData
	| FootprintBar
	| DeltaProfileData
	| IndicatorDeltaProfileValue
	| IndicatorWyckoffValue;

/** Hướng của một nhánh kagi. `yang` = đang tăng, `yin` = đang giảm. */
export type KagiDirection = "yang" | "yin";

/** Hướng của một cột Point & Figure. `up` = cột đi lên. */
export type PnfDirection = "up" | "down";

/**
 * Một box của cột Point & Figure. Cao đúng MỘT bậc giá (`boxSize`), nên `open`
 * và `close` là hai mép kề nhau — cột là một thang box liền nhau, không phải
 * các hộp rời.
 */
export interface PnfBox {
	open: number;
	close: number;
}

export interface EnrichedDatum extends RawOHLCV {
	aoColor?: string;
	indicatorValues?: Record<string, IndicatorDatumValue | undefined>;
	symbolData?: Record<string, {
		open: number;
		high: number;
		low: number;
		close: number;
		volume: number;
	}>;
	normalizedPrices?: Record<string, number>;
	// ── A11 Renko ───────────────────────────────────────────────────────────
	// Một viên gạch KHÔNG phải một nến: open/close là hai đầu của viên gạch,
	// nằm trên bậc giá cố định, nên không thể dùng lại OHLC của chính bar này
	// (sẽ phá mọi consumer khác của cùng một datum: volume, chỉ báo, price line).
	/** Giá mở của viên gạch renko tạo ra trong bar này. */
	renkoOpen?: number;
	/** Giá đóng (đầu trên) của viên gạch renko — giá trị engine vẽ. */
	renkoClose?: number;
	/** `true` = gạch tăng. */
	renkoUp?: boolean;
	/**
	 * `false` = gạch dang dở (giá chưa đủ một bậc). Engine tô màu trung tính để
	 * không ai đọc nhầm là giá đóng. `RenkoSeries` cũng đọc field này.
	 */
	fullyFormed?: boolean;
	// ── A11 Kagi ────────────────────────────────────────────────────────────
	/** Hướng của nhánh kagi đang chạy tại bar này. */
	startAs?: KagiDirection;
	/** Hướng sau khi đảo chiều tại bar này (vắng = không đảo). */
	changeTo?: KagiDirection;
	/** Giá tại đó nhánh đảo chiều. */
	changePoint?: number;
	/** Mức giá mà nhánh hiện tại bắt đầu. */
	reverseAt?: number;
	/** Mức giá kagi đang sống — hằng cho tới lần đảo kế tiếp. */
	current?: number;
	// ── Point & Figure ───────────────────────────────────────────────────────
	// Một cột P&F gom MỌI box vào CÙNG MỘT x, còn `toBarPoints` của engine đặt
	// mỗi bar một x riêng. Vì vậy `boxes` đi kèm `pnfColumnStart`: x của cả cột
	// là x của bar MỞ ĐẦU cột, không phải x của bar đang tạo box. Engine đọc cả
	// hai ở `layoutPointAndFigure` (`vn-kline-engine-core/src/engine/pointAndFigureColumns.ts`).
	/** Các box cột P&F tạo ra tại bar này. Bar không tạo box thì KHÔNG ghi field này. */
	boxes?: readonly PnfBox[];
	/** Chỉ số bar MỞ ĐẦU cột hiện tại ( tuyệt đối trong `enrichedData`) — đó là x của cả cột. */
	pnfColumnStart?: number;
	/** Hướng của cột, để engine chọn màu tăng/giảm. */
	pnfDirection?: PnfDirection;
	// ── Line Break ───────────────────────────────────────────────────────────
	// Hình học giống kagi: một mức HẰNG cho tới khi đường hiện tại kết thúc, nên
	// engine vẽ bằng `stepBefore`. Khác ở quy tắc chia đoạn (một `n` cho cả bước
	// lẫn đảo chiều), không khác ở hình học — xem `exoticChartData.computeLineBreakLevels`.
	/** Mức mở của đường line break đang chạy. */
	lineBreakOpen?: number;
	/** Mức đóng (đầu bậc thang) của đường line break — giá trị engine vẽ. */
	lineBreakClose?: number;
	/** Hướng của đường đang chạy. */
	lineBreakUp?: boolean;
	// ── Higher-timeframe overlay ─────────────────────────────────────────────
	/**
	 * Nến khung thời gian CAO hơn tương ứng với bar LTF này, do
	 * `useWidgetData` gán khi `overlayTimeframe` khác khung chart.
	 * Trước khi field này tồn tại, `HTFOverlay` bị đọc dưới kiểu `any`
	 * (`(d: any) => d.htf?.close`) trong khi `resolveSeriesValue` không có
	 * case → tooltip/legend đọc nhầm `close` của khung hiện tại.
	 */
	htf?: {
		open: number;
		high: number;
		low: number;
		close: number;
		periodStart: number;
		isClosed: boolean;
	};
}

