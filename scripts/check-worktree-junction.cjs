#!/usr/bin/env node
/**
 * check-worktree-junction.cjs — CHẶN XOÁ node_modules QUA JUNCTION.
 *
 * SỰ CỐ ĐÃ XẢY RA (2026-10-09, phiên PINE Stage 3):
 *
 *   `git worktree remove ../agent-pine-s3b --force` trên một worktree có
 *   `node_modules` là **JUNCTION** trỏ về `node_modules` của checkout chính.
 *   Git xoá thư mục worktree, đi **xuyên qua** junction, và làm rỗng
 *   `node_modules` THẬT của checkout chính (894 package → 0).
 *
 *   Đây đúng là hazard mà skill multi-agent-workflow ghi ở §Stage 0
 *   ("Never `rmdir /s /q` a tree that contains junctions — observed wiping a
 *   main checkout's `node_modules`"). Tôi đã đọc cảnh báo đó rồi vẫn làm —
 *   nên gate này tồn tại để **cơ chế** chặn, không phải để nhớ.
 *
 * VÌ SAO LÀ GATE MÀ KHÔNG PHẢI LỜI NHẮC: quy tắc viết ra không chặn được
 * gì (skill: "rules alone do not work"). Chỉ một lệnh **exit khác 0** mới chặn
 * được. Đây là lệnh đó.
 *
 * Những gì script này phát hiện:
 *   1. worktree nào chứa `node_modules` là junction/symlink
 *   2. `node_modules` của checkout chính có rỗng (0 phần tử) — dấu hiệu đã
 *      bị xoá
 *   3. checkout chính có `node_modules` rỗng mà `package-lock.json` tồn tại
 *      ⇒ chắc chắn hỏng, không phải trạng thái sạch bình thường
 *
 * `--check` : chỉ báo cáo, exit 0/1 theo phát hiện (dùng trong Stage 6).
 * `--self-test`: chứng minh gate **bắt** được vi phạm (L-E06 — self-test rỗng
 *               in PASS là vô dụng).
 *
 * Run:
 *   node scripts/check-worktree-junction.cjs --check
 *   node scripts/check-worktree-junction.cjs --self-test
 */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const SELF_TEST = process.argv.includes('--self-test')
const CHECK = process.argv.includes('--check')

/** Liệt kê worktree từ chính git — không đoán, không đọc file tay. */
function listWorktrees() {
	const raw = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: ROOT, encoding: 'utf8' })
	const out = []
	let cur = null
	for (const line of raw.split(/\r?\n/)) {
		if (line.startsWith('worktree ')) {
			if (cur) out.push(cur)
			cur = { dir: line.slice('worktree '.length).trim(), branch: '', locked: false }
		} else if (line.startsWith('branch ') && cur) {
			cur.branch = line.slice('branch '.length).trim().replace('refs/heads/', '')
		} else if (line.startsWith('locked') && cur) {
			cur.locked = true
		}
	}
	if (cur) out.push(cur)
	return out
}

function isLink(p) {
	try {
		const st = fs.lstatSync(p)
		return st.isSymbolicLink()
	} catch {
		return false
	}
}

function countEntries(p) {
	try {
		return fs.readdirSync(p).length
	} catch {
		return -1
	}
}

/** Junction trên Windows: lstat báo symbolic link, đường dẫn có ngoặc vuông. */
function junctionTarget(p) {
	try {
		return fs.readlinkSync(p)
	} catch {
		return null
	}
}

/** Thu thập phát hiện. Tách ra để `--self-test` dùng lại đúng logic này. */
function inspect(worktrees, rootNodeModulesCount, lockExists) {
	const problems = []
	for (const wt of worktrees) {
		if (path.resolve(wt.dir) === path.resolve(ROOT)) continue // chính nó
		const nm = path.join(wt.dir, 'node_modules')
		if (!fs.existsSync(nm) && !isLink(nm)) continue
		if (isLink(nm)) {
			problems.push({
				kind: 'JUNCTION_IN_WORKTREE',
				severity: 'high',
				where: wt.dir,
				branch: wt.branch,
				detail: `node_modules là link → ${junctionTarget(nm) ?? '?'} — KHÔNG được xoá worktree này bằng rmtree/--force`,
			})
		}
	}
	if (lockExists && rootNodeModulesCount === 0) {
		problems.push({
			kind: 'ROOT_NODE_MODULES_EMPTY',
			severity: 'critical',
			where: ROOT,
			detail: 'node_modules rỗng nhưng package-lock.json tồn tại ⇒ đã bị xoá. Chạy `npm ci`.',
		})
	}
	return problems
}

