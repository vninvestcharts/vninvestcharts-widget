/**
 * THU THUACH THIET KE — BANG CHUNG DO DUOC, KHONG DOAN.
 *
 * Run: `node scripts/probe-grammar-caps.mjs`
 *
 * 1. **peggy 5 KHONG co rule co tham so** (`Rule$(x)`). Doc
 *    `node_modules/peggy/lib/parser.js:2083` (`peg$parseRuleReferenceExpression`)
 *    cho thay rule reference chi co dang `IdentifierName ["." IdentifierName]`.
 *    ⇒ Khong the viet `Block$(indent)`.
 * 2. **`startRule` phai la rule DINH NGHIA DAU TIEN.** Do doc parser.js nen rule
 *    nao cung truoc cung duoc, nhung rule sau thi bi "Can't start parsing from
 *    rule X". ⇒ `Script` phai o DONG DAU.
 * 3. **Khong dung predicate de ket thuc khoi trong grammar.** Bien `ind` phai
 *    duoc gan TRUOC khi khoi parse va khoi phuc SAU — ma action trong PEG luon
 *    chay sau khi match xong, nen khong gan duoc truoc. Thay vao do, W-01 tach
 *    thanh 2 tang: **grammar tach DONG** (indent + statement), **builder TS dung
 *    indent de long khoi**. Tang builder la code thuong, test duoc bang vitest,
 *    va khong phai chien dau voi co do backtracking cua PEG.
 *
 * Giai phan (C) la ly do bo grammar phuc tap: mot `if` + khoi + `else` la 3 dong
 * de mo ta, va builder lo duoc "dong nao thuoc khoi" mot cach ro rang.
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const peggy = require('peggy')

let failures = 0
function check(name, ok, detail = '') {
	console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`)
	if (!ok) failures++
}

// 1) rule param
try {
	peggy.generate('A$(n) = "x" { return n }\nTop = A$(1)')
	check('peggy 5 rejects Rule$(param)', false, 'unexpectedly accepted')
} catch (e) {
	check('peggy 5 rejects Rule$(param)', true, `"${e.message.slice(0, 46)}"`)
}

// 2) startRule phai la rule dau
try {
	peggy.generate('_ = [ \\t]*\nTop = "x"').parse('x', { startRule: 'Top' })
	check('startRule must be first-defined rule', false, 'unexpectedly accepted')
} catch (e) {
	check('startRule must be first-defined rule', true, `"${e.message.slice(0, 40)}"`)
}

// 3) grammar line-based tach duoc indent + statement, va builder lo duoc khoi
// `\n` thuoc ve CUOI dong truoc, nen `ws` dau moi Line luon la thu le that
// cua dong do — khong can rule NL rieng.
const GRAMMAR = [
	'Top = s:Line* { return s }',
	'Line',
	'  = ws:$([ \\t]*) w:$([a-z]+) [ \\t]* ("\\r"? "\\n")? { return { indent: ws.length, word: w } }',
].join('\n')

/**
 * Builder: `lines` = `[{indent, node}]` → cây, kết thúc khối khi thụt lề
 * không còn lớn hơn khối cha. `else`/`elif` không thuộc khoảng body.
 */
function buildTree(lines) {
	const root = []
	const stack = [{ indent: -1, node: root }]
	for (const line of lines) {
		while (stack.length > 1 && line.indent <= stack[stack.length - 1].indent) stack.pop()
		const top = stack[stack.length - 1]
		const stmt = line.node
		top.node.push(stmt)
		if (stmt.type === 'IfStatement' || stmt.type === 'ForStatement' || stmt.type === 'WhileStatement') {
			const body = []
			stmt.thenBlock = body
			stack.push({ indent: line.indent, node: body })
		}
	}
	return root
}

const parser = peggy.generate(GRAMMAR)
const parse = (src) => buildTree(parser.parse(src).map((l) => ({ indent: l.indent, node: { type: 'St', word: l.word } })))

// NEGATIVE-CONTROL: builder CHỈ lồng khi có `IfStatement`. Không có khai báo
// khoá thì mọi dòng đều phẳng — đúng, và đây là bằng chứng builder có tác dụng
// chứ không phải grammar tự đã làm việc đó.
const flat = parse('aa\n  bb\n  cc\ndd')
check('không có if thì mọi dòng phẳng', flat.length === 4, JSON.stringify(flat.map((n) => n.word)))

const src1 = 'if\n  aa\n  bb\ndd'
const p1 = parser.parse(src1).map((l) => ({ indent: l.indent, node: { type: l.word === 'if' ? 'IfStatement' : 'St', word: l.word } }))
const t1 = buildTree(p1)
check(
	'khoi dung o thu le ngoai, "dd" KHONG bi nuot',
	t1.length === 2 && t1[0].thenBlock.length === 2 && t1[1].word === 'dd' && t1[1].type === 'St',
	JSON.stringify(t1),
)

const src2 = 'if\n  a\n  b\nc'
const p2 = parser.parse(src2).map((l) => ({ indent: l.indent, node: { type: l.word === 'if' ? 'IfStatement' : 'St', word: l.word } }))
const t2 = buildTree(p2)
check(
	'if nhận đúng 2 dòng thụt lề sâu hơn',
	t2.length === 2 && t2[0].thenBlock.length === 2 && t2[0].thenBlock[0].word === 'a' && t2[1].word === 'c',
	JSON.stringify(t2),
)

console.log(`\nprobe-grammar-caps: ${failures} failed assertion(s)`)
process.exit(failures === 0 ? 0 : 1)
