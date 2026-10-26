#!/usr/bin/env node
/**
 * probe-pine-stage4.mjs — ĐO hành vi Stage 4 (tuple, 3 dải, thân UDF).
 *
 * KHÔNG sửa code sản phẩm. Chỉ gọi `compile()` và in kết quả thật.
 *
 * Ba điều chế từng làm probe này vô nghĩa, và mỗi điều có một cổng ở đây:
 *
 *  1. **ROOT hardcode** — bản đầu trỏ tuyệt đối vào một checkout khác, nên nó
 *     đo lại code cũ trong khi ta tưởng đang đo code mới (`L-E02`). Giờ `ROOT`
 *     suy từ `__dirname`.
 *  2. **Case không có `want`** — `--assert` báo `0 unmet` trong khi 7 case đổi
 *     kết quả cũng không ai thấy. `PLAN_PINE_STAGE3:300` đòi `0 NO_EXPECTATION`;
 *     ở đây `--assert` coi NO_EXPECTATION là **FAIL**, không phải cảnh báo.
 *  3. **So trên mảng rỗng** — `output = {}` cho `0/0` trông như đạt. Mọi case
 *     so độ dài có `LEN_GUARD` trước khi so giá trị (`L-E01`).
 *
 * Dùng:  node scripts/probe-pine-stage4.mjs
 *        node scripts/probe-pine-stage4.mjs --assert
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const ASSERT = process.argv.includes('--assert')
const require = createRequire(path.join(ROOT, 'scripts', 'probe-loader.cjs'))

function load(entry) {
	const esbuild = require('esbuild')
	const out = esbuild.buildSync({
		entryPoints: [path.join(ROOT, 'src', entry)],
		bundle: true, format: 'cjs', write: false, platform: 'node',
		absWorkingDir: ROOT, logLevel: 'silent',
	})
	const mod = { exports: {} }
	new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, require)
	return mod.exports
}

let compile, createSeriesEnv
try {
	compile = load('lib/pinescript/compile.ts').compile
	createSeriesEnv = load('lib/pinescript/pineParse.ts').createSeriesEnv
} catch (err) {
	console.error('PROBE FATAL cannot load module:', err.message)
	process.exit(2)
}

// open ≠ close CỐ Ý: nếu `open === close` thì `close > open` false ở MỌI bar và
// mọi phép so về điều kiện trở thành pass rỗng (L-E01).
const N = 60
const bars = {
	open: Array.from({ length: N }, (_, i) => 100 + Math.sin(i / 2) * 10),
	high: Array.from({ length: N }, (_, i) => 102 + Math.sin(i / 2) * 10),
	low: Array.from({ length: N }, (_, i) => 98 + Math.sin(i / 2) * 10),
	close: Array.from({ length: N }, (_, i) => 100 + Math.sin(i / 2 + 0.7) * 10),
	volume: Array.from({ length: N }, () => 1000),
}
const run = (src) => compile(src, bars)
const truth = bars.close.map((c, i) => (c > bars.open[i] ? 1 : -1))
const spread = bars.open.map((o, i) => o - bars.close[i])

const r = (v) => {
	if (v === undefined) return 'undefined'
	if (!Array.isArray(v)) return JSON.stringify(v)
	return `[${v.map((x) => (Number.isNaN(x) ? 'na' : Number(Number(x).toFixed(4)))).join(',')}]`
}

/** Đo một series, kiểm ĐỘ DÀI trước rồi mới so giá trị. */
function series(res, key, expectedFn) {
	if (res.errors.length) return `ERROR ${res.errors[0].message.slice(0, 80)}`
	const got = res.output[key] ?? []
	if (got.length !== N) return `LEN_GUARD_FAIL len=${got.length} want=${N}`
	const want = expectedFn()
	const bad = got.filter((v, i) => !(Number.isNaN(want[i]) ? Number.isNaN(v) : v === want[i])).length
	return `len=${N} MISMATCHED_BARS=${bad}/${N}`
}