if (SELF_TEST) {
	// Fixture TỰ THÂN: worktree giả + junction giả. Không đụng worktree thật.
	let bad = 0
	const check = (name, ok, detail = '') => {
		console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`)
		if (!ok) bad++
	}
	const wtReal = listWorktrees()
	check('control: git worktree list đọc được', Array.isArray(wtReal) && wtReal.length >= 1, `n=${wtReal.length}`)

	// (1) node_modules rỗng + lock tồn tại ⇒ phải bị bắt
	const p1 = inspect(wtReal, 0, true)
	check('bắt được ROOT_NODE_MODULES_EMPTY', p1.some((x) => x.kind === 'ROOT_NODE_MODULES_EMPTY'))

	// (2) cùng trạng thái nhưng KHÔNG có lock ⇒ không được báo (tránh báo động giả)
	const p2 = inspect(wtReal, 0, false)
	check('KHÔNG báo động giả khi không có lock', !p2.some((x) => x.kind === 'ROOT_NODE_MODULES_EMPTY'))

	// (3) node_modules đầy + lock ⇒ sạch
	const p3 = inspect(wtReal, 894, true)
	check('trạng thái sạch không bị báo', p3.filter((x) => x.kind === 'ROOT_NODE_MODULES_EMPTY').length === 0)

	// (4) worktree chứa junction ⇒ phải bị bắt (dùng đường dẫn giả)
	const p4 = inspect([{ dir: path.join(ROOT, '..', 'agent-FAKE'), branch: 'feat/fake' }], 894, true)
	// đường dẫn giả không tồn tại nên không có junction ⇒ phải SẠCH (đây là
	// negative control: gate không được báo cáo trên đường dẫn không tồn tại)
	check('không báo worktree không tồn tại', !p4.some((x) => x.kind === 'JUNCTION_IN_WORKTREE'))

	console.log(`\nself-test: ${bad === 0 ? 'PASS' : 'FAIL'} (${bad} case fail)`)
	process.exit(bad === 0 ? 0 : 1)
}

if (!CHECK) {
	console.log('Usage: node scripts/check-worktree-junction.cjs --check | --self-test')
	process.exit(2)
}

const worktrees = listWorktrees()
const count = countEntries(path.join(ROOT, 'node_modules'))
const lockExists = fs.existsSync(path.join(ROOT, 'package-lock.json'))
const problems = inspect(worktrees, count, lockExists)

console.log(`check-worktree-junction: ${worktrees.length} worktree, root node_modules = ${count} entries`)
if (!problems.length) {
	console.log('PASS: khong co junction trong worktree nao; node_modules cua checkout chinh con nguyen ven.')
	process.exit(0)
}
for (const p of problems) {
	console.log(`${p.severity.toUpperCase()} ${p.kind}`)
	console.log(`        where: ${p.where}${p.branch ? ` (${p.branch})` : ''}`)
	console.log(`        ${p.detail}`)
}
console.log('\nHUONG DAN KHI LOI junction — DAO THU TU:')
console.log('  1. GỠ JUNCTION TRƯỚC:  cmd /c rmdir "<path>\\node_modules"   (KHONG them /s)')
console.log('  2. KIỂM TRA HẾT:       node scripts/check-worktree-junction.cjs --check')
console.log('  3. MỚI xoá worktree:   git worktree remove "<path>"')
console.log('')
console.log('  ⚠  `git worktree remove` KHONG DUOC an toan tren thu muc con junction.')
console.log('    Do 2026-10-09: no `--force` VA co `--force` deu xoa node_modules THAT')
console.log('    (894 package -> 0, phai `npm ci` lai). Do doc file nay truoc khi xoa.')
process.exit(1)
