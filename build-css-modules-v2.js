const esbuild = require('esbuild');
const cssModulesPlugin = require('esbuild-plugin-css-modules');
const fs = require('fs');
const path = require('path');

/* The repo root. metafile input keys are repo-relative ("src/widget/styles/..."),
 * so they have to be resolved against this rather than against process.cwd(). */
const ROOT_DIR = __dirname;

/**
 * Build script that handles CSS Modules correctly for all build targets.
 * Uses predictable naming: {filePrefix}_{originalClassName}
 */

async function buildCSSModules() {
  const stylesDir = path.join(__dirname, 'src/widget/styles');
 	const moduleCssFiles = fs.readdirSync(stylesDir)
    .filter(f => f.endsWith('.module.css'))
    .map(f => path.join(stylesDir, f));

  console.log('Found CSS module files:', moduleCssFiles.length);
/* Compile the CSS modules and read every output back by the path esbuild
   * ACTUALLY chose, taken from `metafile.outputs`.
   *
   * Three earlier approaches each worked locally and failed on the Linux runner,
   * and the CI diagnostic (run 36978861348) is what identified the real cause:
   *
   *   node v20.20.2 · esbuild 0.28.1 · css-modules 0.3.0 · TMPDIR <unset>
   *   dist/ absent before the build · 14 modules present at correct sizes
   *   "CSS modules build succeeded" … then 14/14 produced no output, Present: (none)
   *
   * The discarded attempts, and why each was wrong:
   *
   *   a) A generated `temp-combined.module.css` with RELATIVE `@import`s. The
   *      plugin rewrites the file it loads to
   *        path.resolve(tmpDirPath, path.relative("/", dirname(args.path)), base + ".css")
   *      (lib/index.js:112 — the extension is dropped) and returns an ES module
   *      that IMPORTS that temp path (lib/index.js:121). The relative imports then
   *      resolve inside a temp directory that never holds the `.module.css` names:
   *        ERROR: Could not resolve "/tmp/tmp-2265-.../styles/advisory-panel.css"
   *
   *   b) `stdin` + `resolveDir`. Fixes (a) but the plugin's onLoad filter
   *      (lib/index.js:59) does not match a stdin source, so the modules load
   *      through esbuild's plain CSS loader. That is also why an INVALID
   *      `[hash:base64:5]` sat in this repo for years and still exited 0 locally —
   *      and why an earlier "byte-identical output" check proved less than it
   *      looked, since the classes were never being hashed locally at all.
   *
   *   c) `outdir` + reading the directory back. Fails because esbuild creates NO
   *      outdir on the runner: the plugin's onLoad returns JS module source, and
   *      with no `bundle` those outputs are not files in our outdir.
   *
   * `metafile` avoids depending on any of that: it reports the real output paths
   * esbuild wrote, wherever they are, and `write:false` keeps them out of the tree
   * entirely. No intermediate directory is created, so there is nothing to publish,
   * nothing to clean up, and no stale directory a later build could concatenate.
   */
  const result = await esbuild.build({
    entryPoints: moduleCssFiles,
    /* outdir is mandatory once there is more than one entry point, but
     * `write: false` means esbuild resolves every path, reports it in the
     * metafile, and returns the content in memory without creating anything on
     * disk. The path is never written, so it is not a directory that can end up
     * published, stale, or empty. */
    outdir: path.join(__dirname, 'dist/css-modules'),
    write: false,
    metafile: true,
    format: 'esm',
    plugins: [
      cssModulesPlugin({
        localIdentName: '[local]_[hash:5:sha256:base64]',
        extension: '.module.css',
      })
    ],
    loader: {
      '.css': 'css',
    },
  });

  /* Map each entry to the text esbuild produced for it.
   *
   * `metafile.outputs[outKey].entryPoint` is the exact input esbuild built that
   * output from — a 1:1 mapping that needs no name inference. Verified shape:
   *   outputs["dist/css-modules/advisory-panel.module.css"] = {
   *     inputs: ["src/widget/styles/advisory-panel.module.css"],
   *     entryPoint: "src/widget/styles/advisory-panel.module.css",
   *     bytes: ...
   *   }
   *
   * Three readings of this metafile that were wrong first, recorded because each
   * looked plausible and each failed only on the runner:
   *   - `outputs[out].imports` is EMPTY (no bundle ⇒ one output per input is not
   *     an import), so the join cannot come from there.
   *   - `inputs[in].bytes` is the input's SIZE, not an index into outputFiles.
   *   - Matching `path.basename(outputKey)` to `path.basename(input)` assumes
   *     esbuild keeps the input's extension in the output name. It does locally,
   *     and it need not: the plugin writes its temp file with `.css`
   *     (lib/index.js:112 drops the `.module`), so the output name derives from
   *     whatever the plugin resolved. `entryPoint` has no such dependency.
   */
  const byEntryPoint = new Map();
  for (const [outputKey, meta] of Object.entries(result.metafile.outputs)) {
    if (!meta.entryPoint) continue;
    const abs = path.resolve(ROOT_DIR, outputKey);
    const file = result.outputFiles.find((o) => path.resolve(o.path) === abs);
    if (file) byEntryPoint.set(path.resolve(ROOT_DIR, meta.entryPoint), file.text);
  }

  const byInput = new Map();
  for (const entry of moduleCssFiles) {
    const key = path.resolve(entry);
    if (byEntryPoint.has(key)) byInput.set(key, byEntryPoint.get(key));
  }

  const parts = [];
  const missing = [];
  for (const entry of moduleCssFiles) {
    const text = byInput.get(path.resolve(entry));
    if (typeof text === 'string' && text.length) parts.push(text);
    else missing.push(path.basename(entry));
  }
  if (missing.length) {
    const produced = Object.keys(result.metafile.outputs).length;
    throw new Error(
      `build:css: ${missing.length}/${moduleCssFiles.length} CSS modules produced no output ` +
      `(missing: ${missing.join(', ')}). esbuild reported ${produced} output(s). ` +
      'A module that produced no output was never processed — do not ship a partial bundle.',
    );
  }

  console.log('CSS modules build succeeded');

  // Build widget.css (plain CSS, non-module) with resolved @import tokens
  const widgetCssPath = path.join(stylesDir, 'widget.css');
  if (fs.existsSync(widgetCssPath)) {
    console.log('Building widget.css as plain CSS...');
    await esbuild.build({
      entryPoints: [widgetCssPath],
      bundle: true,
      outfile: path.join(__dirname, 'dist/widget-bundle.css'),
      loader: {
        '.css': 'css',
      },
    });
    console.log('widget.css build succeeded');
  }

  /* Concatenate into the single dist/combined.css that injectStyles.ts imports
   * with `?raw` (injectStyles.ts:11). Order follows moduleCssFiles, i.e. the same
   * order the original `@import` aggregate produced, so the document is
   * unchanged apart from the per-file banner comments. */
  fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'dist/combined.css'), parts.join('\n'), 'utf8');

  // Nothing to clean up. `write: false` means esbuild resolved every output path
  // and returned the content in memory, so no intermediate directory is ever
  // created — which also removes the window where a crashed build left files that
  // a later run's readdir would concatenate by accident.

  // Copy to injected.css for runtime injection, then append widget.css
  fs.copyFileSync(
    path.join(__dirname, 'dist/combined.css'),
    path.join(__dirname, 'src/widget/styles/injected.css')
  );
  if (fs.existsSync(path.join(__dirname, 'dist/widget-bundle.css'))) {
    const widgetCss = fs.readFileSync(path.join(__dirname, 'dist/widget-bundle.css'), 'utf8');
    const existingDev = fs.readFileSync(path.join(__dirname, 'src/widget/styles/injected.css'), 'utf8');
    fs.writeFileSync(path.join(__dirname, 'src/widget/styles/injected.css'), existingDev + '\n' + widgetCss);
  }
  console.log('Copied to src/widget/styles/injected.css');

  // Also copy to dist for IIFE/iframe builds
  fs.copyFileSync(
    path.join(__dirname, 'dist/combined.css'),
    path.join(__dirname, 'dist/injected.css')
  );
  if (fs.existsSync(path.join(__dirname, 'dist/widget-bundle.css'))) {
    const widgetCss = fs.readFileSync(path.join(__dirname, 'dist/widget-bundle.css'), 'utf8');
    const existingDist = fs.readFileSync(path.join(__dirname, 'dist/injected.css'), 'utf8');
    fs.writeFileSync(path.join(__dirname, 'dist/injected.css'), existingDist + '\n' + widgetCss);
  }
  console.log('Copied to dist/injected.css');

  return fs.readFileSync(path.join(__dirname, 'dist/combined.css'), 'utf8');
}

