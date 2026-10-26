/**
 * Khối compute: dao động (RSI/WR/VR/KDJ/CCI/DMI/BIAS/BRAR/MTM/EMV/AO/ROC/TRIX/
 * PSY/CR/AC/SMFI).
 *
 * Một nhóm trong `computeIndicatorComputationResult`, tách riêng (split 2026-09-30).
 * Nhóm này lớn nhất vì RSI và các biến thể chiếm phần lớn lịch sử chỉ báo, nhưng
 * mọi khối bên trong đều độc lập: chỉ đọc `raw`/`closes`/`plan`, không đọc nhau.
 */
import {
	acSeries,
	aoSeries,
	biasSeries,
	brarSeries,
	cciSeries,
	crSeries,
	dmiSeries,
	emvSeries,
	kdjSeries,
	mtmSeries,
	psySeries,
	rsiSeries,
	rocSeries,
	trixSeries,
	vrSeries,
	wrSeries,
} from "../../indicators/utils";
import type { IndicatorComputationPlan } from "./indicatorComputationTypes";
import type {
	IndicatorAcValue,
	IndicatorBrarValue,
	IndicatorCrValue,
	IndicatorDmiValue,
	IndicatorEmvValue,
	IndicatorKdjValue,
	IndicatorMtmValue,
	IndicatorPsyValue,
	IndicatorTrixValue,
	RawOHLCV,
} from "./types";
import { blankUntil } from "./computationHelpers";

export interface MomentumBlocks {
	rsiByPeriod: Map<number, Array<number | undefined>>;
	wrByPeriod: Map<number, Array<number | undefined>>;
	vrByPeriod: Map<number, Array<number | undefined>>;
	kdjByKey: Map<string, Array<IndicatorKdjValue | undefined>>;
	cciByPeriod: Map<number, Array<number | undefined>>;
	dmiByPeriod: Map<number, Array<IndicatorDmiValue | undefined>>;
	biasByPeriod: Map<number, Array<number | undefined>>;
	brarByPeriod: Map<number, Array<IndicatorBrarValue | undefined>>;
	mtmByKey: Map<string, Array<IndicatorMtmValue | undefined>>;
	emvByPeriod: Map<number, Array<IndicatorEmvValue | undefined>>;
	ao: Array<number | undefined>;
	rocByPeriod: Map<number, Array<number | undefined>>;
	trixByKey: Map<string, Array<IndicatorTrixValue | undefined>>;
	psyByKey: Map<string, Array<IndicatorPsyValue | undefined>>;
	crByKey: Map<string, Array<IndicatorCrValue | undefined>>;
	ac: Array<IndicatorAcValue | undefined>;
	smfi: Array<number | undefined>;
}

