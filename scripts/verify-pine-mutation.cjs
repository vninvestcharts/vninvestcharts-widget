// Mutation harness for the Pine Stage 1 gates (hazard 10: a test that passes before and
// after a fix is NO evidence).
//
// Each case: mutate ONE line of production source, assert the named gate turns RED, then restore
// the file byte-for-byte and assert green again. `try/finally` is mandatory — a red test makes
// vitest throw, and without finally the mutant would be left sitting in the working tree exactly
// when the mutation "succeeds" (hazard 15).
//
// Run: node scripts/verify-pine-mutation.cjs
//
// Case `needsGen: true` (B1, 2026-10-17): file bị mutate là input BUILD-TIME
// (`grammar.ts` → `parser.generated.js`), nên harness tái sinh parser quanh mỗi case
// và so byte artifact đó sau khi chạy (xem `runGenerator` + `GENERATED_PARSER`).

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();

function runVitest(file) {
	try {
		execFileSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", file], {
			cwd: ROOT,
			stdio: "pipe",
			encoding: "utf8",
		});
		return { code: 0, out: "" };
	} catch (err) {
		return { code: err.status ?? 1, out: String(err.stdout ?? "") + String(err.stderr ?? "") };
	}
}

// B1 (2026-10-17): `grammar.ts` KHÔNG còn là input runtime — nó được compile thành
// `parser.generated.js` bởi build step (`npm run gen:pine-parser`, nối vào các pre* hook).
// Harness này spawn vitest TRỰC TIẾP (không qua npm lifecycle), nên case nào mutate
// grammar.ts PHẢI tự tái sinh parser trước khi chạy gates — nếu không, mutant nằm ngoài
// đường chạy thật và bị báo nhầm là SURVIVED (đo 2026-10-17 trên ma trận: M-A1/M-A2
// "2 unexpected" đúng vì lý do này).
function runGenerator() {
	execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/gen-pine-parser.ts"], {
		cwd: ROOT,
		stdio: "pipe",
		encoding: "utf8",
	});
}

// The repo files are CRLF on disk (a `git show HEAD:<file>` dump and a fresh write differ), so a
// multi-line needle written with `\n` matches ZERO occurrences and the harness would silently
// report "UNEXPECTED" for the wrong reason. Every needle is therefore matched as a REGEX where
// newlines are `\r?\n`, and the harness fails loudly if a needle does not match exactly once.
function replaceOnce(file, pattern, to) {
	const abs = path.join(ROOT, file);
	const original = fs.readFileSync(abs, "utf8");
	const regex = new RegExp(pattern, "g");
	const matches = original.match(regex);
	if (!matches || matches.length !== 1) {
		throw new Error(`expected exactly 1 match of ${pattern} in ${file}, found ${matches ? matches.length : 0}`);
	}
	const mutated = original.replace(regex, to);
	fs.writeFileSync(abs, mutated, "utf8");
	return { abs, original, mutated };
}

