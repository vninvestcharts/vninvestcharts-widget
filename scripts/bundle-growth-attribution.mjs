#!/usr/bin/env node
/**
 * Do bundle growth attribution NON-DESTRUCTIVELY.
 *
 * Khong build lai mot commit cu (thu nghiem do pha dist/ va khong build duoc khi
 * source lai khong tuong thich). Thay vao do doc sourcemap cua bundle hien tai va
 * quy tong byte cua module theo nhom. Day la **nguon** cua byte gzip, khong phai
 * byte gzip - nhung no tra loi dung cau hoi: "phan nao da lon them".
 *
 * Dung: node scripts/bundle-growth-attribution.mjs
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const TARGETS = [
	['IIFE', 'dist/vninvestchart.iife.js.map'],
	['ESM', 'dist/index.js.map'],
	['CJS', 'dist/index.cjs.map'],
]

function group(p) {
	if (p.includes('pinescript')) return 'PINESCRIPT'
	if (p.includes('node_modules/monaco')) return 'monaco'
	if (p.includes('node_modules')) return 'other-node_modules'
	if (p.includes('/src/') || p.startsWith('src/')) return 'src-other'
	return 'other'
}

console.log('Bundle growth attribution - byte SOURCE theo nhom (tu sourcemap)\n')
for (const [label, rel] of TARGETS) {
	let map
	try {
		map = JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'))
	} catch {
		console.log(`${label}: KHONG DOC DUOC ${rel}`)
		continue
	}
	const sizes = map.sourcesContent.map((s) => (s ? s.length : 0))
	const agg = {}
	for (let i = 0; i < map.sources.length; i++) {
		const k = group(map.sources[i])
		agg[k] = (agg[k] || 0) + sizes[i]
	}
	const total = Object.values(agg).reduce((a, b) => a + b, 0)
	console.log(`--- ${label} (${rel}) ---`)
	for (const [k, v] of Object.entries(agg).sort((a, b) => b[1] - a[1])) {
		console.log(`  ${k.padEnd(20)} ${(v / 1024).toFixed(1).padStart(9)} KB  ${((v / total) * 100).toFixed(1)}%`)
	}
	console.log(`  ${'TOTAL'.padEnd(20)} ${(total / 1024).toFixed(1).padStart(9)} KB\n`)
}