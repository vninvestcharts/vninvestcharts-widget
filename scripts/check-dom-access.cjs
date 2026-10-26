#!/usr/bin/env node
/**
 * check-dom-access — CỔNG ĐO NỢ DOM TRUY CẬP TRỰC TIẾP (D-03).
 *
 * ## Vì sao cần
 *
 * `.eslintrc` cấm `window`/`document` ("Use injected adapters instead"). Nhưng
 * `no-restricted-globals` chiếm **688/711** lỗi trong `config/lint-baseline.json`, và
 * `lint:ratchet` chỉ chặn lỗi **MỚI**. Kết quả: cổng báo xanh trong khi kiến trúc nó
 * bảo vệ chưa từng được áp dụng. Đó là cổng **xanh giả** — nguy hiểm hơn cổng đỏ vì
 * không ai hỏi.
 *
 * Cổng này **không** thay thế lint ratchet. Nó tách hai thứ đang bị trộn:
 *
 * | | phạm vi | hướng |
 * |:--|:--|:--|
 * | `lint:ratchet` | rule ESLint, từng rule | chỉ chặn lỗi mới |
 * | cổng này | **production** (không tính test, không tính `.css`) | chặn cả lỗi mới **và** đo được nợ lịch sử để hạ dần |
 *
 * ## Vì sao bỏ file test khỏi phạm vi
 *
 * Đo 2026-10-14 (cwd = repo gốc):
 *
 * | phạm vi | file | `document.` | `window.` | tổng |
 * |:--|--:|--:|--:|--:|
 * | **production** | **95** | 124 | 310 | **434** |
 * | tất cả (kèm test) | 248 | 747 | 658 | 1405 |
 *
 * Con số **1405** là tổng của cả test, mà `__tests__` **được phép** chạm DOM trực tiếp
 * (JSDOM, `document.body.innerHTML = …`). Dùng 1405 làm ngưỡng sẽ biến cổng thành một
 * con số vô nghĩa. Nợ thật là **434**.
 *
 * ## Trần
 *
 * `config/dom-access-budget.json` giữ trần. Ratchet: **chỉ xuống**. Tăng trần cần
 * coordinator duyệt và `### Trade-off` trong `AUDIT_LEDGER.md` (L-P01).
 *
 * ## Tự kiểm
 *
 * `--self-test` chạy chính cổng này như child process trên bản sao có vi phạm cài
 * sẵn, và **đòi exit ≠ 0** (L-E06). Một self-test chỉ có case dương thì không bắt được
 * gì — đã xảy ra hai lần trong repo này.
 */

'use strict'

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const SCAN_ROOT = path.join(ROOT, 'src')
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx'])
const BUDGET_FILE = path.join(ROOT, 'config', 'dom-access-budget.json')

/** File test được miễn: chúng cố ý chạm DOM (JSDOM). */
function isTestFile(rel) {
	return rel.includes(`${path.sep}__tests__${path.sep}`) || /\.(test|spec)\.[jt]sx?$/.test(rel)
}

function walk(dir, out) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) walk(full, out)
		else if (EXTS.has(path.extname(entry.name))) out.push(full)
	}
	return out
}

/** Đếm truy cập DOM trong file production. Không bỏ qua comment — nhưng có báo số đo. */
function measure() {
	const files = walk(SCAN_ROOT, [])
	let scanned = 0
	let testSkipped = 0
	let prodFiles = 0
	let documentHits = 0
	let windowHits = 0
	const offenders = []

	for (const file of files) {
		const rel = path.relative(ROOT, file)
		if (isTestFile(rel)) {
			testSkipped++
			continue
		}
		const text = fs.readFileSync(file, 'utf8')
		const doc = (text.match(/\bdocument\s*\./g) || []).length
		const win = (text.match(/\bwindow\s*\./g) || []).length
		scanned++
		if (doc + win === 0) continue
		prodFiles++
		documentHits += doc
		windowHits += win
		offenders.push({ file: rel.split(path.sep).join('/'), doc, win })
	}
	offenders.sort((a, b) => b.doc + b.win - (a.doc + a.win))
	return { scanned, testSkipped, prodFiles, documentHits, windowHits, total: documentHits + windowHits, offenders }
}

function readBudget() {
	if (!fs.existsSync(BUDGET_FILE)) {
		return { maxTotal: 434, maxFiles: 95 }
	}
	const raw = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'))
	return { maxTotal: raw.maxTotal, maxFiles: raw.maxFiles }
}

