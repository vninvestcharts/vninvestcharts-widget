#!/usr/bin/env node
/**
 * FAIL-BEFORE cho W-03 (PINE Stage 3 — đánh giá per-bar + cú pháp lõi).
 *
 * Cơ chế: khôi phục `src/lib/pinescript/compile.ts` từ commit cha của W-03
 * (mặc định `84ba429`), chạy `pinePerBar.test.ts`, rồi ĐẢM BẢO file đã được
 * khôi phục về đúng byte gốc trước khi thoát.
 *
 * Luật bất di bất dịch (theo `docs/LESSONS/`):
 *   - KHÔNG `git checkout -- <file>` khi file đang có WIP → mất code.
 *   - Mọi `git show` ghi ra file TẠM, so sánh SHA-256, rồi mới copy đè.
 *   - Thoát với code khác 0 khi file gốc KHÔNG được khôi phục.
 *
 * Chạy: `node scripts/fail-before-pine-w03.mjs`
 */

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, copyFileSync, unlinkSync, mkdtempSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const TARGET = 'src/lib/pinescript/compile.ts'
const TEST_FILE = 'src/lib/pinescript/pinePerBar.test.ts'
// 84ba429 = commit mà W-03 bắt đầu (origin/dev trước W-03).
const BASE = process.argv[2] ?? '84ba429'

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex')

const git = (...args) =>
	execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

const restore = (ref, dest) => {
	const tmp = join(mkdtempSync(join(tmpdir(), 'fb-w03-')), 'compile.ts')
	writeFileSync(tmp, git('show', `${ref}:${TARGET}`), 'utf8')
	copyFileSync(tmp, dest)
	unlinkSync(tmp)
	return sha(dest)
}

const abs = resolve(process.cwd(), TARGET)
const before = sha(abs)
let pass = false
let restored = false

try {
	// 0. Chặn sớm nếu WIP chưa commit: file đang sửa sẽ bị mất khi khôi phục.
	const dirty = git('status', '--porcelain', '--', TARGET).trim()
	if (dirty) {
		console.error(`FAIL-BEFORE: ${TARGET} có thay đổi CHƯA COMMIT.`)
		console.error('  Commit hoặc stash trước khi chạy, nếu không sẽ MẤT code.')
		process.exit(2)
	}

	// 1. Chụp bản gốc ra file tạm (phòng khi script bị tắt giữa chừng).
	const backup = join(mkdtempSync(join(tmpdir(), 'fb-w03-bak-')), 'compile.ts')
	copyFileSync(abs, backup)
	try {
		// 2. Đưa file về bản CŨ.
		const baseHash = restore(BASE, abs)
		console.log(`fail-before-pine-w03: ${TARGET} @ ${BASE} = ${baseHash.slice(0, 16)}`)

		// 3. Chạy test. Kỳ vọng: FAIL (bằng chứng bug tồn tại ở bản cũ).
		//
		// Gọi `vitest` TRỰC TIẾP (không qua `npx`) và ép reporter JSON: `npx` +
		// stdio pipe không trả gì (0 byte cả 2 luồng — đo ở `216a8cd`), còn
		// output text của vitest đổi hình dạng theo TTY nên regex rất dễ trượt.
		// JSON là hợp đồng máy-đọc-duy-nhất.
		const vitest = join(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs')
		const outFile = join(mkdtempSync(join(tmpdir(), 'fb-w03-out-')), 'result.json')
		// Non-zero exit ở đây là ĐÚNG THẦN KỲ VẠN: ta cố ý chạy trên bản cũ để
		// nó fail. Nên KHÔNG dùng exit code để kết luận — chỉ JSON mới là thứ
		// đáng tin. (Bản sửa đầu tiên coi non-zero là "collect lỗi" và báo sai.)
		try {
			execFileSync(
				process.execPath,
				[vitest, 'run', TEST_FILE, '--reporter=json', '--outputFile', outFile],
				{ stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 64 * 1024 * 1024 },
			)
		} catch {
			// Bỏ qua — JSON bên dưới mới là nguồn sự thật.
		}
		let result = null
		try {
			result = JSON.parse(readFileSync(outFile, 'utf8'))
		} catch (e) {
			console.error(`FAIL-BEFORE: khong doc duoc JSON cua vitest (${e.message}).`)
		}
		const failed = Number(result?.numFailedTests ?? 0)
		const total = Number(result?.numTotalTests ?? 0)
		console.log(`fail-before-pine-w03: vitest ${failed}/${total} test(s) failed tren ban CU`)
		// Không có JSON ⇒ vitest không chạy được (hỏng toolchain / module thiếu ở
		// bản cũ) ⇒ bug hành vi CHƯA hề được kiểm tra.
		const collectErr = result === null || total === 0
		if (collectErr) console.error('FAIL-BEFORE: khong chay duoc test tren ban CU — chua kiem tra duoc bug.')
		pass = !collectErr && failed > 0
	} finally {
		// 4. KHÔNG ĐỂ file ở bản cũ — khôi phục bản WIP trước khi báo cáo.
		copyFileSync(backup, abs)
	}
} finally {
	// 5. Kiểm tra byte: file phải về đúng WIP ban đầu.
	const after = sha(abs)
	restored = after === before
	console.log(`fail-before-pine-w03: khoi phuc ${restored ? 'OK' : 'THAT BAI'} (${after.slice(0, 16)})`)
}

if (!restored) {
	console.error('FAIL-BEFORE: KHÔNG khoi phuc duoc file goc. Kiem tra `git diff` ngay.')
	process.exit(3)
}
if (!pass) {
	console.error('FAIL-BEFORE: ban CU van XANH — test khong bat duoc bug. Test vua viet co the rac.')
	process.exit(1)
}
console.log('PASS: bug ton tai o ban CU, va WIP da khoi phuc nguyen ven.')