/**
 * Đo MẬT ĐỘ (số bar có giá trị) của một series, theo điều kiện truth.
 *
 * Vì sao cần hàm riêng: series sinh ra trong nhánh `if` là DENS — bar nhánh
 * không chạy mang NaN, đúng ngữ nghĩa Pine. Case S4-B09 lỗi vì khoá TRONG
 * ghi đè khoá NGOÀI, nên khiếu khác biệt nằm ở MẬT ĐỘ (Small đông 35 thay vì
 * 10), không phải ở giá trị từng bar.
 *
 * So sánh theo "số bar có giá trị == số bar truth nói có", không so NaN bằng
 * NaN — vì `Number.isNaN(NaN)` là true nên so bằng `===` sẽ cho NaN == NaN,
 * tức là một series TOÀN NaN cũng "đúng".
 */
function density(res, key, maskFn) {
	if (res.errors.length) return `ERROR ${res.errors[0].message.slice(0, 80)}`
	const got = res.output[key] ?? []
	if (got.length !== N) return `LEN_GUARD_FAIL len=${got.length} want=${N}`
	const filled = got.filter((v) => !Number.isNaN(v)).length
	let expected = 0
	for (let i = 0; i < N; i++) if (maskFn(i)) expected++
	return `dens=${filled}/${expected}`
}

/**
 * Đo số lỗi compile có khớp mẫu không.
 *
 * Dùng cho hợp đồng fail-closed: script PHẢI báo lỗi, và lỗi phải nói đúng
 * điều. Không dùng hàm này để "cho phép" lỗi ở đâu đó — nếu một case bắt buộc
 * lỗi thì observable là thông báo, không phải việc script hỏng.
 */
function errors(res, pattern) {
	const n = res.errors.length
	if (pattern && !(n > 0 && pattern.test(res.errors[0].message))) {
		return `errors=${n} MSG_MISMATCH ${n > 0 ? res.errors[0].message.slice(0, 80) : '(no error)'}`
	}
	return `errors=${n}`
}

