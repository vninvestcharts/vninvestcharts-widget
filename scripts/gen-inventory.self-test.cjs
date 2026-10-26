#!/usr/bin/env node
/**
 * gen-inventory.self-test.cjs - chung minh ba tinh chat cua khoi so sanh.
 *
 * BAT BUOC (HAZARD 12): quy tac duoc viet theo BAT BIEN, khong theo loi cu the.
 *   "Cung mot noi dung, hai hinh thuc xuong dong (LF / CRLF / co BOM), phai cho
 *    cung mot exit code."
 * Khong assert mot chuoi loi ma tac gia da biet - bien the do chi kiem qua khu,
 * khong kiem tuong lai.
 *
 * Self-test nay chạy TRÊN FILE THẬT của repo: `setEol`/`addBom`/case 3 ghi đè
 * `GENERATED` rồi khôi phục trong `finally`. Đây là điểm NGUY HIỂM có chủ đích:
 * nếu tiến trình bị giết giữa mutate và restore, cây còn lại mang CRLF/BOM/mutant.
 * Vì vậy phải chạy khi cây sạch, và luôn kiểm `git status` sau khi chạy.
 *
 * Dung: node scripts/gen-inventory.self-test.cjs
 */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const TOOLS = path.join(ROOT, 'docs', 'system-design', '_meta', 'tools')
const GENERATED = [
	path.join(ROOT, 'docs', 'system-design', '_meta', 'inventory.json'),
	path.join(ROOT, 'docs', 'system-design', '_meta', 'freshness-report.md'),
	path.join(ROOT, 'docs', 'system-design', '07-PUBLIC-API-SPEC', '07.02-public-api-catalog.md'),
	path.join(ROOT, 'docs', 'system-design', '06-DATA-ARCHITECTURE', '06.02-series-and-capability-catalog.md'),
	path.join(ROOT, 'docs', 'system-design', '10-QUALITY-SECURITY', '10.03-findings-register.md'),
	path.join(ROOT, 'docs', 'system-design', '07-PUBLIC-API-SPEC', '07.03-license-matrix.md'),
]

let pass = 0
let fail = 0
const ok = (name) => {
	console.log(`  PASS  ${name}`)
	pass++
}
const bad = (name, detail) => {
	console.error(`  FAIL  ${name}${detail ? ' - ' + detail : ''}`)
	fail++
}

/** Chay lenh, tra exit code thay vi nem - nem se bo phan restore (HAZARD 15). */
function run(script, args, cwd) {
	try {
		execFileSync(process.execPath, [script, ...args], { cwd, stdio: 'pipe' })
		return 0
	} catch (e) {
		return typeof e.status === 'number' ? e.status : 1
	}
}

/** Bien doi noi dung theo dang xuong dong. 'lf' | 'crlf' */
function setEol(file, form) {
	const s = fs.readFileSync(file, 'utf8')
	const out = form === 'crlf' ? s.replace(/\r?\n/g, '\r\n') : s.replace(/\r?\n/g, '\n')
	fs.writeFileSync(file, out, 'utf8')
}

function addBom(file) {
	const s = fs.readFileSync(file, 'utf8')
	if (s.startsWith('\uFEFF')) return false
	fs.writeFileSync(file, '\uFEFF' + s, 'utf8')
	return true
}

function stripBom(file) {
	const s = fs.readFileSync(file, 'utf8')
	fs.writeFileSync(file, s.replace(/^\uFEFF/, ''), 'utf8')
}

/**
 * Case 1 - EOL: cung noi dung o LF va CRLF phai cho CUNG exit code.
 * Day la invariant ma bai toan goc nhắm tới.
 */
function caseEolInvariant(script, label) {
	console.log(`\n[case] EOL invariant - ${label} (${path.basename(script)})`)
	const before = GENERATED.map((f) => [f, fs.readFileSync(f)])
	try {
		for (const f of GENERATED) setEol(f, 'lf')
		const lfExit = run(script, ['--check'], ROOT)
		for (const f of GENERATED) setEol(f, 'crlf')
		const crlfExit = run(script, ['--check'], ROOT)

		if (lfExit !== 0) {
			// BASE PHẢI XANH, nếu không case này HƯỐNG.
			//
			// Đây là lỗ hổng thật đã bị audit Stage 5 bắt: khi nền đỏ (tài liệu thật
			// sự lạc hậu vì source vừa đổi), CẢ LF lẫn CRLF đều trả 1, nên phép so
			// sánh `crlfExit === lfExit` **luôn đúng** ⇒ case PASS trong khi so sánh
			// vẫn nhạy EOL. Một cổng không bao giờ đỏ là một cổng không tồn tại.
			//
			// Nên: nền đỏ ⇒ FAIL, kèm lệnh để sửa. Chạy generator trước rồi test lại.
			bad(`${label}: nen phai XANH truoc khi kiem bat bien EOL`, `LF exit=${lfExit} - chay generator truoc`)
			return
		}
		if (crlfExit === lfExit) ok(`${label}: CRLF == LF (exit ${crlfExit})`)
		else bad(`${label}: CRLF khac LF`, `LF=${lfExit} CRLF=${crlfExit} - con so sanh nhay EOL`)
	} finally {
		for (const [f, buf] of before) fs.writeFileSync(f, buf)
	}
}

