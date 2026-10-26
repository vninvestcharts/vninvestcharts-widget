#!/usr/bin/env node
'use strict';

/**
 * check-lessons.cjs - structural gate for `docs/LESSONS/`.
 *
 * Enforces the three hard rules in `docs/LESSONS/INDEX.md` §1.2 that were previously
 * only counted by hand:
 *
 *   C1     each lesson file <= 120 lines
 *   C2     total lessons      <= 40   (INDEX.md excluded - its format template is not a lesson)
 *   DRIFT  the counts in INDEX.md §1.5 must match reality
 *
 * Two deliberate deviations from the eoffice-be original, both because this repo has
 * a precedent for it (see L-G02):
 *
 *   1. Every check reads the file as UTF-8 via `readFileSync`. The PowerShell console
 *      here renders non-ASCII as mojibake, and a gate that reports a lesson title the
 *      operator cannot read is a gate they learn to distrust.
 *   2. Line counting strips a trailing BOM. `Get-Content | Measure-Object -Line` also
 *      skips blank lines, so hand-counting disagrees with this gate by 10-29 lines per
 *      file; do not mix the two methods when cross-checking.
 *
 * Usage:
 *   node scripts/check-lessons.cjs [--dir <dir>]
 *   node scripts/check-lessons.cjs --self-test
 *
 * Exit: 0 clean | 1 violation | 2 cannot verify (must never be read as Pass)
 */

const { readFileSync, existsSync, readdirSync, writeFileSync, mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');

const REPO = join(__dirname, '..');
const DEFAULT_DIR = 'docs/LESSONS';

const C1_MAX_LINES = 120;
const C2_MAX_LESSONS = 40;
const INDEX = 'INDEX.md';

/** Count real lines: split on newlines, ignore blank lines, drop a trailing newline's
 *  phantom empty entry. Never use `Measure-Object -Line` to argue with this number. */
function countLines(text) {
  const t = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\n+$/, '');
  if (t === '') return 0;
  return t.split('\n').filter((l) => l.trim() !== '').length;
}

/** Lesson headings only - `^## L-<letter><digits>` so the INDEX format template
 *  (`## L-XXX: ...`) cannot be miscounted as a real lesson. */
function lessonIds(text) {
  return (text.match(/^## L-[A-Z]\d+/gm) || []).map((s) => s.replace(/^## /, ''));
}

function run(args) {
  return spawnSync(process.execPath, [__filename, ...args], { encoding: 'utf8', shell: false });
}

/* ------------------------------- checks ------------------------------- */

function check(dir) {
  const problems = [];

  if (!existsSync(dir)) {
    console.error(`FAIL: READ  khong tim thay ${dir} - KHONG verify duoc.`);
    return 2;
  }

  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  } catch (e) {
    console.error(`FAIL: READ  khong doc duoc ${dir}: ${e.message}`);
    return 2;
  }
  if (files.length === 0) {
    console.error(`FAIL: READ  ${dir} khong co file .md nao - KHONG verify duoc.`);
    return 2;
  }

  // C1 - every file, INDEX.md included, must fit one read
  let total = 0;
  const perFile = {};

  for (const f of files) {
    let text;
    try {
      text = readFileSync(join(dir, f), 'utf8');
    } catch (e) {
      problems.push(`READ     ${f} khong doc duoc: ${e.message}`);
      continue;
    }
    const lines = countLines(text);
    const lessons = f === INDEX ? 0 : lessonIds(text).length;
    perFile[f] = { lines, lessons };
    if (lines > C1_MAX_LINES) {
      problems.push(`C1       ${f} co ${lines} dong > ${C1_MAX_LINES} - tach them roi`);
    }
    if (f !== INDEX) total += lessons;
  }

  // C2 - total lessons
  if (total > C2_MAX_LESSONS) {
    problems.push(`C2       tong ${total} lesson > ${C2_MAX_LESSONS} - gop lesson trung lap, KHONG them file`);
  }

  // DRIFT - INDEX.md must tell the truth
  const indexPath = join(dir, INDEX);
  if (!existsSync(indexPath)) {
    problems.push(`MISSING  khong co ${INDEX} trong ${dir}`);
  } else {
    const idx = readFileSync(indexPath, 'utf8');
    // `T[^:*\n]{0,12}:` on purpose - a literal `Tổng` fails to match if the diacritic is
    // dropped somewhere, and a gate whose DRIFT check silently stops matching is worse
    // than no check. Found by the self-test on its first run.
    const declared = idx.match(/\*\*\s*T[^:*\n]{0,12}:\s*(\d+)\s*lesson/);
    if (declared && Number(declared[1]) !== total) {
      problems.push(`DRIFT    INDEX.md §1.5 ghi tong ${declared[1]} lesson, thuc te la ${total}`);
    }
    const listed = new Set([...idx.matchAll(/\]\(\.\/([^)]+\.md)\)/g)].map((m) => m[1]));
    for (const f of files) {
      if (f === INDEX) continue;
      if (!listed.has(f)) problems.push(`DRIFT    ${f} khong duoc ke trong INDEX.md §1.5`);
    }
    // A lesson ID cited by the skill must exist - otherwise the skill points at nothing.
    const realIds = new Set(
      Object.entries(perFile)
        .filter(([f]) => f !== INDEX)
        .flatMap(([f]) => lessonIds(readFileSync(join(dir, f), 'utf8')))
    );
    for (const m of idx.matchAll(/\b(L-[A-Z]\d+)\b/g)) {
      if (!realIds.has(m[1])) problems.push(`DRIFT    INDEX.md tro toi ${m[1]} - khong ton tai trong bat ky lesson file`);
    }
  }

  if (problems.length) {
    for (const p of problems) console.error(`  ${p}`);
    console.error(`\ncheck-lessons: ${problems.length} loi.`);
    return 1;
  }

  const detail = Object.entries(perFile)
    .filter(([f]) => f !== INDEX)
    .map(([f, v]) => `${f} ${v.lines}d/${v.lessons}bai`)
    .join(' · ');
  console.log(`  check-lessons: ${files.length} file | ${total}/${C2_MAX_LESSONS} lesson | ${detail} - sach.`);
  return 0;
}

