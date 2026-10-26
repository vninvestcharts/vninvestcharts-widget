import fs from "node:fs";
import path from "node:path";

import { defineConfig } from "tsup";

const isNpmPublish = process.env.NPM_PUBLISH === "1";
const sourcemap = isNpmPublish ? false : true;

// The engine twin repo. Defaults to the sibling checkout; VN_ENGINE_REPO points
// the bundles at a worktree. Without this the bundled IIFE resolved the engine
// through a stale copy and reported "no matching export" for symbols that the
// engine does export.
//
// The alias is only applied when a checkout actually exists. A consumer or a CI
// runner that installed the published engine packages has no sibling repo, and
// forcing the mapping there produced "Cannot read file: .../vninvestcharts-engine"
// — a hard build failure in exactly the environment that most needs to work.
// When there is no checkout, resolution falls through to node_modules, which is
// the published package, and that is the correct answer.
const engineRepo = process.env.VN_ENGINE_REPO
	? path.resolve(process.env.VN_ENGINE_REPO)
	: path.resolve(__dirname, "../vninvestcharts-engine");
const engineRepoExists = fs.existsSync(path.join(engineRepo, "packages", "vn-kline-engine-drawing", "src", "index.ts"));
const engineAlias = engineRepoExists
	? {
			"@vninvestcharts/engine-core": path.join(engineRepo, "packages", "vn-kline-engine-core", "src", "index.ts"),
			"@vninvestcharts/engine-react": path.join(engineRepo, "packages", "vn-kline-engine-react", "src", "index.ts"),
			"@vninvestcharts/engine-drawing": path.join(engineRepo, "packages", "vn-kline-engine-drawing", "src", "index.ts"),
			"@vninvestcharts/engine-pro": path.join(engineRepo, "packages", "vn-kline-engine-pro", "src", "index.ts"),
			"@vninvestcharts/vn-kline-engine-core": path.join(engineRepo, "packages", "vn-kline-engine-core", "src", "index.ts"),
			"@vninvestcharts/vn-kline-engine-react": path.join(engineRepo, "packages", "vn-kline-engine-react", "src", "index.ts"),
			"@vninvestcharts/vn-kline-engine-pro": path.join(engineRepo, "packages", "vn-kline-engine-pro", "src", "index.ts"),
		}
	: ({} as Record<string, string>);

// tsup's own `alias` option did not take effect for these specifiers, so the
// mapping is done with a resolve plugin - the same mechanism as the prop-types
// mock below. Without it, a bundle that inlines the engine resolved a stale
// copy and reported "no matching export" for symbols the engine does export.
const engineAliasPlugin = {
	name: "engine-alias",
	setup(build: any) {
		build.onResolve({ filter: /^@vninvestcharts\/(engine-core|engine-react|engine-drawing|engine-pro|widget-pro|vn-kline-engine-core|vn-kline-engine-react|vn-kline-engine-pro)$/ }, (args: any) => {
			// open-core split: widget-pro MUST stay external (dynamic import preserved
			// at runtime). Inlining it would ship the ~600KB Pro compiler inside the
			// Free bundle (measured in dist/vninvestchart.iife.js). The sanctioned lazy
			// path (usePineScriptRestore) catches the load failure fail-closed.
			if (args.path === "@vninvestcharts/widget-pro") {
				return { external: true };
			}
			const mapped = engineAlias[args.path as keyof typeof engineAlias];
			// No checkout: return nothing so esbuild continues with normal node
			// resolution and picks up the installed package.
			if (!mapped) return null;
			return { path: mapped };
		});
	},
};

const mockPropTypesPlugin = {
	name: "mock-prop-types",
	setup(build: any) {
		build.onResolve({ filter: /^prop-types$/ }, () => {
			return { path: "mock-prop-types", namespace: "mock-prop-types" };
		});
		build.onLoad({ filter: /.*/, namespace: "mock-prop-types" }, () => {
			return {
				contents: `
					const shim = () => shim;
					shim.isRequired = shim;
					const PropTypes = {
						array: shim,
						bool: shim,
						func: shim,
						number: shim,
						object: shim,
						string: shim,
						any: shim,
						arrayOf: shim,
						element: shim,
						instanceOf: shim,
						node: shim,
						objectOf: shim,
						oneOf: shim,
						oneOfType: shim,
						shape: shim,
						exact: shim,
					};
					export default PropTypes;
				`,
				loader: "js",
			};
		});
	},
};