/**
 * Case 2 - BOM: cung noi dung, them BOM, van phai cung exit code.
 * Bien the nao khong do tac gia viet ra khi viet bai.
 */
function caseBomInvariant(script, label) {
	console.log(`\n[case] BOM invariant - ${label} (${path.basename(script)})`)
	const before = GENERATED.map((f) => [f, fs.readFileSync(f)])
	try {
		for (const f of GENERATED) stripBom(f)
		const baseExit = run(script, ['--check'], ROOT)
		if (baseExit !== 0) {
			// Cung ly do voi case EOL: nen xanh thi case nay moi so sanh BOM voi
			// nen cua no. Nen do thi ca hai deu 1 va phep so sanh luong dua.
			bad(`${label}: nen phai XANH truoc khi kiem bat bien BOM`, `exit=${baseExit} - chay generator truoc`)
			return
		}
		let added = 0
		for (const f of GENERATED) if (addBom(f)) added++
		const bomExit = run(script, ['--check'], ROOT)
		if (bomExit === baseExit) ok(`${label}: BOM khong doi exit (nen=${baseExit}, ${added} file)`)
		else bad(`${label}: BOM lam doi exit`, `nen=${baseExit} coBOM=${bomExit}`)
	} finally {
		for (const [f, buf] of before) fs.writeFileSync(f, buf)
	}
}

/**
 * Case 3 - phat hien noi dung that su: doi MOT KY TU trong file sinh, --check phai
 * bat duoc. Khong co case nay thi case 1/2 deu xanh doi mot hang so (HAZARD 9:
 * gate chi ton tai chua bao gio chay).
 *
 * Phai dung `target` - file CU THE ma script nao do giup. Ban dau case nay sua
 * `inventory.json` cho ca hai script, nhung `gen-findings` doc
 * `10.03-findings-register.md` nen khong bao gi ca, va case FAIL giong het mot
 * gate bi cam ba bien doi ma van xanh.
 */
function caseStillDetectsRealChange(script, label, target) {
	console.log(`\n[case] van bat loi that - ${label} (${path.basename(script)})`)
	const all = GENERATED.map((f) => [f, fs.readFileSync(f)])
	try {
		for (const f of GENERATED) setEol(f, 'crlf')
		const s = fs.readFileSync(target, 'utf8')
		// Bien the: chen them MOT KY TU vao noi dung.
		//
		// Khong hardcode ky tu can mutate. Ban dau case nay tim dau tien `(`, nhung
		// `inventory.json` la JSON thuan - khong co `(` nao - nen case FAIL. Mot
		// self-test that "khong tim thay ky tu" KHONG phai la self-test, no khong
		// chung minh gi ca. Nen bien dot theo BAT BIEN: them ky tu ngay truoc token
		// `UTC` (nam o moi file sinh), va neu file nao khong co token do thi dung
		// `:` la fallback.
		let mutated = s.replace(' UTC', ' __SELF_TEST_MUTANT__ UTC')
		if (mutated === s) mutated = s.replace(':', ':__SELF_TEST_MUTANT__')
		if (mutated === s) {
			bad(`${label}: khong bien dot duoc ${path.basename(target)}`)
			return
		}
		fs.writeFileSync(target, mutated, 'utf8')
		const exit = run(script, ['--check'], ROOT)
		if (exit !== 0) ok(`${label}: doi noi dung that -> exit ${exit}`)
		else bad(`${label}: doi noi dung that van xanh`, 'gate khong con doc file')
	} finally {
		for (const [f, buf] of all) fs.writeFileSync(f, buf)
	}
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-eol-selftest-'))
console.log(`CANH BAO: self-test ghi de TREN ${GENERATED.length} FILE THAT cua repo, khoi phuc trong "finally".`)
// TMP chi con de giu moc, khong phai noi chay. Xem docblock: file that bi sua.
console.log(`(temp giu moc tai ${TMP})`)

try {
	for (const [script, label, target] of [
		[path.join(TOOLS, 'gen-inventory.mjs'), 'gen-inventory', GENERATED[0]],
		[path.join(TOOLS, 'gen-findings.mjs'), 'gen-findings', GENERATED[4]],
	]) {
		caseEolInvariant(script, label)
		caseBomInvariant(script, label)
		caseStillDetectsRealChange(script, label, target)
	}

	console.log(`\n${'='.repeat(52)}`)
	if (fail === 0) {
		console.log(`SELF-TEST PASS: ${pass} case theo dac ta.`)
		process.exit(0)
	}
	console.error(`SELF-TEST FAIL: ${pass} pass / ${fail} fail.`)
	process.exit(1)
} finally {
	fs.rmSync(TMP, { recursive: true, force: true })
}