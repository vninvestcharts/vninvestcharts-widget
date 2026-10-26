/**
 * Open-core fallback stub for @vninvestcharts/widget-pro when building the demo
 * without the private Pro packages present.
 */
export const restorePineScripts = (_stored: unknown, _types: string[]): unknown[] => [];
export const register = (): void => {};
export default {
	restorePineScripts,
	register,
};
