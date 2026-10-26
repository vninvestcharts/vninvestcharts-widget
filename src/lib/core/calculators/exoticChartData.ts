/**
 * A3 Baseline / A11 Renko / A11 Kagi / Point & Figure / Line Break — producers.
 *
 * Mỗi chart type loại "giá" cần một dữ liệu mà bar OHLCV thô KHÔNG mang:
 * baseline cần phần trăm so với bar mốc, renko cần bậc giá gạch, kagi cần
 * trạng thái hướng và mức đảo, P&F cần các box của một cột và bar mở cột,
 * line break cần mức đóng của đường đang chạy. Không có producer thì mọi giá
 * trị đều rơi về `default: return datum.close` và chart vẽ y hệt đường Line dưới
 * nhãn khác.
 *
 * Module này thuần: không đụng DOM, không đọc engine, không giữ state giữa hai
 * lần gọi. Toàn bộ state (bậc gạch, hướng kagi, cột P&F) là biến cục bộ trong
 * một lần gọi ⇒ cùng đầu vào luôn cho cùng đầu ra, nên test được mà không cần
 * fake timer.
 */

import { PRIMARY_BASELINE_KEY } from "@vninvestcharts/engine-core";
import { normalizeSeriesTypeId } from "../types/pane-descriptor";
import type { SeriesConfig } from "../types/pane-descriptor";
import type { EnrichedDatum, KagiDirection, PnfBox, PnfDirection, RawOHLCV } from "./types";
import { normalizePricesToBaseline } from "./normalizePrices";

/** Kiểu giá mà các calculator này chỉ cần. */
type CloseSeries = readonly Pick<RawOHLCV, "close">[];

export interface RenkoBrick {
	/** Đầu dưới của gạch — baseline để engine vẽ hộp. */
	open: number;
	/** Đầu trên của gạch — giá trị engine đưa vào Y domain. */
	close: number;
	/** `true` = gạch tăng. */
	up: boolean;
	/** `false` = gạch dang dở ở cuối chuỗi. */
	fullyFormed: boolean;
}

export interface KagiState {
	/** Mức giá kagi đang sống. */
	current: number;
	/** Hướng của nhánh đang chạy tại bar này. */
	startAs: KagiDirection;
	/** Có đảo chiều tại bar này không. */
	changeTo?: KagiDirection;
	/** Giá tại đó nhánh đảo. */
	changePoint?: number;
	/** Mức giá mà nhánh hiện tại bắt đầu. */
	reverseAt: number;
}

export interface PnfColumn {
	/** Các box cột tạo ra tại bar này. Rỗng/undefined = bar này không tạo box. */
	boxes: PnfBox[];
	/** Chỉ số bar MỞ ĐẦU cột — đây là x của cả cột, không phải x của bar này. */
	columnStart: number;
	/** Hướng của cột, để engine chọn màu. */
	direction: PnfDirection;
}

export interface LineBreakLevel {
	/** Mức mở của đường đang chạy — đầu trái của đoạn ngang. */
	open: number;
	/** Mức đóng của đường đang chạy — giá trị engine đưa vào Y domain và vẽ. */
	close: number;
	/** `true` = đường đi lên. */
	up: boolean;
}

/** Series type loại exotic mà module này sản xuất được. */
export type ExoticChartType = "Baseline" | "Renko" | "Kagi" | "PointAndFigure" | "LineBreak";

const EXOTIC_TYPES: ReadonlySet<string> = new Set<ExoticChartType>([
	"Baseline",
	"Renko",
	"Kagi",
	"PointAndFigure",
	"LineBreak",
]);

