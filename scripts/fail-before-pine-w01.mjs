#!/usr/bin/env node
/**
 * fail-before-pine-w01.mjs — CHỨNG MINH FAIL-BEFORE CHO W-01 (AC-8.35).
 *
 * L-P05 (`docs/LESSONS/process.md`): test xanh CẢ trước và sau fix thì không
 * phải bằng chứng. Script này chứng minh observable AC-1 **đổi** khi đổi code:
 *
 *   1. copy 2 file sản phẩm ra %TEMP% + ghi hash
 *   2. thay bằng bản `216a8cd` (baseline trước W-01)
 *   3. đo lại observable ⇒ phải **ĐỎ** (n_keys = 0)
 *   4. restore + **so byte** (không dùng `git checkout -- <file>` — hazard 11)
 *
 * Vì sao đo bằng script chứ không vitest: `pineBlocks.test.ts` import
 * `buildBlocks` từ `pineBlocks.ts` — file **không tồn tại ở baseline**, nên swap
 * xong test chỉ chết vì import chứ không phải vì assertion. Đó là fail-before
 * **rỗng**: nó đỏ vì một lý do khác. Script này chỉ dùng API công khai
 * `compile()`, chạy được trên CẢ hai phiên bản, nên đỏ ở baseline là do hành
 * vi thật.
 *
 * Run: node scripts/fail-before-pine-w01.mjs
 */
import { createRequire } from 'node:module'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASE = '216a8cd'
const TARGETS = ['src/lib/pinescript/grammar.ts', 'src/lib/pinescript/pineParse.ts']
const KEEP = path.join(process.env.TEMP || '.', 'pine3-failbefore-w01')

/** AC-1 observable: `if/else` + hai `plot` sau khoá ⇒ phải ra HAI series riêng. */
const SCRIPT = [
	'indicator("t")',
	'if close > open',
	'  x = 1',
	'else',
	'  x = -1',
	'plot(x, title="A")',
	'plot(close, title="B")',
].join('\n')

function measure() {
	const require = createRequire(path.join(ROOT, 'x.js'))
	const esbuild = require('esbuild')
	const out = esbuild.buildSync({
		entryPoints: [path.join(ROOT, 'src/lib/pinescript/compile.ts')],
		bundle: true, format: 'cjs', write: false, platform: 'node',
		absWorkingDir: ROOT, logLevel: 'silent',
	})
	const mod = { exports: {} }
	new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, require)
	const bars = {
		open: [1, 2, 3, 4], high: [2, 3, 4, 5], low: [0, 1, 2, 3],
		close: [2, 1, 4, 3], volume: [1, 1, 1, 1],
	}
	const res = mod.exports.compile(SCRIPT, bars)
	return {
		keys: Object.keys(res.output).sort(),
		errors: res.errors.map((e) => String(e.message).slice(0, 60)),
	}
}

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')
const hashesBefore = {}
fs.mkdirSync(KEEP, { recursive: true })
for (const t of TARGETS) {
	const p = path.join(ROOT, t)
	hashesBefore[t] = sha(p)
	fs.copyFileSync(p, path.join(KEEP, path.basename(t)))
}

let ok = false
try {
	console.log(`--- [1/4] swap sang baseline ${BASE} ---`)
	for (const t of TARGETS) {
		const buf = execFileSync('git', ['show', `${BASE}:${t}`], { cwd: ROOT })
		fs.writeFileSync(path.join(ROOT, t), buf)
	}

	console.log('--- [2/4] do observable tren code TRUOC fix ---')
	const before = measure()
	console.log(`    keys=${JSON.stringify(before.keys)} errors=${JSON.stringify(before.errors)}`)
	const red = before.keys.length === 0
	console.log(`    FAIL-BEFORE RED (keys === 0)? ${red}`)
	if (!red) {
		console.log('    !! KHONG DO — test khong phan bi duoc fix')
	} else {
		ok = true
	}
} finally {
	console.log('--- [3/4] restore ---')
	for (const t of TARGETS) {
		fs.copyFileSync(path.join(KEEP, path.basename(t)), path.join(ROOT, t))
	}
	console.log('--- [4/4] so byte ---')
	let clean = true
	for (const t of TARGETS) {
		const now = sha(path.join(ROOT, t))
		const same = now === hashesBefore[t]
		console.log(`    ${same ? 'identical' : '!! DIFFERENT'}  ${t}`)
		if (!same) clean = false
	}
	if (!clean) ok = false
}

if (!ok) process.exit(1)

console.log('--- xac nhan lai tren code DA FIX ---')
const after = measure()
console.log(`    keys=${JSON.stringify(after.keys)} errors=${JSON.stringify(after.errors)}`)
if (after.keys.length !== 2) {
	console.log('    !! sau fix van khong ra 2 series')
	process.exit(1)
}
console.log('FAIL-BEFORE PROOF OK: 0 series truoc fix -> 2 series sau fix; restore byte-identical.')
