#!/usr/bin/env node
/**
 * fail-before-pine-w02.mjs — CHỨNG MINH FAIL-BEFORE CHO W-02 (AC-8.35).
 *
 * Swap `compile.ts` về `216a8cd`, chạy `pineFailClosed.test.ts`, đòi **ĐỎ**,
 * restore + so byte. Cùng cơ chế `fail-before-pine-w01.mjs`, và cùng lý do
 * không dùng `git checkout -- <file>` (hazard 11).
 *
 * ⚠ `MAX_FOR_ITERATIONS` KHÔNG tồn tại ở baseline ⇒ `pineFailClosed.test.ts`
 * sẽ chết ngay ở `import` (SyntaxError named export), tức đỏ vì **lý do khác**
 * chứ không phải vì assertion. Đó là fail-before rỗng.
 *
 * Nên script này đo **observable trực tiếp** qua API công khai `compile()` /
 * `callFunction()` — hai hàm có mặt ở CẢ hai phiên bản — và tự kết luận
 * fail-before. Test vitest riêng thì được supervisor chạy lại trên code đã
 * fix ở Stage 6.
 */
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASE = '216a8cd'
const TARGET = 'src/lib/pinescript/compile.ts'
const KEEP = path.join(process.env.TEMP || '.', 'pine3-failbefore-w02')

const N = 60
const bars = {
	open: Array.from({ length: N }, (_, i) => 100 + Math.sin(i / 2) * 10),
	high: Array.from({ length: N }, (_, i) => 101 + Math.sin(i / 2) * 10),
	low: Array.from({ length: N }, (_, i) => 99 + Math.sin(i / 2) * 10),
	close: Array.from({ length: N }, (_, i) => 100 + Math.sin(i / 2 + 0.7) * 10),
	volume: new Array(N).fill(1000),
}

/** Mỗi case: tên, đo được, và kỳ vọng TRƯỚC fix / SAU fix. */
function measure() {
	const require = createRequire(path.join(ROOT, 'x.js'))
	const esbuild = require('esbuild')
	const out = esbuild.buildSync({
		entryPoints: [path.join(ROOT, TARGET)],
		bundle: true, format: 'cjs', write: false, platform: 'node',
		absWorkingDir: ROOT, logLevel: 'silent',
	})
	const mod = { exports: {} }
	new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, require)
	const { compile, callFunction } = mod.exports
	const env = new Map(Object.entries(bars))

	const utils = esbuild.buildSync({
		entryPoints: [path.join(ROOT, 'src/lib/indicators/utils.ts')],
		bundle: true, format: 'cjs', write: false, platform: 'node',
		absWorkingDir: ROOT, logLevel: 'silent',
	})
	const umod = { exports: {} }
	new Function('module', 'exports', 'require', utils.outputFiles[0].text)(umod, umod.exports, require)

	const results = {}

	// AC-5.16 — max |ta.rsi - rsiSeries|
	try {
		const got = callFunction('ta.rsi', [bars.close, new Array(N).fill(14)], N, env)
		const want = umod.exports.rsiSeries(bars.close, 14)
		let maxAbs = 0
		for (let i = 0; i < N; i++) {
			if (Number.isFinite(want[i]) && Number.isFinite(got[i])) maxAbs = Math.max(maxAbs, Math.abs(want[i] - got[i]))
		}
		results['AC-5.16 ta.rsi vs SSOT'] = { value: maxAbs, before: '>0', after: '<1e-9', ok: maxAbs < 1e-9 }
	} catch (e) {
		results['AC-5.16 ta.rsi vs SSOT'] = { value: `THREW ${e.message.slice(0, 50)}`, before: '>0', after: '<1e-9', ok: false }
	}

	// AC-4.13 — max với series ngắn hơn phải throw
	try {
		const r = callFunction('max', [bars.close, bars.close.slice(0, N - 5)], N, env)
		results['AC-4.13 max short series'] = { value: 'returned number (no throw)', before: 'no throw', after: 'THROW', ok: false, got: true }
	} catch (e) {
		results['AC-4.13 max short series'] = { value: `THREW: ${e.message.slice(0, 44)}`, before: 'no throw', after: 'THROW', ok: true }
	}

	// AC-4.14 — pow thiếu số mũ phải throw
	try {
		const r = callFunction('pow', [bars.close], N, env)
		results['AC-4.14 pow no exponent'] = { value: `returned x^2 (first=${r[0]?.toFixed(1)})`, before: 'no throw', after: 'THROW', ok: false }
	} catch (e) {
		results['AC-4.14 pow no exponent'] = { value: `THREW: ${e.message.slice(0, 40)}`, before: 'no throw', after: 'THROW', ok: true }
	}

	// AC-3.9 — for 10 to 1 phải báo lỗi
	{
		const r = compile(`indicator("t")\nacc = 0\nfor i = 10 to 1\n  acc = acc + 1\nplot(acc, title="A")`, bars)
		const n = r.errors.length
		results['AC-3.9 for 10 to 1'] = { value: `errors=${n}`, before: 'errors=0', after: 'errors>0', ok: n > 0 }
	}

	// AC-3.10 — for 0..5000 phải báo lỗi (không cắt âm thầm)
	{
		const r = compile(`indicator("t")\nacc = 0\nfor i = 0 to 5000\n  acc = acc + 1\nplot(acc, title="A")`, bars)
		const n = r.errors.length
		const acc0 = r.output.A?.[0]
		results['AC-3.10 for 0..5000'] = { value: `errors=${n} acc=${acc0}`, before: 'errors=0', after: 'errors>0', ok: n > 0 }
	}

	// AC-3.12 (control) — for 0..3 vẫn ra acc=4 Ở CẢ HAI PHIÊN BẢN
	{
		const r = compile(`indicator("t")\nacc = 0\nfor i = 0 to 3\n  acc = acc + 1\nplot(acc, title="A")`, bars)
		const acc0 = r.output.A?.[0]
		results['AC-3.12 CONTROL for 0..3'] = { value: `errors=${r.errors.length} acc=${acc0}`, before: 'errors=0 acc=4', after: 'errors=0 acc=4', ok: r.errors.length === 0 && acc0 === 4, control: true }
	}

	return results
}

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')
const target = path.join(ROOT, TARGET)
const before = sha(target)
fs.mkdirSync(KEEP, { recursive: true })
fs.copyFileSync(target, path.join(KEEP, 'compile.ts'))