function report(m, budget, limit) {
	const top = m.offenders.slice(0, 5).map((o) => `      ${String(o.doc + o.win).padStart(4)}  ${o.file}`)
	console.log(`check-dom-access`)
	// L-G02: in SỐ FILE ĐÃ QUÉT. Cổng hẹp phạm vi vẫn in PASS — số này là thứ chứng minh
	// phạm vi, và phải đọc mỗi lần chạy chứ không tin mặc định.
	console.log(`  scanned ${m.scanned} production file(s), skipped ${m.testSkipped} test file(s)`)
	console.log(`  ${m.prodFiles} file(s) touch the DOM · document. ${m.documentHits} · window. ${m.windowHits} · total ${m.total}`)
	if (top.length > 0) {
		console.log(`  worst offenders:`)
		for (const line of top) console.log(line)
	}
	console.log(`  budget: total ${m.total} <= ${budget.maxTotal}? files ${m.prodFiles} <= ${budget.maxFiles}?`)
	if (m.total <= limit.maxTotal && m.prodFiles <= limit.maxFiles) {
		console.log(`PASS`)
		return 0
	}
	console.error(`FAIL: DOM access budget exceeded (ratchet: ceilings only go DOWN).`)
	console.error(`  Over by: total ${m.total - limit.maxTotal}, files ${m.prodFiles - limit.maxFiles}`)
	console.error(`  Do NOT raise config/dom-access-budget.json to make this green (L-P01).`)
	return 1
}

function selfTest() {
	const cases = []
	const m = measure()
	const budget = readBudget()

	// Case dương: cây sạch phải xanh.
	cases.push({ name: 'clean tree exits 0', pass: runCheck() === 0 })

	// Case ÂM TÍNH thật: cài vi phạm vào file production, cổng phải ĐỎ.
	// Không có case âm tính thì self-test in PASS mà không kiểm gì (L-E06).
	//
	// Đo 2026-10-18 (QUICKTRADE_PILLS): sau khi strip bỏ hết `window.`/`document.`,
	// nợ DOM thật (431/434) có slack 3 — probe "+1 hit" cố định không còn vượt trần
	// và case âm tính chết giả (exit 0 dù probe hợp lệ). Probe phải vượt slack hiện tại:
	// ghi đúng (trần − hiện tại + 1) hit để chắc chắn vượt, bất kể nợ co xuống bao nhiêu.
	const probe = path.join(SCAN_ROOT, '__dom_access_probe.ts')
	const original = fs.existsSync(probe) ? fs.readFileSync(probe, 'utf8') : null
	try {
		const hits = Math.max(1, budget.maxTotal - m.total + 1)
		const body = Array.from({ length: hits }, (_, i) => `export const probe${i} = () => document.title`).join('\n') + '\n'
		fs.writeFileSync(probe, body)
		cases.push({ name: `production file with document. x${hits} exits non-zero`, pass: runCheck() !== 0 })
	} finally {
		if (original === null) fs.rmSync(probe, { force: true })
		else fs.writeFileSync(probe, original)
	}

	// Case âm tính 2: file TEST chứa DOM không được làm đỏ (phạm vi đúng).
	const testProbe = path.join(SCAN_ROOT, '__tests__', '__dom_access_probe.test.ts')
	const testDir = path.dirname(testProbe)
	const dirExisted = fs.existsSync(testDir)
	try {
		if (!dirExisted) fs.mkdirSync(testDir, { recursive: true })
		fs.writeFileSync(testProbe, 'export const probe = () => document.title\n')
		cases.push({ name: 'test file with document. stays green (scope)', pass: runCheck() === 0 })
	} finally {
		fs.rmSync(testProbe, { force: true })
		if (!dirExisted) fs.rmSync(testDir, { recursive: true, force: true })
	}

	const after = measure()
	cases.push({ name: 'probes removed, counts restored', pass: after.total === m.total && after.scanned === m.scanned })
	void budget

	let failed = 0
	for (const c of cases) {
		if (!c.pass) failed++
		console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}`)
	}
	console.log(`check-dom-access --self-test: ${cases.length - failed}/${cases.length} passed`)
	return failed === 0 ? 0 : 1
}

function runCheck() {
	try {
		execFileSync(process.execPath, [__filename], { cwd: ROOT, stdio: 'pipe' })
		return 0
	} catch (err) {
		return typeof err.status === 'number' && err.status !== 0 ? err.status : 1
	}
}

if (process.argv.includes('--self-test')) {
	process.exit(selfTest())
}
process.exit(report(measure(), readBudget(), readBudget()))
