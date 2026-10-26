// Phase 0.4 (2026-09-27): this file used to alias
// @vninvestcharts/engine-core -> ../packages/vn-kline-engine-core/dist/index.d.ts.
// There is no `packages/` directory in the widget repo (the engine lives in the
// twin repo vninvestcharts-engine) and aliasing a .d.ts as a runtime module is
// invalid anyway. The package is a real dependency and resolves from
// node_modules, so the viteFinal/alias override was removed.
const config = {
	stories: ["../stories/**/*.stories.@(js|jsx|ts|tsx|mdx)"],
	framework: {
		name: "@storybook/react-vite",
		options: {},
	},
	typescript: {
		reactDocgen: false,
	},
};

export default config;