let restored = false
let beforeResults = null
try {
	console.log(`--- [1/4] swap sang baseline ${BASE} ---`)
	fs.writeFileSync(target, execFileSync('git', ['show', `${BASE}:${TARGET}`], { cwd: ROOT }))

	console.log('--- [2/4] do tren code TRUOC fix (kỳ vọng: FAIL) ---')
	beforeResults = measure()
	for (const [k, v] of Object.entries(beforeResults)) {
		console.log(`    ${v.control ? 'CTRL ' : '     '}${k.padEnd(26)} = ${String(v.value).slice(0, 60)}`)
	}
} finally {
	console.log('--- [3/4] restore ---')
	fs.copyFileSync(path.join(KEEP, 'compile.ts'), target)
	console.log('--- [4/4] so byte ---')
	const now = sha(target)
	const same = now === before
	console.log(`    ${same ? 'identical' : '!! DIFFERENT'}  ${TARGET}`)
	restored = same
}

if (!restored || !beforeResults) process.exit(1)

console.log('\n--- FAIL-BEFORE: case nao da XANH tren baseline? (phai la 0 truot fix) ---')
const wronglyGreen = Object.entries(beforeResults).filter(([, v]) => v.ok && !v.control)
for (const [k, v] of wronglyGreen) console.log(`    !! ${k}: ${v.value}`)
console.log(`    so case xanh ngoac yenh truoc fix: ${wronglyGreen.length}`)

console.log('\n--- xac nhan lai tren code DA FIX (kỳ vọng: PASS) ---')
const afterResults = measure()
let bad = 0
for (const [k, v] of Object.entries(afterResults)) {
	console.log(`    ${v.ok ? 'ok  ' : 'FAIL'} ${k.padEnd(26)} = ${String(v.value).slice(0, 60)}`)
	if (!v.ok) bad++
}

if (wronglyGreen.length > 0) {
	console.log('\nFAIL-BEFORE KHONG CHỨNG MINH ĐƯỢC: co case xanh sẵn ở baseline.')
	process.exit(1)
}
if (bad > 0) {
	console.log(`\nSAU FIX van con ${bad} case FAIL`)
	process.exit(1)
}
console.log('\nFAIL-BEFORE PROOF OK: 0/5 case xanh o baseline -> 5/5 xanh sau fix; control giu nguyen; restore byte-identical.')
