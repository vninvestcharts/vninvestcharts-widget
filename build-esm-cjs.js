const esbuild = require('esbuild');
const cssModulesPlugin = require('esbuild-plugin-css-modules');
const fs = require('fs');
const path = require('path');

/**
 * Esbuild plugin to handle Vite-style ?raw suffix imports.
 * Resolves `import X from "./foo.css?raw"` to a JS module exporting the file content as a string.
 */
const rawCssPlugin = {
  name: 'raw-css',
  setup(build) {
    build.onResolve({ filter: /\?raw$/ }, (args) => {
      const resolved = args.path.replace(/\?raw$/, '');
      return {
        path: path.resolve(args.resolveDir, resolved),
        namespace: 'raw-css',
      };
    });
    build.onLoad({ filter: /.*/, namespace: 'raw-css' }, (args) => {
      const content = fs.readFileSync(args.path, 'utf8');
      return {
        contents: `export default ${JSON.stringify(content)};`,
        loader: 'js',
      };
    });
  },
};

/**
 * esbuild-plugin-css-modules writes each transformed stylesheet to a temp file
 * and returns contents that `import "<absolute tmp path>"`. On Linux (CI) the
 * default resolver intermittently reports `Could not resolve "/tmp/..."` even
 * though the file exists — nondeterministic across runs (1–20 of 39 files).
 * Windows local builds never showed it. Explicitly resolving those paths in a
 * plugin (verified deterministic across repeated runs) removes the flake.
 * See AUDIT_LEDGER CSS_MODULES_TMP_RESOLVE_LINUX.
 */
const tmpCssResolverPlugin = {
  name: 'tmp-css-resolver',
  setup(build) {
    build.onResolve({ filter: /^\/tmp\// }, (args) => {
      if (fs.existsSync(args.path)) {
        return { path: args.path };
      }
      return undefined;
    });
  },
};

/**
 * Build ESM and CJS bundles using esbuild directly with css-modules plugin
 * This replaces tsup for the main bundle to ensure CSS modules work correctly
 */

const EXTERNAL_DEPS = [
  'react',
  'react-dom',
  'd3',
  'd3-array',
  'd3-scale',
  'd3-time',
  'd3-time-format',
  'd3-interpolate',
  'd3-selection',
  'd3-transition',
  'd3-ease',
  'd3-path',
  'd3-shape',
  'prop-types',
  'debug',
	'lodash.flattendeep',
	'save-svg-as-png',
	// S4: engine là dependency khai báo (package.json) — external để ESM/CJS
	// import thay vì bundle trọn kernel vào dist (fix FC-4: rò rỉ toàn bộ bundle).
	'@vninvestcharts/engine-core',
	'@vninvestcharts/engine-react',
	'@vninvestcharts/engine-drawing',
	// Rule 15 (open core): Pro packages must NEVER be inlined into the public
	// bundle. `tsup.config.ts` already externalises `@vninvestcharts/widget-pro`
	// in every target, but this esbuild path did not — and `tsconfig
	// .engine-paths.json` maps `@vninvestcharts/widget-pro` to the widget-pro
	// SOURCE, so the dynamic import in `src/widget/hooks/usePineScriptRestore.ts`
	// resolved into `packages/**` and dragged the private engine-pro detector into
	// the public build (measured 2026-10-26: `npm run build` failed with
	// "Could not resolve \"@vninvestcharts/engine-pro\"" at
	// packages/vn-kline-widget-pro/src/patterns/register.ts:17). Keeping both
	// external makes dist/index.js emit the bare `import("@vninvestcharts/
	// widget-pro")` the host resolves — fail-closed when it is absent.
	'@vninvestcharts/widget-pro',
	'@vninvestcharts/engine-pro',
];

