#!/usr/bin/env node
/**
 * sync-version.js — Single source of truth for version numbers.
 *
 * Reads `package.json` version and patches all hardcoded version strings:
 *   1. src/public-api.ts  (export const version = '...')
 *   2. src/lib/types/runtime.ts (export const VERSION = "...")
 *   3. src/widget/iframe/iframeEntry.tsx (bridge.signalReady("...", [...]))
 *   4. README.md          (version badge)
 *
 * `src/index.ts` used to be target 2 and was removed on 2026-10-16. It is not a build entry and
 * `src/` is never published (package.json#files ships only dist/), so the string it carried was
 * unreachable by any consumer — and keeping it here meant deleting that file would crash
 * `npm run check:version` on a bare readFileSync.
 *
 * Usage:
 *   node scripts/sync-version.js          # sync only
 *   node scripts/sync-version.js --check  # verify all match (CI gate)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version;

const CHECK_MODE = process.argv.includes('--check');

const targets = [
  {
    file: path.join(ROOT, 'src', 'public-api.ts'),
    pattern: /export const version = '[^']*';/,
    replacement: `export const version = '${VERSION}';`,
    label: 'src/public-api.ts',
  },
  {
    file: path.join(ROOT, 'src', 'lib', 'types', 'runtime.ts'),
    pattern: /export const VERSION = "[^"]*";/,
    replacement: `export const VERSION = "${VERSION}";`,
    label: 'src/lib/types/runtime.ts',
  },
  {
    file: path.join(ROOT, 'src', 'widget', 'iframe', 'iframeEntry.tsx'),
    pattern: /bridge\?\.signalReady\("[^"]*",/,
    replacement: `bridge?.signalReady("${VERSION}",`,
    label: 'src/widget/iframe/iframeEntry.tsx',
  },
  {
    file: path.join(ROOT, 'README.md'),
    pattern: /version-[\d.]+-blue/,
    replacement: `version-${VERSION}-blue`,
    label: 'README.md',
  },
];

let failures = 0;

for (const t of targets) {
  const content = fs.readFileSync(t.file, 'utf8');
  const match = content.match(t.pattern);

  if (CHECK_MODE) {
    if (!match) {
      console.error(`FAIL ${t.label}: pattern not found`);
      failures++;
      continue;
    }
    const current = match[0].includes(VERSION);
    if (!current) {
      const got = match[0].match(/[\d]+\.[\d]+\.[\d]+/)?.[0] ?? 'unknown';
      console.error(`FAIL ${t.label}: expected ${VERSION}, got ${got}`);
      failures++;
    } else {
      console.log(`  OK ${t.label} = ${VERSION}`);
    }
  } else {
    if (!match) {
      console.error(`SKIP ${t.label}: pattern not found`);
      continue;
    }
    const updated = content.replace(t.pattern, t.replacement);
    fs.writeFileSync(t.file, updated, 'utf8');
    console.log(`  ${t.label} → ${VERSION}`);
  }
}

if (CHECK_MODE && failures > 0) {
  console.error(`\n${failures} version mismatch(es). Run: node scripts/sync-version.js`);
  process.exit(1);
} else if (!CHECK_MODE) {
  console.log(`\nAll version strings synced to ${VERSION}`);
}