const CASES = [
	{
		name: "1.3 — producer returns no seriesData, so Pine never reaches the engine",
		file: "src/widget/utils/pineSeriesData.ts",
		from: "\\t\\t\\tseenTypes\\.push\\(String\\(series\\.type\\)\\);",
		to: "\t\t\tseenTypes.length = 0;",
		gates: ["src/widget/utils/__tests__/pineSeriesData.test.ts"],
	},
	{
		name: "1.3b — push gate ignores the Pine signature again",
		file: "src/widget/hooks/useWidgetData.ts",
		from: "if \\(prevBars === nextBars && prevHash === nextHash && prevPineSignature === pineSeriesSignature\\)",
		to: "if (prevBars === nextBars && prevHash === nextHash)",
		gates: ["src/widget/__tests__/pineRestoreWiring.test.tsx"],
	},
	{
		name: "1.7 — Pine series carries no tier, so the gate has nothing to act on",
		file: "src/lib/pinescript/scriptRegistry.ts",
		from: 'tier: options\\.tier \\?\\? "pro",',
		to: 'tier: "free",',
		gates: ["src/lib/core/registry/__tests__/pineDynamicSeriesTier.test.ts"],
	},
	{
		name: "W-01 — gate stops filtering ALL series (regression to the pre-Stage-2 hole)",
		file: "src/lib/core/registry/filterPanesBySeriesTier.ts",
		from: "const kept = filterAvailableSeries\\(series, currentTier\\);",
		to: "const kept = series;",
		gates: ["src/lib/core/registry/__tests__/builtInSeriesTierGate.test.ts"],
	},
	{
		name: "B-1 — resolveSeriesValue falls back to close for Pine (the tooltip bug)",
		file: "src/lib/core/seriesValueResolver.ts",
		from: "if \\(pineScriptId\\) \\{\\r?\\n\\t\\treturn asScalar\\(resolveSeriesDatumValue\\(datum, series\\)\\);",
		to: "if (false && pineScriptId) {\n\t\treturn asScalar(resolveSeriesDatumValue(datum, series));",
		gates: ["src/lib/core/__tests__/indicatorAccessorCoverage.test.ts"],
	},
	{
		name: "1.6b — compute yields nothing, so a restored script has no values",
		file: "src/lib/pinescript/scriptRegistry.ts",
		from: "if \\(stored === undefined\\) return \\{\\};",
		to: "return {};\n\t\t\tif (stored === undefined) return {};",
		gates: ["src/lib/pinescript/__tests__/pineRestore.test.ts"],
	},
	{
		name: "1.6b — restore ignores the wanted-types filter and resurrects deleted series",
		file: "src/lib/pinescript/scriptRegistry.ts",
		from: "if \\(!wanted\\.has\\(type\\)\\) continue;",
		to: "void type;",
		gates: ["src/lib/pinescript/__tests__/pineRestore.test.ts"],
	},
	{
		name: "BLOCKER B-1 — restore version no longer feeds the renderPanes memo (the audit defect)",
		file: "src/widget/VNInvestCharts.tsx",
		from: "\\[resolvedPanes, seriesTierGate, pineRestoreVersion\\],",
		to: "[resolvedPanes, seriesTierGate],",
		gates: ["src/widget/__tests__/pineRestoreWiring.test.tsx"],
	},
	{
		name: "MAJOR-1 — scaleSlotDomains goes back to the UNFILTERED panes (gate bypass)",
		file: "src/widget/VNInvestCharts.tsx",
		from: "computePaneScaleSlotDomains\\(\\r?\\n\\t\\t\\trenderPanes,",
		to: "computePaneScaleSlotDomains(\n\t\t\tresolvedPanes,",
		gates: ["src/widget/__tests__/pineRestoreWiring.test.tsx"],
	},
	{
		name: "1.6 — compile stops reporting overlay",
		file: "src/lib/pinescript/compile.ts",
		from: "const overlay = readStudyOverlay\\(ast\\)",
		to: "const overlay = true as boolean | undefined;",
		gates: ["src/widget/utils/__tests__/pineSeriesData.test.ts"],
		// Was documented as a survivor; it is now KILLED because the code audit's MAJOR-2 added
		// the missing overlay assertions (this is why the mutation harness is re-run after a fix —
		// an expectation can become wrong in the safe direction).
	},
	// ── W-03: hai bug per-bar vừa sửa. Mutant nhắm đúng từng dòng đã sửa, để chứng minh
	// `pinePerBar.test.ts` KHÔNG xanh rỗng — cùng lý do mà `216a8cd` đã lộ "sai mà im lặng".
	{
		// File `compile.ts` dùng CRLF. Ba mutant đầu viết regex `\r?\n` cho kỳ vọng
		// "đổi ký tự xuống dòng" nhưng thực ra là SAI byte (đo: "found 0"), rồi thử
		// `Math.max(1, length)` — vô nghĩa vì `length >= 1` nên bằng `length` ⇒ GREEN.
		// Mutant phải (1) khớp byte thật, (2) đổi HÀNH VI chứ không phá cú pháp.
		// `checkTimeout()` là neo duy nhất: ternary trong `evalExpr` có
		// `const c = cond[i]` giống hệt nhưng KHÔNG gọi `checkTimeout`.
		//
		// [D-01b] 2026-10-14 — vòng per-bar **đã chuyển** từ `compile.ts` sang
		// `pinePerBar.ts` (tách để không bump ngưỡng 700/700). Mutant vẫn đúng ý nghĩa
		// nhưng needle cũ báo "found 0" — đây là **UNEXPECTED do refactor**, KHÔNG
		// phải mutant chết. Sửa bằng cách trỏ needle, không xoá mutant: xoá thì mất
		// bằng chứng (L-G07 — "mutation không áp dụng" và "test rỗng" là hai kết luận
		// khác nhau, và không được nhầm).
		name: "W-03 — `if` chỉ chạy bar đầu (quay về 1 lần cho cả chart, bug @ 216a8cd)",
		file: "src/lib/pinescript/pinePerBar.ts",
		from: "checkTimeout\\(\\)\\r?\\n(\\t+)const c = cond\\[i\\]\\r?\\n\\1if \\(isNaN\\(c\\)\\) continue",
		to: "checkTimeout()\n$1const c = cond[i]\n$1if (isNaN(c)) continue\n$1if (length > 1) break",
		gates: ["src/lib/pinescript/pinePerBar.test.ts", "src/lib/pinescript/pineReassign.test.ts"],
	},
	{
		name: "W-03 — `plot` trong nhánh ghi đè thay vì gộp theo bar (bar CUỐI thắng)",
		file: "src/lib/pinescript/compile.ts",
		from: "if \\(perBarIndex >= 0 && perBarIndex < FULL_LENGTH\\) buf\\[perBarIndex\\] = val\\[perBarIndex\\]",
		// NEEDLE UPDATED ở W-08 (Stage 4): W-03 viết `perBarIndex < length`. Khi
		// sửa bug buffer per-bar, dòng này đổi thành `FULL_LENGTH` và needle cũ
		// không còn khớp. Harness báo "found 0" — ĐÚNG, và đó là điều nó nên làm:
		// một needle chết phải hỏng chứ không được im lặng báo xanh.
		to: "for (let k = 0; k < val.length && k < length; k++) buf[k] = val[k]",
		gates: ["src/lib/pinescript/pinePerBar.test.ts"],
	},
	{
		// W-03 (2026-10-10, S4-B09): mutant này từng nhắm `if` lồng ghi kết quả
		// vào `env` thay vì `scope`. Sau fix S4-B09 nó SỐNG SÓT — và đó là thông
		// tin đúng, không phải lỗi test: `if` lồng nay đi đường MỚI (ghi thẳng vào
		// lát cắt `scope` của khoá cha, không còn đi qua `acc`), nên dòng `acc` mà
		// mutant nhắm tới không còn nằm trên đường quyết định của case lồng.
		//
		// Mutant chết mà không chứng minh gì về hành vi người dùng thấy — đúng
		// loại gate trang trí. Thay vì xoá (xoá là mất dấu vết lịch sử) hoặc để
		// nó sống (giả vờ còn phủ), ta CHUYỂN nó sang cơ chế MỚI đang sống:
		// `if` lồng ghi kết quả về lát cắt của khoá cha. Bỏ dòng ghi đó thì
		// biến do khoá trong tạo ra biến mất với khoá cha.
		name: "W-03 — `if` lồng không ghi kết quả về lát cắt của khoá cha (S4-B09)",
		file: "src/lib/pinescript/compile.ts",
		from: "for \\(const \\[k, v\\] of sliced\\) scope\\.set\\(k, v\\)",
		to: "for (const [k, v] of sliced) void k",
		gates: ["src/lib/pinescript/pineStage4.test.ts"],
	},
	// ── W-05..W-08 (PINE Stage 4) ────────────────────────────────────────────────
	// Bài học của phiên Stage 3: mutant phá CÚ PHÁP chỉ chứng minh "compile hỏng",
	// không chứng minh test bắt được bug. Cả bốn mutant dưới đây vẫn parse và vẫn
	// chạy — chúng phá HÀNH VI, đúng thứ test khoá.
	{
		name: "S4-1 — ta.bb trả upper ở cả vị trí middle (band sai, không lỗi)",
		file: "src/lib/pinescript/pineBuiltins.ts",
		from: "return \\[middle, upper, lower\\]",
		to: "return [upper, upper, lower]",
		gates: ["src/lib/pinescript/pineStage4.test.ts"],
	},
	{
		name: "S4-2 — buffer plot per-bar cấp phát theo lát cắt (series trong nhánh if mất bar)",
		file: "src/lib/pinescript/compile.ts",
		from: "perBarPlots\\[title\\] = new Array\\(FULL_LENGTH\\)",
		to: "perBarPlots[title] = new Array(length)",
		gates: ["src/lib/pinescript/pineStage4.test.ts", "src/lib/pinescript/pinePerBar.test.ts"],
	},
	{
		name: "S4-3 — kiểm arity chỉ bắt thiếu, tha nhiều (destructure thiếu biến chạy im)",
		file: "src/lib/pinescript/compile.ts",
		from: "if \\(parts\\.length !== names\\.length\\)",
		to: "if (parts.length < names.length)",
		gates: ["src/lib/pinescript/pineStage4.test.ts"],
	},
{
		// S4-4 REPOINTED (S4-B01 fix, 2026-10-10). Mutant cũ đổi `isTupleResult` thành
		// `false` — nhưng S4-B01 đã **xoá** đường đó: `evalExpr` nay ném ngay tại
		// điểm lệch đầu tiên, `isTupleResult` chỉ còn là lưới an toàn thứ hai.
		// Needle cũ vẫn khớp (nên không "found 0") nhưng KHÔNG còn nằm trên đường
		// quyết định ⇒ mutant sống mà không chứng minh gì. Mutant phải nhắm **điểm
		// lệch đầu tiên**: bỏ hẳn nhánh ném, để tuple chảy qua như trước Stage 4.
		name: "S4-4 — evalExpr không ném khi gặp builtin nhiều giá trị (tuple lọt qua toán tử)",
		file: "src/lib/pinescript/compile.ts",
		from: "if \\(MULTI_VALUE_BUILTINS\\.has\\(expr\\.name\\)\\) \\{\r?\n(\t+)const tuple = callTupleFunction\\(expr\\.name, args, length, env\\)",
		to: "if (false) {\n$1const tuple = callTupleFunction(expr.name, args, length, env)",
		gates: ["src/lib/pinescript/pineStage4.test.ts", "src/lib/pinescript/pineFailClosed.test.ts"],
	},
	{
		// S4-B09 (2026-10-10). `if` LỒNG `if` sống sót từ Stage 3 vì không test
		// nào chạm tới. Nguyên nhân: khi đã ở trong khối per-bar, `if` con vẫn
		// chạy vòng `0..i` và đè `perBarIndex` của khoá cha ⇒ `else` ngoài bị ghi
		// bởi khoá trong (đo: Small 35 bar thay vì 10, Neg 4 thay vì 29; sai 25/60
		// bar, KHÔNG một dòng lỗi).
		//
		// Mutant nhắm đúng cơ chế của fix: tắt nhánh "chạy đúng một bar" mà ta
		// thêm, đưa code về hành vi vòng-lặp-cũ.
		name: "S4-18 — `if` lồng `if` chạy lại cả vòng 0..i thay vì một bar (S4-B09)",
		file: "src/lib/pinescript/compile.ts",
		from: "if \\(perBarPlotDepth > 0 && perBarIndex >= 0\\) \\{",
		to: "if (false) {",
		gates: ["src/lib/pinescript/pineStage4.test.ts"],
	},
	{
		name: "S4-5 — UDF thân khối không thực thi thân (chỉ khai báo rồi trả na)",
		file: "src/lib/pinescript/compile.ts",
		from: "execute\\(fn\\.body as any\\[\\], length, scope as SeriesEnv\\)",
		to: "void fn.body",
		gates: ["src/lib/pinescript/pineStage4.test.ts"],
	},
	// ── PINE Stage 5.1 (pineStrategy.ts) ──────────────────────────────────────────
	// Nhóm này bảo vệ ba quyết định mà AC-S1 của plan nêu TÊN: thanh khớp là bar KẾ,
	// phí được trừ, và sizing theo default_qty_type. Cả ba đều là chỗ "đúng mà im
	// lặng" — sửa sai vẫn ra một con số hợp lý, chỉ là của chiến lược khác.
	{
		name: "S5-1 — lệnh khớp ngay bar phát thay vì bar KẾ (giá sai âm thầm)",
		file: "src/lib/pinescript/pineStrategy.ts",
		from: "fill\\(pending, bar\\)\\r?\\n\\t+pending = \\[\\]\\r?\\n\\t+execute\\(",
		to: "pending = []\n\t\texecute(" +
			"\n\t\t\n\t\tfill([], bar)\n\t\t",
		gates: ["src/lib/pinescript/pineStrategy.test.ts"],
	},
	{
		name: "S5-2 — phí không được trừ khi đóng vị thế (netProfit lớn hơn thật)",
		file: "src/lib/pinescript/pineStrategy.ts",
		from: "cash \\+= gross - commission",
		to: "cash += gross",
		gates: ["src/lib/pinescript/pineStrategy.test.ts"],
	},
	{
		name: "S5-4 — gán không giữ lịch sử nên `x := x + 1` đóng băng (A02, sai âm thầm)",
		file: "src/lib/pinescript/pineStrategy.ts",
		from: "for \\(let k = 0; k < bar && k < next\\.length; k\\+\\+\\) next\\[k\\] = previous\\[k\\]",
		to: "void previous",
		gates: ["src/lib/pinescript/pineStrategy.test.ts"],
	},
	// ── PINE-14 / PINE-13 (grammar.ts) ────────────────────────────────────────────────
	//
	// M-A1 KHÔNG phải mutant vô hại. Auditor đo: bỏ ranh giới từ làm `declKind` thành MẢNG
	// `["var", null]`, nên `declKind === "var"` ở action là FALSE ⇒ `var x = 0` PARSE ĐƯỢC và
	// chạy sai ngữ nghĩa với `errors: []`. Nó phải bị giết bởi test khoá fail-closed `var`,
	// nếu không thì guard PINE-01 bị xoá đúng kiểu "sai mà im lặng".
	//
	// Needle chỉ chứa `!idChar \{ return kw \}` — không có dấu nháy nào, để không phải
	// escape quote trong chuỗi JS của chính harness này (đã làm hỏng nó 3 lần).
	// Needle phải là DUY NHẤT một lần trong file. Lần đầu dùng
	// `!idChar \{ return kw \}` thì khớp **2** — vì dòng comment ngay phía trên rule
	// cũng viết lại đúng chuỗi đó. Đã thêm đuôi `_ name:identifier`, thứ chỉ có ở
	// RULE; phần comment không có. `replaceOnce` ném nếu khác 1, nên lỗi này lộ ra
	// ngay — nhưng đáng lẽ không nên tốn một lượt chạy 6 phút để phát hiện.
	//
	// `needsGen` (B1, 2026-10-17): hai case dưới mutate `grammar.ts` — từ B1 file này
	// là input BUILD-TIME (sinh `parser.generated.js`), không phải runtime, nên harness
	// phải tái sinh parser sau khi mutate và tái sinh lại trong `finally`.
	{
		name: "M-A1 — varDecl mất ranh giới từ (mở lại fail-closed của `var`)",
		file: "src/lib/pinescript/grammar.ts",
		from: "!idChar \\{ return kw \\}\\)\\? _ name:identifier",
		to: ")? _ name:identifier",
		needsGen: true,
		gates: ["src/lib/pinescript/pineStrategy.test.ts"],
	},
	{
		name: "M-A2 — StatementStart mất nhánh lời gọi có tham số (UDF thân khối bị nuốt)",
		file: "src/lib/pinescript/grammar.ts",
		from: "  / identifier _ \"\\(\"\r?\n",
		to: "  / identifier _ \"(\" _ \")\" _ \"=>\"\r?\n",
		needsGen: true,
		gates: ["src/lib/pinescript/pineStrategy.test.ts"],
	},
	{
		name: "S5-3 — sizing percent_of_equity rơi về cash (sai số hợp đồng)",
		file: "src/lib/pinescript/pineStrategyTypes.ts",
		from: "return \\(\\(equity \\* params\\.defaultQtyValue\\) / 100\\) / price",
		to: "return params.defaultQtyValue / price",
		gates: ["src/lib/pinescript/pineStrategy.test.ts"],
	},
// ── AC-8 (2026-10-15): ba INVARIANT của `pinePerBar.ts` ────────────────────────
	//
	// `pinePerBar.ts` docblock nêu ba điều kiện đi kèm (mang tiếp / đệm carry-forward /
	// khoá rỗng vẫn phải cập nhật). Trước phiên này **không mutant nào** trỏ vào file
	// đó ⇒ 10 AC khoá D-01 có thể xanh rỗng mà không ai biết (L-E01). Ba mutant dưới
	// nhắm **đúng từng dòng** mà docblock gọi tên, và mỗi cái phá HÀNH VI chứ không
	// phá cú pháp (bài học nhóm W-05..W-08).
	{
		// Invariant 1 — MANG TIẾP. `carried` là bản mang-tiếp: sau mỗi bar nó phải
		// nhận `out` của khoá này để bar kế đọc được giá trị vừa gán. Bỏ dòng này thì
		// `carried` đóng băng ở giá trị lúc vào khoá ⇒ `pineReassign.test.ts` AC-2.2 /
		// AC-2.2b / AC-2.5 (`[1,2,3,…]`) phải đỏ.
		name: "AC8-1 — khoá `if` không đẩy giá trị vừa gán về `carried` (mất mang tiếp)",
		file: "src/lib/pinescript/pinePerBar.ts",
		from: "carried\\.set\\(name, out\\)",
		to: "void out",
		gates: ["src/lib/pinescript/pinePerBar.test.ts", "src/lib/pinescript/pineReassign.test.ts"],
	},
	{
		// Invariant 2 — ĐỆM CARRY-FORWARD. `acc[k]` dài `length` nhưng chỉ `0..i` có giá
		// trị; đuôi là `NaN`. Đưa thẳng vào scope thì `x := x + 1` ở bar sau đọc `NaN`.
		// Bỏ `carryPad` thì series không được đệm ⇒ AC-2.2 đỏ.
		name: "AC8-2 — series trong khoá không được đệm carry-forward (đọc NaN ở đuôi)",
		file: "src/lib/pinescript/pinePerBar.ts",
		from: "carryPad\\(a, i \\+ 1\\)",
		to: "a",
		gates: ["src/lib/pinescript/pinePerBar.test.ts", "src/lib/pinescript/pineReassign.test.ts"],
	},
	{
		// Invariant 3 — KHOÁ RỖNG VẪN PHẢI CẬP NHẬT (đệm trước lần gán đầu tiên).
		// Đo được trước khi sửa: `[NaN,NaN,NaN,7,0,7]` thay vì `[0,0,0,7,0,7]` — Pine
		// Editor vẽ hở ở mép trái. `j < 0` làm vòng đệm chạy 0 lần.
		name: "AC8-3 — không đệm các bar TRƯỚC lần gán đầu (mép trái hở NaN)",
		file: "src/lib/pinescript/pinePerBar.ts",
		from: "for \\(let j = 0; j < i; j\\+\\+\\) out\\[j\\] = pre\\?\\.\\[j\\] \\?\\? NaN",
		to: "for (let j = 0; j < 0; j++) out[j] = pre?.[j] ?? NaN",
		gates: ["src/lib/pinescript/pineReassign.test.ts"],
	},
];