const cases = [
	{
		id: 'S4-01 destructure 3 bien tu ta.bb',
		src: `indicator("t")\n[m, u, l] = ta.bb(close, 20, 2)\nplot(m, title="M")\nplot(u, title="U")\nplot(l, title="L")`,
		expect: (res) => {
			if (res.errors.length) return `ERROR ${res.errors[0].message.slice(0, 80)}`
			const keys = Object.keys(res.output).sort().join(',')
			return `keys=${keys} lens=${['M', 'U', 'L'].map((k) => (res.output[k] || []).length).join('/')}`
		},
		want: ['keys=L,M,U lens=60/60/60'],
	},
	{
		id: 'S4-02 destructure 3 bien tu ta.macd',
		src: `indicator("t")\n[m, s, h] = ta.macd(close, 12, 26, 9)\nplot(m, title="M")\nplot(s, title="S")\nplot(h, title="H")`,
		expect: (res) => {
			if (res.errors.length) return `ERROR ${res.errors[0].message.slice(0, 80)}`
			return `keys=${Object.keys(res.output).sort().join(',')} lens=${['M', 'S', 'H'].map((k) => (res.output[k] || []).length).join('/')}`
		},
		want: ['keys=H,M,S lens=60/60/60'],
	},
	{
		id: 'S4-03 hist === macd - signal',
		src: `indicator("t")\n[m, s, h] = ta.macd(close, 12, 26, 9)\nplot(h - (m - s), title="D")`,
		expect: (res) => {
			if (res.errors.length) return `ERROR ${res.errors[0].message.slice(0, 80)}`
			const v = res.output.D ?? []
			let max = 0
			for (const x of v) if (!Number.isNaN(x)) max = Math.max(max, Math.abs(x))
			return `len=${v.length} max_abs_diff=${max}`
		},
		want: ['len=60 max_abs_diff=0'],
	},
	{
		id: 'S4-04 tham so signal phai CO tac dung',
		src: `indicator("t")\n[m1, s1] = ta.macd(close, 12, 26, 9)`,
		// 2 biến cho kết quả 3 giá trị => phải LỖI. Đây là canh arity, xem S4-05.
		expect: (res) => `errs=${res.errors.length} msg=${(res.errors[0] || {}).message || 'none'}`.slice(0, 120),
		want: ['errs=1', 'expected 2 value', 'produced 3'],
	},
	{
		id: 'S4-05 [a,b] = ta.sma (1 gia tri) phai LOI',
		src: `indicator("t")\n[a, b] = ta.sma(close, 14)\nplot(a)`,
		expect: (res) => `errs=${res.errors.length} msg=${(res.errors[0] || {}).message || 'none'}`.slice(0, 120),
		want: ['errs=1', 'expected 2 value', 'produced 1'],
	},
	{
		id: 'S4-06 gan 1 ten cho 3 gia tri phai LOI ke cach sua',
		src: `indicator("t")\nval = ta.bb(close, 20, 2)\nplot(val)`,
		expect: (res) => `errs=${res.errors.length} msg=${(res.errors[0] || {}).message || 'none'}`.slice(0, 140),
		want: ['errs=1', 'received a 3-value result', 'Destructure it instead'],
	},
	{
		id: 'S4-07 plot(<3 gia tri>) phai LOI, khong long mang',
		src: `indicator("t")\nplot(ta.bb(close, 20, 2))`,
		expect: (res) => `errs=${res.errors.length} keys=${JSON.stringify(Object.keys(res.output))}`,
		want: ['errs=1', 'keys=[]'],
	},
	{
		id: 'S4-08 REGRESSION x = 1',
		src: `indicator("t")\nx = 1\nplot(x, title="X")`,
		expect: (res) => series(res, 'X', () => new Array(N).fill(1)),
		want: ['len=60 MISMATCHED_BARS=0/60'],
	},
	{
		id: 'S4-09 REGRESSION close[1] la history offset',
		src: `indicator("t")\nplot(close[1], title="H")`,
		expect: (res) => series(res, 'H', () => bars.close.map((_, i) => (i === 0 ? NaN : bars.close[i - 1]))),
		want: ['len=60 MISMATCHED_BARS=0/60'],
	},
	{
		// S4-B05: UDF thân khối KHÔNG còn trả 60 NaN im lặng.
		// Bản cũ của case này chỉ kiểm `Inner`, bỏ qua `Outer` — mà `Outer`
		// chính là chỗ tiêu thụ giá trị trả về, và nó ra NaN 60 bar, không lỗi.
		// Đó là HAZARD 8: observable đo được, ý nghĩa hỏng.
		id: 'S4-10 S4-B05: UDF thân khối phải BÁO LỖI, không trả NaN',
		src: `indicator("t")\nf(x) =>\n  plot(x, title="Inner")\nplot(f(close), title="Outer")`,
		expect: (res) => errors(res, /block body/i),
		want: ['errors=1'],
	},
	{
		// S4-B05: cùng lý do với S4-10 cho thân có if/else. Observable là "báo
		// lỗi", không phải "Pos đúng" — vì gọi UDF thân khối mà không tiêu thụ
		// giá trị trả về không có trong grammar hiện tại.
		id: 'S4-11 S4-B05: UDF thân khối có if/else cũng phải báo lỗi',
		src: `indicator("t")\nf(x) =>\n  if x > 0\n    plot(1, title="Pos")\n  else\n    plot(0, title="NonPos")\nplot(f(open - close), title="Outer")`,
		expect: (res) => errors(res, /block body/i),
		want: ['errors=1'],
	},
	{
		id: 'S4-18 S4-B09: `if` LỒNG `if` — cả 3 nhánh đúng mật độ (bug có sẵn Stage 3)',
		// Bug có sẵn từ Stage 3, sống sót vì không probe/test nào chạm `if` lồng
		// `if`. `if` con chạy lại vòng 0..i nên `else` ngoài bị ghi đè:
		// đo được Big=21 Small=35 (truth 10) Neg=4 (truth 29), sai 25/60 bar,
		// KHÔNG một dòng lỗi.
		src: `indicator("t")\nif close > 100\n  if close > 105\n    plot(2, title="Big")\n  else\n    plot(1, title="Small")\nelse\n  plot(0, title="Neg")`,
		expect: (res) =>
			density(res, 'Big', (i) => bars.close[i] > 105) +
			density(res, 'Small', (i) => bars.close[i] > 100 && bars.close[i] <= 105) +
			density(res, 'Neg', (i) => bars.close[i] <= 100),
		want: ['dens=21/21dens=10/10dens=29/29'],
	},
	{
		id: 'S4-12 REGRESSION UDF bieu thuc o DONG KE TIEP van chay',
		src: `indicator("t")\nf(x) =>\n  x * 2\nplot(f(close), title="P")`,
		expect: (res) => series(res, 'P', () => bars.close.map((c) => c * 2)),
		want: ['len=60 MISMATCHED_BARS=0/60'],
	},
	{
		id: 'S4-13 REGRESSION UDF bieu thuc CUNG DONG van chay',
		src: `indicator("t")\nf(x) => x * 2\nplot(f(close), title="P")`,
		expect: (res) => series(res, 'P', () => bars.close.map((c) => c * 2)),
		want: ['len=60 MISMATCHED_BARS=0/60'],
	},
	{
		id: 'S4-14 REGRESSION de quy van bao loi',
		src: `indicator("t")\nf(x) => f(x)\nplot(f(close))`,
		expect: (res) => `errs=${res.errors.length} depth=${/MAX_CALL_DEPTH/.test((res.errors[0] || {}).message || '')}`,
		want: ['errs=1 depth=true'],
	},
	{
		id: 'S4-15 plot trong nhanh if (KHONG co UDF): do dai phai la N',
		src: `indicator("t")\nif open > close\n  plot(1, title="Up")\nelse\n  plot(0, title="Down")`,
		expect: (res) => series(res, 'Up', () => spread.map((s) => (s > 0 ? 1 : NaN))),
		want: ['len=60 MISMATCHED_BARS=0/60'],
	},
	{
		id: 'S4-16 REGRESSION if/else per-bar cua Stage 3 khong doi',
		src: `indicator("t")\nx = 0\nif close > open\n  x = 1\nelse\n  x = -1\nplot(x, title="X")`,
		expect: (res) => series(res, 'X', () => truth),
		want: ['len=60 MISMATCHED_BARS=0/60'],
	},
	{
		id: 'S4-17 REGRESSION for van per-bar (khong phai 1 lan/ chart)',
		src: `indicator("t")\nx = 0\nfor i = 0 to 2\n  x = close\nplot(x, title="X")`,
		expect: (res) => series(res, 'X', () => bars.close),
		want: ['len=60 MISMATCHED_BARS=0/60'],
	},
]

let unmet = 0
let noExpectation = 0
for (const c of cases) {
	const res = run(c.src)
	const line = c.expect(res)
	console.log(`PROBE ${c.id}`)
	console.log(`      ${line}`)
	if (!c.want) {
		noExpectation++
		console.log('      NO_EXPECTATION: case này KHÔNG được --assert bảo vệ')
		continue
	}
	const bad = c.want.filter((w) => !line.includes(w))
	if (bad.length) {
		unmet++
		console.log(`      UNMET: thiếu ${JSON.stringify(bad)}`)
	}
}
console.log(`\nprobe-pine-stage4: ${cases.length} case, ${cases.length - noExpectation} guarded, ${unmet} unmet, ${noExpectation} NO_EXPECTATION`)

// NO_EXPECTATION là FAIL, không phải cảnh báo: một case không ai canh thì việc
// nó đổi kết quả không ai thấy, đó là pass rỗng (L-E01) ở cấp probe.
if (ASSERT && (unmet > 0 || noExpectation > 0)) process.exit(1)
process.exit(0)