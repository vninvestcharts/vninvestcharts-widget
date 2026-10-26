import { describe, expect, it } from "vitest";
import { getPineScriptAdapter, hasPineScriptAdapter, setPineScriptAdapter } from "./adapter";

describe("pinescript adapter registry", () => {
	it("starts empty (Pro module not loaded)", () => {
		expect(hasPineScriptAdapter()).toBe(false);
		expect(getPineScriptAdapter()).toBeNull();
	});

	it("registers and reads back", () => {
		const fake = {
			compile: () => ({ ast: null, errors: [] }),
			runStrategy: () => ({ errors: [] }),
			isStrategySource: () => false,
			registerPineScript: () => null,
			getPinePlugin: () => null,
			restorePineScripts: () => [],
			registerPinePlugin: () => undefined,
			pineMonacoVSPath: () => "",
			installMonacoEnvironment: () => undefined,
			VnScriptLanguage: {},
			createWorker: () => ({}) as unknown as Worker,
		};
		setPineScriptAdapter(fake);
		expect(hasPineScriptAdapter()).toBe(true);
		expect(getPineScriptAdapter()).toBe(fake);
		setPineScriptAdapter(null as unknown as typeof fake);
		expect(hasPineScriptAdapter()).toBe(false);
	});
});