// HAZARD 15 GUARD. This harness itself left a mutant in the working tree once: a case threw
// before its restore, the process carried on, and the next run found 0 matches for a needle it
// had already applied — which it reported as "UNEXPECTED / ERROR", not as "the tree is dirty".
// Every mutated file is therefore snapshotted before the run and compared byte-for-byte after it.
// A dirty tree is reported as its own failure, independently of any case result.
const pristine = new Map();
for (const f of new Set(CASES.map((c) => c.file))) {
	pristine.set(f, fs.readFileSync(path.join(ROOT, f), "utf8"));
}

// B1 (2026-10-17): case `needsGen` để lại `parser.generated.js` là artifact của lần
// regen CUỐI — nếu `finally` không chạy (process bị kill) thì bản mutant sót lại đó
// nhiễm mọi vitest run sau, mà file lại untracked nên guard git-diff-HEAD ở trên
// KHÔNG thấy. Snapshot riêng ở đây (chỉ khi đã tồn tại; máy sạch chưa từng gen thì
// bỏ qua — lần gen đầu là hành vi hợp lệ, không phải dơ cây).
const GENERATED_PARSER = "src/lib/pinescript/parser.generated.js";
const generatedSnapshot = fs.existsSync(path.join(ROOT, GENERATED_PARSER))
	? fs.readFileSync(path.join(ROOT, GENERATED_PARSER), "utf8")
	: null;

