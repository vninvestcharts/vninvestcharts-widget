#!/usr/bin/env node
/**
 * Verify dist/ directory health before npm publish.
 * Checks:
 * 1. dist/ actually contains bundles (a non-vacuity guard - see below)
 * 2. No non-declaration .ts files in dist/ (.d.ts is allowed)
 * 3. No source maps (.map) would be included in npm package
 *
 * Usage:
 *   node scripts/verify-dist.js [dist-path]
 *   node scripts/verify-dist.js --self-test
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// The flags must be recognised BEFORE argv[2] is treated as a directory. Without this guard,
// `node scripts/verify-dist.js --self-test` resolved a directory literally named
// `--self-test`, found no files in it, printed `OK: 0 JS files in dist/` and exited 0 - a
// vacuous PASS in the very command added to close the vacuity.
const ARGS = process.argv.slice(2);
const SELF_TEST = ARGS.includes('--self-test');

function findFiles(dir, ext) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findFiles(fullPath, ext));
    } else if (entry.name.endsWith(ext)) {
      results.push(fullPath);
    }
  }
  return results;
}

function countBundles(dir) {
  return findFiles(dir, '.js').length + findFiles(dir, '.cjs').length + findFiles(dir, '.mjs').length;
}

function checkDir(distDir) {
  let errors = [];

  // Check 0: non-vacuity. Counted FIRST, before anything can pass, because the previous
  // version computed this after the failure branch: an absent or empty dist/ produced no
  // errors, so the script printed `OK: 0 JS files in dist/` and exited 0. That is a green
  // gate that verified nothing.
  const bundleCount = countBundles(distDir);
  if (bundleCount === 0) {
    errors.push(
      `dist/ at ${distDir} holds no .js/.cjs/.mjs bundle (0 found). ` +
        'A zero count means this gate verified nothing - run `npm run build` first.',
    );
  }

  // Check 1: No .ts files in dist/
  const tsFiles = findFiles(distDir, '.ts').filter((file) => !file.endsWith('.d.ts'));
  if (tsFiles.length > 0) {
    errors.push(`Found ${tsFiles.length} non-declaration .ts files in dist/ (should be 0)`);
    tsFiles.slice(0, 5).forEach((f) => console.error(`  - ${path.relative(distDir, f)}`));
  }

  // Check 2: .map files would be excluded from npm.
  // cwd is pinned to the REPO ROOT on purpose and is not pointed at the directory argument.
  // `npm pack` inspects the real package's files list, so it cannot be relocated to a temp
  // directory - there it fails with ENOENT (no package.json), which would push a pack failure
  // and let the script exit 1 for a reason unrelated to the bundle check.
  try {
    const result = execSync('npm pack --dry-run 2>&1', {
      cwd: ROOT,
      encoding: 'utf-8',
    });
    if (result.includes('.map')) {
      errors.push('.map files found in npm pack --dry-run — files field not excluding them');
    } else {
      console.log('  OK: no .map files in npm package');
    }
  } catch (e) {
    errors.push(`npm pack --dry-run failed: ${e.message}`);
  }

  if (errors.length > 0) {
    console.error('verify-dist FAILED:');
    errors.forEach((e) => console.error(`  - ${e}`));
    return 1;
  }

  console.log(`  OK: ${bundleCount} JS files in dist/`);
  console.log('verify-dist PASSED');
  return 0;
}

function selfTest() {
  let bad = 0;
  const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'ok   ' : 'FAIL '} ${name}${detail ? `  ${detail}` : ''}`);
    if (!ok) bad += 1;
  };

  // Control: argv[2] is never treated as a flag. Before the guard this resolved a directory
  // literally named `--self-test` and exited 0.
  const looksLikeFlag = ARGS[0] === '--self-test' || ARGS[0] === '--help';
  check('argv guard: --self-test is recognised as a flag, not a path', SELF_TEST === looksLikeFlag);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-dist-selftest-'));
  try {
    // Negative 1: an EMPTY directory must fail, and must say so.
    const emptyCode = checkDir(tmp);
    check('negative: an empty dist/ is a FAIL, not a vacuous Pass', emptyCode === 1, `exit=${emptyCode}`);

    // Control: a directory that really holds a bundle passes the bundle-count leg.
    fs.writeFileSync(path.join(tmp, 'index.js'), '// self-test fixture\n');
    const populated = countBundles(tmp);
    check('control: a populated directory counts its bundles', populated === 1, `count=${populated}`);

    // Negative 2: a stray non-declaration .ts file is still caught.
    fs.writeFileSync(path.join(tmp, 'leak.ts'), 'export const x = 1;\n');
    const withTs = checkDir(tmp);
    check('negative: a non-declaration .ts file is still a FAIL', withTs === 1, `exit=${withTs}`);
    fs.unlinkSync(path.join(tmp, 'leak.ts'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log(`\nverify-dist SELF-TEST ${bad === 0 ? 'PASS' : 'FAIL'}: ${bad === 0 ? 'all cases passed' : `${bad} case(s) failed`}`);
  return bad;
}

if (SELF_TEST) {
  process.exit(selfTest() === 0 ? 0 : 1);
}

const DIST_DIR = path.resolve(ROOT, ARGS[0] || 'dist');
process.exit(checkDir(DIST_DIR));