export function computeMomentumBlocks(
	raw: readonly RawOHLCV[],
	closes: readonly number[],
	plan: IndicatorComputationPlan,
): MomentumBlocks {
	const rsiByPeriod = new Map<number, Array<number | undefined>>();
	for (const period of plan.rsiPeriods) {
		rsiByPeriod.set(period, blankUntil(rsiSeries(closes, period), Math.max(period, 1)));
	}

	const wrByPeriod = new Map<number, Array<number | undefined>>();
	for (const period of plan.wrPeriods) {
		wrByPeriod.set(period, blankUntil(wrSeries(raw, period), Math.max(period - 1, 0)));
	}

	const vrByPeriod = new Map<number, Array<number | undefined>>();
	for (const period of plan.vrPeriods) {
		vrByPeriod.set(period, blankUntil(vrSeries(raw, period), Math.max(period, 1)));
	}

	const kdjByKey = new Map<string, Array<IndicatorKdjValue | undefined>>();
	for (const [key, config] of plan.kdjConfigs) {
		const series = kdjSeries(raw, config.period, config.m1, config.m2);
		kdjByKey.set(key, raw.map((_, index) => {
			const k = series.k[index];
			const d = series.d[index];
			const j = series.j[index];
			if (!Number.isFinite(k) || !Number.isFinite(d) || !Number.isFinite(j)) {
				return undefined;
			}
			return { k, d, j };
		}));
	}

	const cciByPeriod = new Map<number, Array<number | undefined>>();
	for (const period of plan.cciPeriods) {
		cciByPeriod.set(period, blankUntil(cciSeries(raw, period), Math.max(period - 1, 0)));
	}

	const dmiByPeriod = new Map<number, Array<IndicatorDmiValue | undefined>>();
	for (const period of plan.dmiPeriods) {
		const series = dmiSeries(raw, period);
		dmiByPeriod.set(period, raw.map((_, index) => {
			const plusDI = series.plusDI[index];
			const minusDI = series.minusDI[index];
			const adx = series.adx[index];
			if (!Number.isFinite(plusDI) || !Number.isFinite(minusDI) || !Number.isFinite(adx)) {
				return undefined;
			}
			return { plusDI, minusDI, adx };
		}));
	}

	const biasByPeriod = new Map<number, Array<number | undefined>>();
	for (const period of plan.biasPeriods) {
		biasByPeriod.set(period, blankUntil(biasSeries(raw, period), Math.max(period - 1, 0)));
	}

	const brarByPeriod = new Map<number, Array<IndicatorBrarValue | undefined>>();
	for (const period of plan.brarPeriods) {
		const series = brarSeries(raw, period);
		brarByPeriod.set(period, raw.map((_, index) => {
			const ar = series.ar[index];
			const br = series.br[index];
			if (!Number.isFinite(ar) || !Number.isFinite(br)) {
				return undefined;
			}
			return { ar, br };
		}));
	}

	const mtmByKey = new Map<string, Array<IndicatorMtmValue | undefined>>();
	for (const [key, config] of plan.mtmConfigs) {
		const series = mtmSeries(raw, config.period, config.signalPeriod);
		mtmByKey.set(key, raw.map((_, index) => {
			const mtm = series.mtm[index];
			const signal = series.signal[index];
			if (!Number.isFinite(mtm) || !Number.isFinite(signal)) {
				return undefined;
			}
			return { mtm, signal };
		}));
	}

	const emvByPeriod = new Map<number, Array<IndicatorEmvValue | undefined>>();
	for (const period of plan.emvPeriods) {
		const series = emvSeries(raw, period);
		emvByPeriod.set(period, raw.map((_, index) => {
			const emv = series.emv[index];
			const signal = series.signal[index];
			if (!Number.isFinite(emv) || !Number.isFinite(signal)) {
				return undefined;
			}
			return { emv, signal };
		}));
	}

	const ao = plan.aoEnabled
		? blankUntil(aoSeries(raw), 33)
		: new Array(raw.length).fill(undefined) as Array<undefined>;

	const rocByPeriod = new Map<number, Array<number | undefined>>();
	for (const period of plan.rocPeriods) {
		rocByPeriod.set(period, blankUntil(rocSeries(raw, period), Math.max(period, 0)));
	}

	const trixByKey = new Map<string, Array<IndicatorTrixValue | undefined>>();
	for (const [key, config] of plan.trixConfigs) {
		const series = trixSeries(raw, config.period, config.signalPeriod);
		const warmup = Math.max(config.period * 3 - 3, config.signalPeriod - 1, 0);
		const trixValues = blankUntil(series.trix, warmup);
		const signalValues = blankUntil(series.signal, warmup);
		trixByKey.set(key, raw.map((_, index) => {
			const trix = trixValues[index];
			const signal = signalValues[index];
			if (!Number.isFinite(trix ?? NaN) || !Number.isFinite(signal ?? NaN)) {
				return undefined;
			}
			return { trix: trix!, signal: signal! };
		}));
	}

	const psyByKey = new Map<string, Array<IndicatorPsyValue | undefined>>();
	for (const [key, config] of plan.psyConfigs) {
		const series = psySeries(raw, config.period, config.signalPeriod);
		psyByKey.set(key, raw.map((_, index) => {
			const psy = series.psy[index];
			const signal = series.signal[index];
			if (!Number.isFinite(psy) || !Number.isFinite(signal)) {
				return undefined;
			}
			return { psy, signal };
		}));
	}

	const crByKey = new Map<string, Array<IndicatorCrValue | undefined>>();
	for (const [key, config] of plan.crConfigs) {
		const series = crSeries(raw, config.period, config.m1, config.m2, config.m3, config.m4);
		crByKey.set(key, raw.map((_, index) => {
			const cr = series.cr[index];
			const ma1 = series.ma1[index];
			const ma2 = series.ma2[index];
			const ma3 = series.ma3[index];
			const ma4 = series.ma4[index];
			if (!Number.isFinite(cr) || !Number.isFinite(ma1) || !Number.isFinite(ma2) || !Number.isFinite(ma3) || !Number.isFinite(ma4)) {
				return undefined;
			}
			return { cr, ma1, ma2, ma3, ma4 };
		}));
	}

	const acRaw = plan.acEnabled ? acSeries(raw) : [];
	const ac: Array<IndicatorAcValue | undefined> = plan.acEnabled
		? raw.map((_, index) => {
			const val = acRaw[index];
			if (val === undefined || isNaN(val)) return undefined;
			let color = "#089981"; // green
			if (index > 0) {
				const prevVal = acRaw[index - 1];
				if (prevVal !== undefined && !isNaN(prevVal) && val < prevVal) {
					color = "#f23645"; // red
				}
			}
			return { ac: val, color };
		})
		: new Array(raw.length).fill(undefined);

	const smfi: Array<number | undefined> = [];
	if (plan.smfiEnabled) {
		const n = raw.length;
		const days = new Set<string>();
		raw.forEach((b) => days.add(new Date(b.date).toDateString()));
		const isIntraday = n > days.size * 1.5;
		let currentSmfi = 10000;
		if (!isIntraday) {
			for (let i = 0; i < n; i++) {
				const prevClose = i > 0 ? raw[i - 1].close : raw[i].open;
				const changeFirst = raw[i].open - prevClose;
				const volFirst = raw[i].volume * 0.2;
				const changeLast = raw[i].close - raw[i].open;
				const volLast = raw[i].volume * 0.3;
				currentSmfi = currentSmfi - changeFirst * volFirst + changeLast * volLast;
				smfi.push(currentSmfi);
			}
		} else {
			for (let i = 0; i < n; i++) {
				const date = new Date(raw[i].date);
				const hour = date.getHours();
				const min = date.getMinutes();
				const isFirst30 = hour === 9 && min >= 0 && min <= 30;
				const isLast30 = (hour === 14 && min >= 15 && min <= 59) || (hour === 15 && min === 0);
				const priceChange = i > 0 ? raw[i].close - raw[i - 1].close : 0;
				const volume = raw[i].volume;
				if (isFirst30) {
					currentSmfi -= priceChange * volume;
				} else if (isLast30) {
					currentSmfi += priceChange * volume;
				}
				smfi.push(currentSmfi);
			}
		}
	} else {
		for (let i = 0; i < raw.length; i++) smfi.push(undefined);
	}

	return {
		rsiByPeriod,
		wrByPeriod,
		vrByPeriod,
		kdjByKey,
		cciByPeriod,
		dmiByPeriod,
		biasByPeriod,
		brarByPeriod,
		mtmByKey,
		emvByPeriod,
		ao,
		rocByPeriod,
		trixByKey,
		psyByKey,
		crByKey,
		ac,
		smfi,
	};
}