function positiveParam(params: Record<string, unknown> | undefined, key: string): number | undefined {
	const value = params?.[key];
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Số nguyên ≥ 1, dùng cho tham số ĐẾM (số box đảo chiều của P&F). */
function positiveCountParam(params: Record<string, unknown> | undefined, key: string): number | undefined {
	const value = params?.[key];
	return typeof value === "number" && Number.isFinite(value) && value >= 1
		? Math.floor(value)
		: undefined;
}

/**
 * Bậc giá chuẩn, suy ra từ chính dữ liệu: trung vị |Δclose|.
 *
 * Vì sao không đặt hằng số: một renko 10 điểm trên cổng phiếu giá 30 là một
 * gạch, còn trên BTC là 40 gạch. Trung vị |Δclose| là bước chuyển động điển
 * hình của chính instrument đó, nên ra số gạch đọc được ở mọi mức giá mà không
 * cần người dùng chỉnh tay. `params.brickSize` thắng nếu host truyền vào.
 */
export function resolveBrickStep(closes: readonly number[], override?: number): number {
	if (override !== undefined) {
		return override;
	}
	const deltas: number[] = [];
	for (let i = 1; i < closes.length; i++) {
		const delta = Math.abs(closes[i] - closes[i - 1]);
		if (Number.isFinite(delta) && delta > 0) {
			deltas.push(delta);
		}
	}
	if (deltas.length === 0) {
		return 1;
	}
	deltas.sort((a, b) => a - b);
	const median = deltas[Math.floor(deltas.length / 2)];
	// Giữ 4 chữ số có nghĩa để bậc không bị số thực kép sai lệch khi nhân lên
	// hàng trăm gạch (điểm neo sẽ trôi khỏi bậc nếu bậc có sai số tích luỹ).
	const magnitude = 10 ** Math.max(0, Math.ceil(Math.log10(median)) - 3);
	return Math.max(magnitude, Math.round(median / magnitude) * magnitude);
}

/**
 * Bậc gạch renko.
 *
 * - Neo khởi đầu là `open` của bar đầu, đã quy về bậc gần nhất: giá thị trường
 *   không nằm đúng trên bậc nào, neo lệch bậc thì cả chuỗi gạch lệch theo.
 * - Một bar có thể tạo nhiều gạch (gap lớn). Trục X là THỜI GIAN nên các gạch
 *   trong cùng một bar không có x khác nhau: chỉ gạch CUỐI được ghi nhận, và
 *   chỉ gạch đó được vẽ. Gạch tạo ở bar nào thì dán ở bar đó.
 * - Gạch cuối có thể chưa trọn vẹn (`fullyFormed: false`) để giá hiện tại vẫn
 *   hiện; chỉ ghi khi bar cuối chưa có gạch nào, vì một bar chỉ vẽ được một ô.
 */
export function computeRenkoBricks(closes: readonly number[], brickSize: number): (RenkoBrick | undefined)[] {
	const out: (RenkoBrick | undefined)[] = new Array(closes.length);
	if (closes.length === 0 || !(brickSize > 0) || !Number.isFinite(brickSize)) {
		return out;
	}

	let level = Math.round(closes[0] / brickSize) * brickSize;
	let lastIndex = -1;

	for (let i = 0; i < closes.length; i++) {
		const close = closes[i];
		if (!Number.isFinite(close)) {
			continue;
		}
		const up = close >= level + brickSize;
		const down = close <= level - brickSize;
		if (!up && !down) {
			continue;
		}
		const steps = up
			? Math.floor((close - level) / brickSize)
			: Math.floor((level - close) / brickSize);
		if (steps < 1) {
			continue;
		}
		for (let step = 0; step < steps; step++) {
			const open = level;
			level = up ? level + brickSize : level - brickSize;
			out[i] = { open, close: level, up, fullyFormed: true };
			lastIndex = i;
		}
	}

	// Gạch dang dở: giá đã đi được một phần đáng kể của bậc kế tiếp.
	if (lastIndex !== closes.length - 1) {
		const close = closes[closes.length - 1];
		const travelled = Math.abs(close - level);
		if (Number.isFinite(close) && travelled >= brickSize * 0.25) {
			out[closes.length - 1] = {
				open: level,
				close,
				up: close > level,
				fullyFormed: false,
			};
		}
	}

	return out;
}

/**
 * Kagi level + direction.
 *
 * Rule (StockCharts standard): every time price moves `reversal` IN the current
 * direction, kagi draws a new horizontal segment at the new level; when price
 * moves `reversal` AGAINST it, the direction flips and a new segment starts.
 * That is why a rising trend draws as a staircase going UP rather than one flat
 * line, and why `changeTo` is set only on a real flip - setting it on a
 * same-direction continuation makes `KagiSeries` draw two same-coloured legs
 * back to back, i.e. a plain line chopped into meaningless pieces.
 *
 * `reverseAt` = level where the current horizontal segment STARTS.
 * `current`   = level where it ENDS. The engine reads `current` and draws with
 *               `stepBefore`, which is what makes the segment flat.
 *
 * `params.reversal` defaults to the very same brick step as renko: the
 * conventional relationship between the two chart types (same instrument, same
 * step), so it is a grounded default rather than an invented number.
 */
export function computeKagiStates(closes: readonly number[], reversal: number): (KagiState | undefined)[] {
	const out: (KagiState | undefined)[] = new Array(closes.length);
	if (closes.length === 0 || !(reversal > 0) || !Number.isFinite(reversal)) {
		return out;
	}

	let level = closes[0];
	let direction: KagiDirection = "yang";
	let segmentStart = level;

	for (let i = 0; i < closes.length; i++) {
		const close = closes[i];
		if (!Number.isFinite(close)) {
			continue;
		}
		if (direction === "yang" && close >= level + reversal) {
			// Still going up: a new horizontal segment, SAME direction, so no
			// `changeTo` - the leg did not reverse.
			segmentStart = level;
			level = close;
			out[i] = { current: level, startAs: "yang", reverseAt: segmentStart };
			continue;
		}
		if (direction === "yang" && close <= level - reversal) {
			direction = "yin";
			level = close;
			out[i] = { current: level, startAs: "yin", changeTo: "yin", changePoint: close, reverseAt: level };
			continue;
		}
		if (direction === "yin" && close <= level - reversal) {
			segmentStart = level;
			level = close;
			out[i] = { current: level, startAs: "yin", reverseAt: segmentStart };
			continue;
		}
		if (direction === "yin" && close >= level + reversal) {
			direction = "yang";
			level = close;
			out[i] = { current: level, startAs: "yang", changeTo: "yang", changePoint: close, reverseAt: level };
			continue;
		}
		// Under the threshold: the level is unchanged, kagi stays where it is.
		out[i] = { current: level, startAs: direction, reverseAt: segmentStart };
	}

	return out;
}

/**
 * Point & Figure — các box của từng cột, và bar MỞ ĐẦU cột.
 *
 * Quy tắc chuẩn: giá đi đủ `boxSize` cùng hướng thì cột đó thêm MỘT box ở đầu
 * đang đi; giá đi ngược đủ `reversalBoxes × boxSize` thì hướng đảo và một cột
 * MỚI bắt đầu tại bar đảo chiều. Đó là lý do `columnStart` là một trường
 * riêng: x của cả cột là x của bar MỞ ĐẦU nó, và nó phải sống sót qua những
 * bar không tạo box nào (giá đi ngang, hoặc đi chưa đủ một bậc).
 *
 * Một bar có thể tạo N box (gap lớn) — tất cả cùng một cột, cùng một x, xếp
 * dọc. Đây chính là hình học mà `toBarPoints` không diễn đạt được, nên engine có
 * `layoutPointAndFigure` riêng thay vì alias sang đường vẽ hộp của renko.
 *
 * @param boxSize      chiều cao một box (một bậc giá)
 * @param reversalBoxes số box giá phải đi ngược mới đảo hướng (chuẩn: 3)
 */
export function computePointAndFigureColumns(
	closes: readonly number[],
	boxSize: number,
	reversalBoxes: number,
): (PnfColumn | undefined)[] {
	const out: (PnfColumn | undefined)[] = new Array(closes.length);
	if (closes.length === 0 || !(boxSize > 0) || !Number.isFinite(boxSize)) {
		return out;
	}
	const reversal = Math.max(1, Math.floor(reversalBoxes)) * boxSize;

	let level = closes[0];
	if (!Number.isFinite(level)) {
		return out;
	}
	// Cột đầu tiên mở tại bar 0. Hướng khởi đầu "up" là quy ước chuẩn; bar đầu
	// tiên đi xuống sẽ đảo ngay và cột đầu rỗng bị bỏ qua (xem `columnStart`).
	let direction: PnfDirection = "up";
	let columnStart = 0;

	for (let i = 0; i < closes.length; i++) {
		const close = closes[i];
		if (!Number.isFinite(close)) {
			continue;
		}

		if (direction === "up") {
			if (close >= level + boxSize) {
				const steps = Math.floor((close - level) / boxSize);
				if (steps < 1) {
					continue;
				}
				const boxes: PnfBox[] = [];
				for (let step = 0; step < steps; step++) {
					const open = level + step * boxSize;
					boxes.push({ open, close: open + boxSize });
				}
				level += steps * boxSize;
				out[i] = { boxes, columnStart, direction };
				continue;
			}
			if (close <= level - reversal) {
				direction = "down";
				columnStart = i;
			}
		}

		if (direction === "down") {
			if (close <= level - boxSize) {
				const steps = Math.floor((level - close) / boxSize);
				if (steps < 1) {
					continue;
				}
				const boxes: PnfBox[] = [];
				for (let step = 0; step < steps; step++) {
					const open = level - step * boxSize;
					boxes.push({ open, close: open - boxSize });
				}
				level -= steps * boxSize;
				out[i] = { boxes, columnStart, direction };
				continue;
			}
			if (close >= level + reversal) {
				direction = "up";
				columnStart = i;
			}
		}
	}

	return out;
}

/**
 * Line Break — mức đóng của đường đang chạy.
 *
 * Quy tắc chuẩn (n-line): đường đi theo hướng hiện tại, mỗi lần giá đi đủ `n` thì
 * đường kéo dài thêm một bước; giá đi ngược đủ `n` thì đường KẾT THÚC và một
 * đường mới bắt đầu ở đúng mức đó, theo hướng ngược lại. `n` dùng cho CẢ bước
 * lẫn đảo chiều — đó là điểm khác biệt với kagi (kagi có ngưỡng đảo riêng), và
 * cũng là lý do đây là hai loại chart khác nhau chứ không phải một tên gọi khác.
 *
 * `open` là mức đầu đường, `close` là mức cuối. Engine vẽ polyline qua `close`
 * với `stepBefore`: trong lòng một đường, mức là HẰNG, nên một đoạn thẳng sẽ vẽ
 * ra một độ dốc giữa hai mức chưa bao giờ cùng tồn tại.
 */
export function computeLineBreakLevels(closes: readonly number[], lineSize: number): (LineBreakLevel | undefined)[] {
	const out: (LineBreakLevel | undefined)[] = new Array(closes.length);
	if (closes.length === 0 || !(lineSize > 0) || !Number.isFinite(lineSize)) {
		return out;
	}

	let level = closes[0];
	if (!Number.isFinite(level)) {
		return out;
	}
	// `open` chỉ đổi khi đường ĐẢO hướng. Giữ nó qua các bước cùng hướng là điều
	// làm một xu hướng tăng thuần vẽ thành đường bậc thang đi lên, chứ không phải
	// một đoạn ngang duy nhất.
	let lineOpen = level;
	let up = true;

	for (let i = 0; i < closes.length; i++) {
		const close = closes[i];
		if (!Number.isFinite(close)) {
			continue;
		}

		if (up) {
			if (close >= level + lineSize) {
				level += Math.floor((close - level) / lineSize) * lineSize;
				out[i] = { open: lineOpen, close: level, up: true };
				continue;
			}
			if (close <= level - lineSize) {
				up = false;
				lineOpen = level;
			}
		}

		if (!up) {
			if (close <= level - lineSize) {
				level -= Math.floor((level - close) / lineSize) * lineSize;
				out[i] = { open: lineOpen, close: level, up: false };
				continue;
			}
			if (close >= level + lineSize) {
				up = true;
				lineOpen = level;
			}
		}

		// Dưới ngưỡng: đường đang chạy giữ nguyên mức và hướng.
		out[i] = { open: lineOpen, close: level, up };
	}

	return out;
}

/** Chart type exotic đang được pane này yêu cầu (đã canonicalize). */
function requestedExoticTypes(series: readonly SeriesConfig[]): ReadonlySet<ExoticChartType> {
	const wanted = new Set<ExoticChartType>();
	for (const entry of series) {
		const type = normalizeSeriesTypeId(entry.type);
		if (EXOTIC_TYPES.has(type)) {
			wanted.add(type as ExoticChartType);
		}
	}
	return wanted;
}

/**
 * Ghi dữ liệu exotic lên `EnrichedDatum[]`, MUTATION-FREE (trả về mảng mới khi
 * có việc phải làm, trả lại chính `enriched` khi không có chart type nào cần).
 *
 * Chỉ tính loại chart type nào thật sự đang được yêu cầu: renko với 10 nghìn
 * bar là O(n) mỗi lần dữ liệu đổi, và phần lớn phiên không mở renko/kagi.
 */
export function applyExoticChartData(
	enriched: readonly EnrichedDatum[],
	raw: CloseSeries,
	series: readonly SeriesConfig[],
): EnrichedDatum[] {
	const wanted = requestedExoticTypes(series);
	if (wanted.size === 0 || enriched.length === 0) {
		return enriched as EnrichedDatum[];
	}

	const closes = raw.map((bar) => bar.close);
	const firstParams = (type: ExoticChartType): Record<string, unknown> | undefined =>
		series.find((entry) => normalizeSeriesTypeId(entry.type) === type)?.params;

	const next = enriched.slice() as EnrichedDatum[];

	if (wanted.has("Baseline")) {
		// Đọc lại từ `normalizePricesToBaseline` chứ không tự chia: một công thức
		// phần trăm duy nhất trong repo, và consumer overlay đang đọc đúng nó.
		const { normalizedPrices } = normalizePricesToBaseline(
			raw as readonly { open: number; high: number; low: number; close: number; volume: number }[],
			{},
			0,
			undefined,
			PRIMARY_BASELINE_KEY,
		);
		for (let i = 0; i < next.length; i++) {
			const value = normalizedPrices[i]?.[PRIMARY_BASELINE_KEY];
			if (value === undefined) {
				continue;
			}
			next[i] = {
				...next[i],
				normalizedPrices: { ...next[i].normalizedPrices, [PRIMARY_BASELINE_KEY]: value },
			};
		}
	}

	if (wanted.has("Renko")) {
		const step = resolveBrickStep(closes, positiveParam(firstParams("Renko"), "brickSize"));
		const bricks = computeRenkoBricks(closes, step);
		for (let i = 0; i < next.length; i++) {
			const brick = bricks[i];
			if (!brick) {
				continue;
			}
			next[i] = {
				...next[i],
				renkoOpen: brick.open,
				renkoClose: brick.close,
				renkoUp: brick.up,
				fullyFormed: brick.fullyFormed,
			};
		}
	}

	if (wanted.has("Kagi")) {
		const reversal = resolveBrickStep(closes, positiveParam(firstParams("Kagi"), "reversal"));
		const states = computeKagiStates(closes, reversal);
		for (let i = 0; i < next.length; i++) {
			const state = states[i];
			if (!state) {
				continue;
			}
			next[i] = {
				...next[i],
				current: state.current,
				startAs: state.startAs,
				changeTo: state.changeTo,
				changePoint: state.changePoint,
				reverseAt: state.reverseAt,
			};
		}
	}

	if (wanted.has("PointAndFigure")) {
		// `boxSize` là chiều cao MỘT box; `reversalBoxes` là số box phải đi ngược
		// mới đảo hướng. Mặc định 3 là quy ước của loại chart này, không phải số bịa.
		const params = firstParams("PointAndFigure");
		const boxSize = resolveBrickStep(closes, positiveParam(params, "boxSize"));
		const columns = computePointAndFigureColumns(closes, boxSize, positiveCountParam(params, "reversalBoxes") ?? 3);
		for (let i = 0; i < next.length; i++) {
			const column = columns[i];
			// Bar không tạo box thì không ghi gì: nó thuộc cột đang chạy nhưng không
			// có hình học, và ghi `boxes: []` sẽ làm engine tính cột sai.
			if (!column) {
				continue;
			}
			next[i] = {
				...next[i],
				boxes: column.boxes,
				pnfColumnStart: column.columnStart,
				pnfDirection: column.direction,
			};
		}
	}

	if (wanted.has("LineBreak")) {
		// `lineSize` là tham số `n` quy ước của line break: vừa là bước mở rộng
		// đường vừa là ngưỡng kết thúc đường.
		const lineSize = resolveBrickStep(closes, positiveParam(firstParams("LineBreak"), "lineSize"));
		const levels = computeLineBreakLevels(closes, lineSize);
		for (let i = 0; i < next.length; i++) {
			const level = levels[i];
			if (!level) {
				continue;
			}
			next[i] = {
				...next[i],
				lineBreakOpen: level.open,
				lineBreakClose: level.close,
				lineBreakUp: level.up,
			};
		}
	}

	return next;
}