/**
 * SECURITY INVARIANT — not cosmetic. Do not "simplify" these away.
 *
 * `src/widget/contexts/SaaSFeatureContext.tsx:72-74` guards the dev-only license
 * backdoor with a bare inline `if (typeof process !== "undefined" && process.env.NODE_ENV !== "production")`.
 * Inline matters: a bundler folds an inline `if` only if it can resolve the condition at build
 * time, so the condition must stay BARE and readable by esbuild's `define`.
 *
 * Measured at 405b12a, BOTH outputs shipped the symbol (1 occurrence each):
 *
 *   dist/index.js   -> the `if` was folded away ENTIRELY and a bare, UNCONDITIONAL
 *                      top-level `globalThis.__VNI_DEV_LICENSE__ = { setLicensePublicKey }`
 *                      was left behind. Cause: esbuild's implicit platform=browser define maps
 *                      `process.env.NODE_ENV` to "development" when minification is off — so the
 *                      `define` block below listing only `import.meta.url` did NOT protect it.
 *                      This is the worse of the two: the hook installs on import in every consumer.
 *   dist/index.cjs  -> `platform: "node"` means `process` is a real global, so nothing was
 *                      substituted and the whole `if` survived verbatim.
 *
 * Supplying `process.env.NODE_ENV` explicitly is what closes both. `platform` alone does not.
 */
const PRODUCTION_DEFINES = {
  'process.env.NODE_ENV': '"production"',
};

async function buildESMAndCJS() {
  const outDir = path.join(__dirname, 'dist');
  
  // Clean dist directory (keep some files)
  const filesToKeep = ['combined.css', 'injected.css', 'css-modules-manifest.json', 'index.d.ts'];
  if (fs.existsSync(outDir)) {
    const files = fs.readdirSync(outDir);
    for (const file of files) {
      if (!filesToKeep.includes(file)) {
        const filePath = path.join(outDir, file);
        if (fs.statSync(filePath).isDirectory()) {
          fs.rmSync(filePath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(filePath);
        }
      }
    }
  } else {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Build ESM
  console.log('Building ESM...');
  await esbuild.build({
    entryPoints: ['src/public-api.ts'],
    bundle: true,
    platform: 'browser',
    format: 'esm',
    outdir: outDir,
    outExtension: { '.js': '.js' },
    splitting: true,
    sourcemap: true,
    treeShaking: true,
    // `define` alone only FOLDS the dev-only license guard to `&& false`; the
    // assignment and the symbol string survive into the shipped bytes. Only the
    // minify pass drops the dead branch entirely. Measured after adding the define
    // above, both outputs still contained 1 occurrence each.
    // See src/widget/contexts/__tests__/devLicenseHook.production.test.ts:85-98,
    // which pins exactly this weaker, unminified guarantee.
    minify: true,
    external: EXTERNAL_DEPS,
    plugins: [
      tmpCssResolverPlugin,
      cssModulesPlugin({
        localIdentName: '[local]_[hash:5:sha256:base64]',
        extension: '.module.css',
      }),
      rawCssPlugin,
    ],
    loader: {
      '.css': 'css',
      '.ts': 'ts',
      '.tsx': 'tsx',
    },
    tsconfig: 'tsconfig.json',
    define: {
      'import.meta.url': 'self.location.href',
      ...PRODUCTION_DEFINES,
    },
    outbase: 'src',
    outdir: outDir,
    entryNames: '[dir]/[name]',
  });
  console.log('ESM build complete');

  // Build CJS
  console.log('Building CJS...');
  await esbuild.build({
    entryPoints: ['src/public-api.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outdir: outDir,
    outExtension: { '.js': '.cjs' },
    splitting: false,
    sourcemap: true,
    treeShaking: true,
    // See the ESM build above for why the define is not sufficient on its own.
    minify: true,
    external: EXTERNAL_DEPS,
    plugins: [
      tmpCssResolverPlugin,
      cssModulesPlugin({
        localIdentName: '[local]_[hash:5:sha256:base64]',
        extension: '.module.css',
      }),
      rawCssPlugin,
    ],
    loader: {
      '.css': 'css',
      '.ts': 'ts',
      '.tsx': 'tsx',
    },
    tsconfig: 'tsconfig.json',
    define: { ...PRODUCTION_DEFINES },
  });
  console.log('CJS build complete');

  // Copy combined.css as fallback index.css (only if public-api.css doesn't exist)
  const indexCssPath = path.join(outDir, 'index.css');
  if (!fs.existsSync(indexCssPath) && fs.existsSync(path.join(outDir, 'combined.css'))) {
    fs.copyFileSync(
      path.join(outDir, 'combined.css'),
      indexCssPath
    );
    console.log('Copied combined.css to index.css (fallback)');
  }
}

async function main() {
  try {
    await buildESMAndCJS();
    console.log('\n=== ESM/CJS Build Complete ===');
  } catch (err) {
    console.error('Build failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { buildESMAndCJS };