// HAZARD 15 GUARD, second layer — the one `try/finally` cannot be.
//
// The guard above proves "THIS RUN did not leave anything behind". It is silent on a tree
// that was ALREADY dirty when the run started, because the snapshot it compares against
// was taken from that same dirty tree. Measured 2026-10-13: a run whose node process was
// killed mid-case (a tool timeout — `finally` does NOT run when the process dies, only
// when control flow unwinds) left mutant S4-2 sitting in `compile.ts`. The next run then
// reported two cases as "found 0" — UNEXPECTED for the WRONG reason — and the total
// moved between 2 and 3 across two runs on the SAME tree.
//
// So the comparison has to happen BEFORE this run mutates anything, and against the
// committed blob rather than against itself.
//
// EOL-NORMALISED on purpose, and this is measured, not assumed: `core.autocrlf=true`
// means the working tree is MIXED. On 2026-10-13 the first version compared raw bytes and
// reported SEVEN dirty files out of seven — `compile.ts` is LF on disk (blob CRLF=0 /
// LF=699) while `pineBuiltins.ts` and `pineSeriesData.ts` are CRLF on disk (CRLF=638 /
// LF=0, and CRLF=167 / LF=0). All seven normalise equal to their blob. A raw-byte
// comparison here is hazard 16 inverted: it fires on the checkout, not on the code, and
// a guard that always fires is a guard nobody reads. Same normalisation already applied
// to `gen-inventory.mjs` (PLAN_GATE_PINE_S5 §A1).
//
// Consequence stated plainly: an EOL-only difference is NOT reported. That is correct —
// it is not a mutation — and it is the one thing this guard deliberately does not see.
function headBlob(rel) {
	try {
		return execFileSync("git", ["show", `HEAD:${rel}`], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
	} catch {
		return null; // untracked: there is no committed blob to diverge from
	}
}

const eol = (buf) => buf.toString("utf8").replace(/\r\n/g, "\n");

const dirtyBeforeRun = [];
for (const file of pristine.keys()) {
	const head = headBlob(file);
	if (head && eol(fs.readFileSync(path.join(ROOT, file))) !== eol(head)) dirtyBeforeRun.push(file);
}
if (dirtyBeforeRun.length > 0) {
	console.log("PRE-FLIGHT FAILURE — these files already differ from HEAD, before this run mutated anything:");
	for (const f of dirtyBeforeRun) console.log(`  - ${f}`);
	console.log("");
	console.log("Two causes, and the harness cannot tell them apart:");
	console.log("  1. a mutant from an earlier run that was killed mid-case (most likely — `finally`");
	console.log("     does not run when the process dies). Restore it:");
	console.log('       git diff -- <file>            # look at what is actually different');
	console.log('       git stash push -- <file>      # OR park real work before inspecting');
	console.log("  2. real uncommitted work of yours. Do NOT `git show HEAD:<file> > <file>` over");
	console.log("     it — that command overwrites your edit, which is the one thing this gate");
	console.log("     must not make you do.");
	console.log("");
	console.log("Either way the run cannot start: left in place, every case whose needle was");
	console.log("already applied reports 'found 0' and the total stops being comparable.");
	process.exit(1);
}

let failures = 0;
const rows = [];

for (const testCase of CASES) {
	const label = testCase.expect ? "SURVIVED" : "KILLED";
	try {
		const { abs, original } = replaceOnce(testCase.file, testCase.from, testCase.to);
		let observed = null;
		try {
			if (testCase.needsGen) runGenerator();
			for (const gate of testCase.gates) {
				const r = runVitest(gate);
				if (r.code !== 0) observed = gate;
			}
		} finally {
			fs.writeFileSync(abs, original, "utf8");
			// Khôi phục parser về trạng thái của grammar ĐÃ phục hồi: nếu mutant còn sót
			// trong `parser.generated.js` thì mọi vitest run SAU đều bị nhiễm âm thầm.
			if (testCase.needsGen) runGenerator();
		}
		const restored = fs.readFileSync(abs, "utf8") === original;
		const expectedSurvive = Boolean(testCase.expect);
		const ok = expectedSurvive ? observed === null : observed !== null;
		if (!ok || !restored) failures += 1;
		rows.push({
			mutation: testCase.name,
			expected: expectedSurvive ? "survives" : "killed",
			observed: observed ? `RED (${observed.split("/").pop()})` : "GREEN",
			restored,
			verdict: ok && restored ? (expectedSurvive ? "as-documented" : "OK") : "UNEXPECTED",
		});
	} catch (err) {
		failures += 1;
		rows.push({ mutation: testCase.name, expected: "-", observed: `ERROR ${err.message}`, restored: "?", verdict: "UNEXPECTED" });
	}
}

const dirty = [];
for (const [file, snapshot] of pristine) {
	const current = fs.readFileSync(path.join(ROOT, file), "utf8");
	if (current !== snapshot) dirty.push(file);
}
if (generatedSnapshot !== null) {
	const current = fs.readFileSync(path.join(ROOT, GENERATED_PARSER), "utf8");
	if (current !== generatedSnapshot) dirty.push(GENERATED_PARSER);
}
if (dirty.length > 0) {
	failures += 1;
	console.log("");
	console.log("TREE INTEGRITY FAILURE — these files are NOT byte-identical to their pre-run state:");
	for (const f of dirty) console.log(`  - ${f}`);
	console.log("A mutant was left behind. Inspect and restore before staging anything.");
}

console.log("PINE STAGE 1 — MUTATION PROOF");
console.log("-".repeat(110));
// HAZARD 16 (2026-10-10): bảng cũ in DÒNG KẾT LUẬN trước, tên mutant in ở
// DÒNG SAU — `UNEXPECTED | GREEN` đọc thành "S4-2 hỏng" trong khi nó thuộc về
// S4-3. Người đọc (kể cả tác giả) quy kết một cái bảng đúng thành mâu thuẫn
// "harness báo xanh sai" rồi đi tìm bug trong harness thay vì trong test.
// Mỗi mutant nay nằm trên MỘT dòng: tên trước, kết luận sau — không thể lệch.
for (const r of rows) {
	console.log(`${r.verdict.padEnd(12)} | ${r.observed.padEnd(34)} | restored=${String(r.restored).padEnd(5)} | ${r.mutation}`);
}
console.log("-".repeat(110));
console.log(`${rows.length} mutations, ${failures} unexpected`);
process.exit(failures === 0 ? 0 : 1);