#!/usr/bin/env node
/**
 * Append one section to docs/upgrade-standard/AUDIT_LEDGER.md.
 *
 * Exists because the ledger is CRLF end to end (17,872 of 17,873 line breaks),
 * and writing it with a plain LF append turns a 40-line addition into a
 * whole-file rewrite — hazard 16, which has already cost this repo one session.
 * A programmatic write MUST preserve the dominant line ending, so this script
 * detects it rather than assuming, and asserts the result afterwards.
 */
const fs = require("node:fs");
const path = require("node:path");

const LEDGER = path.join(__dirname, "..", "docs", "upgrade-standard", "AUDIT_LEDGER.md");
const source = process.argv[2];

if (!source) {
	console.error("usage: node scripts/append-ledger-section.cjs <file-with-the-section>");
	process.exit(2);
}

const original = fs.readFileSync(LEDGER, "utf8");
const body = fs.readFileSync(path.resolve(source), "utf8");

// Dominant line ending of the file being appended to.
const crlf = (original.match(/\r\n/g) || []).length;
const lf = (original.match(/(?<!\r)\n/g) || []).length;
const eol = crlf >= lf ? "\r\n" : "\n";

// Normalise the addition to the file's own line ending. A section authored as
// LF must not be spliced into a CRLF file: the result is a mixed-ending file that
// `git` then normalises on the next touch, turning a small append into a
// whole-file diff.
const addition = body.replace(/(?:\r?\n)+$/, "").replace(/\r?\n/g, eol);

// `original` already ends with `eol` (verified below), so the section is simply
// appended. The first version of this line read
//     original.endsWith(eol) ? addition + eol : original + eol + addition + eol
// which DISCARDED the entire ledger whenever the file already ended with a
// newline — i.e. always. It wrote 162 lines over 17,873. The assertion below is
// what caught it; that guard is the reason this helper exists at all.
if (!original.endsWith(eol) && !original.endsWith("\n")) {
	// Defensive: a file with no trailing newline at all.
	original += eol;
}
const payload = original + addition + eol;

fs.writeFileSync(LEDGER, payload, "utf8");

// Assert rather than assume (hazard 16): the diff must be additions only.
//
// Compared against the file as it is NOW ON DISK, not against the string this
// script built. Comparing against the in-memory copy was wrong in a second way:
// the first version compared `original` (read with its CRLF intact) to `after`
// split on `/\r?\n/`, so line 1 of one carried a trailing `\r` and line 1 of the
// other did not — `prefixPreserved` was false on a perfectly clean append, which
// is how a guard that reports "FAIL" on success trains people to ignore it.
const after = fs.readFileSync(LEDGER, "utf8");
const onDisk = require("node:child_process")
	.execFileSync("git", ["show", `HEAD:${path.relative(path.join(__dirname, ".."), LEDGER).replace(/\\/g, "/")}`], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const committedArr = onDisk.split(/\r?\n/);
const beforeArr = after.split(/\r?\n/);

// Two things must not be confused here, and confusing either one produces a
// guard that cries FAIL on a clean append — which is worse than no guard,
// because it teaches people to ignore it.
//
//  1. Compare only the COMMITTED PREFIX. The file read back has the new section
//     appended, so comparing element-for-element over the whole file compares the
//     new tail against the old tail.
//  2. Drop the trailing EMPTY element. Splitting a file that ends with a newline
//     yields a final "" that is a split artifact, not a line. It is exactly that
//     element that differs ("" vs "---"), and it is why this guard reported FAIL
//     on an append git itself records as 161 added / 0 deleted.
const committedLines = committedArr.length > 0 && committedArr[committedArr.length - 1] === ""
	? committedArr.slice(0, -1)
	: committedArr;
const prefixPreserved = committedLines.every((line, i) => beforeArr[i] === line);
const added = beforeArr.length - committedLines.length;
const mixedEndings = (after.match(/(?<!\r)\n/g) || []).length;
console.log(`appended ${added} line(s); the ${committedArr.length} committed line(s) are unchanged: ${prefixPreserved}`);
console.log(`LF-only line breaks in the result: ${mixedEndings} (want 0)`);
if (!prefixPreserved) {
	console.error("FAIL: the append changed existing content. Restore with git checkout.");
	process.exit(1);
}