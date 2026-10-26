// verify-uiux-controls.selftest.cjs — chứng minh logic phân loại của verify-uiux-controls.cjs
// có tác dụng thật (L-E06: self-test phải BẮT được lỗi, không chỉ in PASS).
//
// Usage: node scripts/verify-uiux-controls.selftest.cjs
// Exit 0 = đủ 6 case + 6 mutation bị bắt. Không cần mạng.
"use strict";
const { classify, classifyText } = require("./verify-uiux-controls.cjs");

const H = (n) => `h${n}`; // fingerprint giả (chỉ cần khác nhau / giống nhau)

const cases = [
	{ id: "ST-1", name: "S1 != S2 => UNDECIDABLE (nền không tĩnh)", input: { s1: H(1), s2: H(2), f1: H(3), f1p: H(3), f2: H(1) }, want: "UNDECIDABLE" },
	{ id: "ST-2", name: "F1 != S1 && F2 == S1 => ALIVE", input: { s1: H(1), s2: H(1), f1: H(3), f1p: H(3), f2: H(1) }, want: "ALIVE" },
	{ id: "ST-3", name: "F1 == S1 && F2 == S1 => DEAD", input: { s1: H(1), s2: H(1), f1: H(1), f1p: H(1), f2: H(1) }, want: "DEAD" },
	{ id: "ST-4", name: "F1 != S1 && F2 != S1 => PARTIAL", input: { s1: H(1), s2: H(1), f1: H(3), f1p: H(3), f2: H(9) }, want: "PARTIAL" },
	{ id: "ST-5", name: "F1 == S1 && F2 != S1 => DRIFT", input: { s1: H(1), s2: H(1), f1: H(1), f1p: H(1), f2: H(9) }, want: "DRIFT" },
	{ id: "ST-6", name: "F1 != F1' => UNDECIDABLE (nền đổi giữa 2 ảnh)", input: { s1: H(1), s2: H(1), f1: H(3), f1p: H(4), f2: H(1) }, want: "UNDECIDABLE" },
	{ id: "ST-7", name: "thiếu capture => UNDECIDABLE (không đo được)", input: { s1: H(1), s2: H(1), f1: H(3), f1p: null, f2: H(1) }, want: "UNDECIDABLE" },
];

// Mutation: mỗi biến thể làm hỏng 1 luật ⇒ self-test phải bắt được (không được trả về `want`).
const mutations = [
	{ id: "M-1", name: "bỏ luật S1 != S2", broken: (m) => m.s1 !== m.s2 ? "ALIVE" : classify(m), probe: "ST-1" },
	{ id: "M-2", name: "bỏ luật F1 != F1'", broken: (m) => m.f1 !== m.f1p ? "ALIVE" : classify(m), probe: "ST-6" },
	{ id: "M-3", name: "ALIVE khi F2 != S1", broken: (m) => (m.f1 !== m.s1 ? "ALIVE" : classify(m)), probe: "ST-4" },
	{ id: "M-4", name: "DEAD khi F2 != S1", broken: (m) => (m.f1 === m.s1 && m.f2 === m.s1 ? "DEAD" : "ALIVE"), probe: "ST-5" },
	{ id: "M-5", name: "PARTIAL => DEAD", broken: (m) => (m.f1 !== m.s1 && m.f2 !== m.s1 ? "DEAD" : classify(m)), probe: "ST-4" },
	{ id: "M-6", name: "thiếu input => trả ALIVE", broken: (m) => (m && m.s1 && m.s2 && m.f1 && m.f1p && m.f2 ? classify(m) : "ALIVE"), probe: "ST-7" },
];

// --- Phần DOM (classifyText) -------------------------------------------------
const textCases = [
	{ id: "ST-T1", name: "A != B && A2 == A => ALIVE (DOM)", input: { a: ["10:00"], b: ["10:00 AM"], a2: ["10:00"] }, want: "ALIVE" },
	{ id: "ST-T2", name: "A == B && A2 == A => DEAD (DOM)", input: { a: ["10:00"], b: ["10:00"], a2: ["10:00"] }, want: "DEAD" },
	{ id: "ST-T3", name: "A != B && A2 != A => PARTIAL (DOM)", input: { a: ["10:00"], b: ["10:00 AM"], a2: ["11:00"] }, want: "PARTIAL" },
	{ id: "ST-T4", name: "A == B && A2 != A => DRIFT (DOM)", input: { a: ["10:00"], b: ["10:00"], a2: ["11:00"] }, want: "DRIFT" },
	{ id: "ST-T5", name: "rỗng => UNDECIDABLE (DOM)", input: { a: [], b: [], a2: [] }, want: "UNDECIDABLE" },
	{ id: "ST-T6", name: "thiếu input => UNDECIDABLE (DOM)", input: { a: ["10:00"] }, want: "UNDECIDABLE" },
];
const textMutations = [
	{ id: "M-T1", name: "DOM: luôn ALIVE", broken: () => "ALIVE", probe: "ST-T2" },
	{ id: "M-T2", name: "DOM: coi mảng rỗng là DEAD", broken: (m) => (m.a.length === 0 ? "DEAD" : classifyText(m)), probe: "ST-T5" },
	{ id: "M-T3", name: "DOM: bỏ kiểm tra khôi phục (A2)", broken: (m) => (m.a.length && m.a[0] !== m.b[0] ? "ALIVE" : "DEAD"), probe: "ST-T3" },
];

let failed = 0;
const results = [];

for (const c of cases) {
	const got = classify(c.input);
	const ok = got === c.want;
	if (!ok) failed += 1;
	results.push({ ok, name: `${c.id} ${c.name}`, detail: `want=${c.want} got=${got}` });
}

for (const m of mutations) {
	const probe = cases.find((c) => c.id === m.probe);
	const got = m.broken(probe.input);
	const ok = got !== probe.want; // mutation bị bắt ⇔ nó KHÔNG còn trả về verdict đúng
	if (!ok) failed += 1;
	results.push({ ok, name: `${m.id} mutation: ${m.name}`, detail: `probe ${m.probe} want=${probe.want} broken-got=${got}` });
}

for (const c of textCases) {
	const got = classifyText(c.input);
	const ok = got === c.want;
	if (!ok) failed += 1;
	results.push({ ok, name: `${c.id} ${c.name}`, detail: `want=${c.want} got=${got}` });
}

for (const m of textMutations) {
	const probe = textCases.find((c) => c.id === m.probe);
	const got = m.broken(probe.input);
	const ok = got !== probe.want;
	if (!ok) failed += 1;
	results.push({ ok, name: `${m.id} mutation: ${m.name}`, detail: `probe ${m.probe} want=${probe.want} broken-got=${got}` });
}

for (const r of results) {
	console.log(`${r.ok ? "ok  " : "FAIL"} ${r.name}${r.detail ? `  [${r.detail}]` : ""}`);
}
console.log(`verify-uiux-controls SELF-TEST: ${results.length - failed}/${results.length} case`);
if (failed) process.exit(1);