/* ------------------------------ self-test ------------------------------ */
/* A self-test that cannot fail proves nothing (L-G02). Every case below drives this
 * gate as a child process on a temp fixture and asserts a NON-zero exit. */

function selfTest() {
  console.log('check-lessons SELF-TEST - chay tren ban sao tam, assert gate BAT\n');

  const cases = [];
  let failures = 0;

  const good = {
    'INDEX.md': '# idx\n\n## §1.5\n\n| [`a.md`](./a.md) | L-E01 |\n\n**Tổng: 2 lesson / 1 file**\n',
    'a.md': '## L-E01: a\n\nx\n\n## L-E02: b\n\ny\n',
  };

  const build = (files) => {
    const dir = mkdtempSync(join(tmpdir(), 'check-lessons-'));
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body, 'utf8');
    return dir;
  };

  const probe = (name, files, expect) => {
    const dir = build(files);
    const r = run(['--dir', dir]);
    rmSync(dir, { recursive: true, force: true });
    const out = r.stdout + r.stderr;
    const ok = expect === null ? r.status === 0 : r.status !== 0 && out.includes(expect);
    cases.push({ name, ok });
    if (!ok) {
      failures++;
      console.error(
        `  FAIL  ${name}\n        expected ${expect === null ? 'exit 0' : `exit != 0 containing "${expect}"`}, got exit=${r.status}\n${out.trim()}`
      );
    } else {
      console.log(`  ok   ${name}  exit=${r.status}`);
    }
  };

  // CONTROL - without this a broken gate still reports "all cases passed"
  probe('CONTROL: mau sach', good, null);

  probe('C1: file 121 dong', { ...good, 'a.md': good['a.md'] + 'x\n'.repeat(119) }, 'C1');

  const many = { 'INDEX.md': '# idx\n\n**Tổng: 41 lesson**\n' };
  for (let i = 1; i <= 41; i++) many[`f${i}.md`] = `## L-G${String(i).padStart(2, '0')}: t\n\nx\n`;
  probe('C2: 41 lesson', many, 'C2');

  probe('DRIFT: INDEX khai tong 99', { ...good, 'INDEX.md': good['INDEX.md'].replace('2 lesson', '99 lesson') }, 'DRIFT');

  probe(
    'DRIFT: lesson file bi bo qua',
    {
      ...good,
      'b.md': '## L-E03: c\n\nx\n',
      'INDEX.md': good['INDEX.md'].replace('**Tổng: 2', '**Tổng: 3'),
    },
    'DRIFT'
  );

  probe(
    'DRIFT: INDEX tro toi lesson khong ton tai',
    { ...good, 'INDEX.md': good['INDEX.md'].replace('L-E01', 'L-Z99') },
    'DRIFT'
  );

  probe('MISSING: thieu INDEX.md', { 'a.md': good['a.md'] }, 'MISSING');
  probe('READ: thu muc rong', {}, 'khong co file');

  // "Cannot verify" is exit 2, never exit 0 - a green gate that checked nothing
  const emptyDir = mkdtempSync(join(tmpdir(), 'check-lessons-empty-'));
  const rEmpty = run(['--dir', emptyDir]);
  rmSync(emptyDir, { recursive: true, force: true });
  cases.push({ name: 'EXIT 2: khong verify duoc', ok: rEmpty.status === 2 });
  if (rEmpty.status !== 2) {
    failures++;
    console.error(`  FAIL  EXIT  thu muc rong phai tra 2, nhan ${rEmpty.status}`);
  } else {
    console.log(`  ok   EXIT 2: khong verify duoc  exit=2`);
  }

  if (failures > 0) {
    console.error(`\ncheck-lessons SELF-TEST FAILED: ${failures}/${cases.length} case. Gate khong duoc tin.`);
    process.exit(1);
  }
  console.log(`\ncheck-lessons SELF-TEST PASS: ${cases.length} case theo dac ta.`);
}

/* -------------------------------- main -------------------------------- */

const a = process.argv.slice(2);
if (a.includes('--self-test')) {
  selfTest();
} else {
  const i = a.indexOf('--dir');
  process.exit(check(i >= 0 && a[i + 1] ? a[i + 1] : join(REPO, DEFAULT_DIR)));
}