export default defineConfig([
	// Adapters subpath bundle
	{
		entry: ["src/widget/adapters/index.ts"],
		format: ["esm", "cjs", "umd"],
		dts: true,
		splitting: false,
		sourcemap,
		clean: false,
		treeshake: true,
		outDir: "dist/adapters",
		outExtension({ format }) {
			return { js: format === "cjs" ? ".cjs" : format === "umd" ? ".umd.js" : ".js" };
		},
		external: [
			/^react$/,
			/^react-dom$/,
			/^d3(-|$)/,
			/^prop-types$/,
			/^lodash\.flattendeep$/,
			/^save-svg-as-png$/,
			/^@vninvestcharts\/widget-pro$/,
		],
		alias: engineAlias,
		esbuildPlugins: [mockPropTypesPlugin, engineAliasPlugin],
		globalName: "VNInvestChartsAdapters",
	},
	// Drawing subpath bundle. The implementation moved to the engine twin repo
	// (PLAN_DRAWING_SSOT_MIGRATION_2026-09-27); this entry re-exports it so the
	// published `vninvestcharts-widget/drawing` subpath keeps working.
	{
		// Named entry: the published `./drawing` subpath resolves to
		// dist/drawing/index.*, so the shim has to emit as index, not after its file.
		entry: { index: "src/drawing-shim.ts" },
		format: ["esm", "cjs", "umd"],
		dts: true,
		splitting: false,
		sourcemap,
		clean: false,
		treeshake: true,
		outDir: "dist/drawing",
		outExtension({ format }) {
			return { js: format === "cjs" ? ".cjs" : format === "umd" ? ".umd.js" : ".js" };
		},
		external: [
			/^react$/,
			/^react-dom$/,
			/^d3(-|$)/,
			/^prop-types$/,
			/^lodash\.flattendeep$/,
			/^save-svg-as-png$/,
			/^@vninvestcharts\/widget-pro$/,
		],
		alias: engineAlias,
		esbuildPlugins: [mockPropTypesPlugin, engineAliasPlugin],
		globalName: "VNInvestChartsDrawing",
	},
	// Types subpath bundle (with runtime exports)
	{
		entry: ["src/lib/types/runtime.ts"],
		format: ["esm", "cjs", "umd"],
		dts: true,
		splitting: false,
		sourcemap,
		clean: false,
		treeshake: true,
		outDir: "dist/types",
		outExtension({ format }) {
			return { js: format === "cjs" ? ".cjs" : format === "umd" ? ".umd.js" : ".js" };
		},
		external: [
			/^react$/,
			/^react-dom$/,
			/^d3(-|$)/,
			/^prop-types$/,
			/^lodash\.flattendeep$/,
			/^save-svg-as-png$/,
			/^@vninvestcharts\/widget-pro$/,
		],
		alias: engineAlias,
		esbuildPlugins: [mockPropTypesPlugin, engineAliasPlugin],
		globalName: "VNInvestChartsTypes",
	},
	// Host SDK ESM/CJS for iframe embedding (WP-11)
	{
		entry: ["src/widget/iframe/host-entry.ts"],
		format: ["esm", "cjs"],
		dts: true,
		splitting: false,
		sourcemap,
		clean: false,
		treeshake: true,
		outDir: "dist/iframe-host",
		outExtension({ format }) {
			return { js: format === "cjs" ? ".cjs" : ".js" };
		},
		external: [/^react$/, /^react-dom$/, /^@vninvestcharts\/widget-pro$/],
		alias: engineAlias,
		esbuildPlugins: [mockPropTypesPlugin, engineAliasPlugin],
		globalName: "VNInvestChartsHost",
	},
	// IIFE bundle for <script> tag embedding (WP-10)
	{
		entry: { "vninvestchart.iife": "src/widget/iife-entry.ts" },
		format: ["iife"],
		globalName: "VNInvestCharts",
		dts: false,
		splitting: false,
		sourcemap: true,
		clean: false,
		treeshake: true,
		outDir: "dist",
		outExtension() {
			return { js: ".js" };
		},
		external: [/^@vninvestcharts\/widget-pro$/], // Everything bundled EXCEPT the Pro module (dynamic import stays external, fail-closed without it)
		alias: engineAlias,
		esbuildPlugins: [mockPropTypesPlugin, engineAliasPlugin],
		minify: true,
		// E0-fix: standalone bundles run without node — React dev/prod
		// branching on process.env must resolve at build time, otherwise the
		// browser throws "process is not defined" on load.
		define: { "process.env.NODE_ENV": '"production"' },
		esbuildPlugins: [mockPropTypesPlugin, engineAliasPlugin],
		cssModules: {
			pattern: "[local]_[hash:base64:5]",
		},
	},
	// Iframe bundle for iframe embedding (WP-11)
	{
		entry: { "vninvestchart.iframe": "src/widget/iframe/iframeEntry.tsx" },
		format: ["iife"],
		globalName: "VNInvestChartsIframe",
		dts: false,
		splitting: false,
		sourcemap: true,
		clean: false,
		treeshake: true,
		outDir: "dist/iframe",
		outExtension() {
			return { js: ".js" };
		},
		external: [/^@vninvestcharts\/widget-pro$/], // Everything bundled EXCEPT the Pro module (dynamic import stays external, fail-closed without it)
		alias: engineAlias,
		esbuildPlugins: [mockPropTypesPlugin, engineAliasPlugin],
		minify: true,
		// E0-fix: same as IIFE — no `process` in the browser.
		define: { "process.env.NODE_ENV": '"production"' },
		esbuildPlugins: [mockPropTypesPlugin, engineAliasPlugin],
		cssModules: {
			pattern: "[local]_[hash:base64:5]",
		},
	},
]);