/**
 * Extract class name mappings from generated CSS
 * Pattern: .{filePrefix}_{originalClassName}
 * Where filePrefix = filename with hyphens replaced by underscores
 */
function extractClassNameMappings(css, moduleCssFiles) {
  const manifest = {};
  
  // Build file prefix map
  const filePrefixMap = {};
  for (const filePath of moduleCssFiles) {
    const fileName = path.basename(filePath, '.module.css');
    const filePrefix = fileName.replace(/-/g, '_');
    filePrefixMap[filePrefix] = fileName;
  }

  // Regex to match scoped class names: .filePrefix_originalClassName
  const scopedClassRegex = /\.(?:[a-zA-Z0-9_-]+)_([a-zA-Z0-9_-]+)(?=\s*[{:,])/g;
  
  let match;
  while ((match = scopedClassRegex.exec(css)) !== null) {
    const fullMatch = match[0]; // .filePrefix_originalClassName
    const originalName = match[1]; // originalClassName
    
    // Extract file prefix from full match
    const prefixMatch = fullMatch.match(/^\.([a-zA-Z0-9_-]+)_/);
    if (prefixMatch) {
      const filePrefix = prefixMatch[1];
      const scopedName = fullMatch.substring(1); // Remove leading dot
      manifest[originalName] = scopedName;
    }
  }

  // Also handle keyframes and other at-rules
  const keyframeRegex = /@keyframes\s+([a-zA-Z0-9_-]+)_([a-zA-Z0-9_-]+)/g;
  while ((match = keyframeRegex.exec(css)) !== null) {
    const filePrefix = match[1];
    const originalName = match[2];
    const scopedName = `${filePrefix}_${originalName}`;
    manifest[originalName] = scopedName;
  }

  console.log('Extracted class name mappings:', Object.keys(manifest).length);
  return manifest;
}

/**
 * Patch JS files to use scoped class names from manifest
 */
function patchJSBundles(manifest) {
  const distDir = path.join(__dirname, 'dist');
  const jsFiles = fs.readdirSync(distDir)
    .filter(f => (f.endsWith('.js') || f.endsWith('.cjs') || f.endsWith('.mjs')) && !f.includes('.map'))
    .map(f => path.join(distDir, f));

  console.log('Patching JS files:', jsFiles.length);

  for (const jsFile of jsFiles) {
    let content = fs.readFileSync(jsFile, 'utf8');
    let patched = false;

    // Sort by length descending to avoid partial replacements
    const sortedEntries = Object.entries(manifest).sort((a, b) => b[0].length - a[0].length);

    for (const [original, scoped] of sortedEntries) {
      // Pattern 1: styles.original
      const regex1 = new RegExp(`styles\\.${escapeRegExp(original)}\\b`, 'g');
      // Pattern 2: styles['original'] or styles["original"]
      const regex2 = new RegExp(`styles\\[['"]${escapeRegExp(original)}['"]\\]`, 'g');
      // Pattern 3: className={styles.original}
      const regex3 = new RegExp(`className=\\{styles\\.${escapeRegExp(original)}\\}`, 'g');
      // Pattern 4: className={styles['original']}
      const regex4 = new RegExp(`className=\\{styles\\[['"]${escapeRegExp(original)}['"]\\]\\}`, 'g');
      // Pattern 5: className: styles.original (object property)
      const regex5 = new RegExp(`className:\\s*styles\\.${escapeRegExp(original)}\\b`, 'g');
      // Pattern 6: className: styles['original']
      const regex6 = new RegExp(`className:\\s*styles\\[['"]${escapeRegExp(original)}['"]\\]`, 'g');

      const before = content;
      content = content.replace(regex1, `styles.${scoped}`);
      content = content.replace(regex2, `styles['${scoped}']`);
      content = content.replace(regex3, `className={styles.${scoped}}`);
      content = content.replace(regex4, `className={styles['${scoped}']}`);
      content = content.replace(regex5, `className: styles.${scoped}`);
      content = content.replace(regex6, `className: styles['${scoped}']`);

      if (content !== before) {
        patched = true;
      }
    }

    if (patched) {
      fs.writeFileSync(jsFile, content);
      console.log(`Patched: ${path.basename(jsFile)}`);
    }
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Main execution
async function main() {
  try {
    console.log('=== Building CSS Modules ===');
    const stylesDir = path.join(__dirname, 'src/widget/styles');
    const moduleCssFiles = fs.readdirSync(stylesDir)
      .filter(f => f.endsWith('.module.css'))
      .map(f => path.join(stylesDir, f));
    
    const css = await buildCSSModules();

    console.log('\n=== Extracting Class Name Mappings ===');
    const manifest = extractClassNameMappings(css, moduleCssFiles);

    // Save manifest for debugging
    fs.writeFileSync(
      path.join(__dirname, 'dist/css-modules-manifest.json'),
      JSON.stringify(manifest, null, 2)
    );
    console.log('Saved manifest to dist/css-modules-manifest.json');

    console.log('\n=== Patching JS Bundles ===');
    patchJSBundles(manifest);

    console.log('\n=== Build Complete ===');
  } catch (err) {
    console.error('Build failed:', err);
    process.exit(1);
  }
}

module.exports = { buildCSSModules, extractClassNameMappings, patchJSBundles };

if (require.main === module) {
  main();
}
