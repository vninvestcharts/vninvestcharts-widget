import { describe, expect, it } from "vitest";

import { evaluateRuntimePolicy, resolveRequestedRuntime, shouldForceLegacyRuntime } from "./runtimePolicy";

describe("widget runtime policy", () => {
	it("returns deterministic reason codes for explicit runtime requests", () => {
		expect(evaluateRuntimePolicy({})).toEqual({
			resolvedRuntime: "fork",
			reasonCode: "DEFAULT_FORK_RUNTIME",
		});
		expect(evaluateRuntimePolicy({ engineRuntime: "fork" })).toEqual({
			resolvedRuntime: "fork",
			reasonCode: "EXPLICIT_FORK_REQUEST",
		});
	});

	it("keeps explicit runtime requests unchanged", () => {
		expect(resolveRequestedRuntime({ engineRuntime: "fork", drawingUiEnabled: true })).toBe("fork");
		expect(resolveRequestedRuntime({ drawingUiEnabled: true })).toBe("fork");
	});

	it("routes auto to fork for every drawing surface", () => {
		expect(resolveRequestedRuntime({
			engineRuntime: "auto",
			drawingUiEnabled: true,
			drawingActiveTool: "trendLine",
		})).toBe("fork");
		expect(resolveRequestedRuntime({
			engineRuntime: "auto",
			drawingUiEnabled: true,
			drawingActiveTool: "hLine",
		})).toBe("fork");
		expect(resolveRequestedRuntime({
			engineRuntime: "auto",
			drawingUiEnabled: true,
			drawingActiveTool: "vLine",
		})).toBe("fork");
		expect(resolveRequestedRuntime({
			engineRuntime: "auto",
			drawingUiEnabled: true,
			drawingActiveTool: "arrow",
		})).toBe("fork");
		expect(resolveRequestedRuntime({
			engineRuntime: "auto",
			drawingUiEnabled: true,
			drawingActiveTool: "text",
		})).toBe("fork");
		expect(resolveRequestedRuntime({
			engineRuntime: "auto",
			drawingUiEnabled: true,
			drawingActiveTool: "priceLabel",
		})).toBe("fork");
		expect(resolveRequestedRuntime({
			engineRuntime: "auto",
			drawingUiEnabled: true,
			drawingActiveTool: "callout",
		})).toBe("fork");
		expect(resolveRequestedRuntime({
			engineRuntime: "auto",
			drawingUiEnabled: true,
			drawingActiveTool: "rectangle",
		})).toBe("fork");
		expect(resolveRequestedRuntime({
			engineRuntime: "auto",
			drawingUiEnabled: true,
			drawingActiveTool: "circle",
		})).toBe("fork");
		expect(resolveRequestedRuntime({
			engineRuntime: "auto",
			drawingUiEnabled: true,
			drawingActiveTool: "ellipse",
		})).toBe("fork");
		expect(resolveRequestedRuntime({
			engineRuntime: "auto",
			drawingUiEnabled: true,
			drawingActiveTool: "cursor",
			selectedDrawingType: "rectangle",
		})).toBe("fork");
		expect(resolveRequestedRuntime({
			engineRuntime: "auto",
			drawingUiEnabled: true,
			drawingActiveTool: "unregisteredTool",
		})).toBe("fork");
		expect(resolveRequestedRuntime({ engineRuntime: "auto", drawingUiEnabled: true })).toBe("fork");
		expect(resolveRequestedRuntime({ engineRuntime: "auto", drawingUiEnabled: false })).toBe("fork");
		expect(resolveRequestedRuntime({ engineRuntime: "auto" })).toBe("fork");
	});

	it("shouldForceLegacyRuntime is always false since the lane was removed (G4)", () => {
		// Was "reports the forced-legacy predicate from drawing support". That predicate
		// no longer depends on the drawing surface at all, so the name was describing
		// behaviour that had been deleted. Kept as an explicit always-false pin so a
		// future reintroduction of the lane has to change this test on purpose.
		expect(shouldForceLegacyRuntime({ drawingUiEnabled: true, drawingActiveTool: "trendLine" })).toBe(false);
		expect(shouldForceLegacyRuntime({ drawingUiEnabled: true, drawingActiveTool: "hLine" })).toBe(false);
		expect(shouldForceLegacyRuntime({ drawingUiEnabled: true, drawingActiveTool: "vLine" })).toBe(false);
		expect(shouldForceLegacyRuntime({ drawingUiEnabled: true, drawingActiveTool: "arrow" })).toBe(false);
		expect(shouldForceLegacyRuntime({ drawingUiEnabled: true, drawingActiveTool: "text" })).toBe(false);
		expect(shouldForceLegacyRuntime({ drawingUiEnabled: true, drawingActiveTool: "priceLabel" })).toBe(false);
		expect(shouldForceLegacyRuntime({ drawingUiEnabled: true, drawingActiveTool: "callout" })).toBe(false);
		expect(shouldForceLegacyRuntime({ drawingUiEnabled: true, drawingActiveTool: "rectangle" })).toBe(false);
		expect(shouldForceLegacyRuntime({ drawingUiEnabled: true, drawingActiveTool: "circle" })).toBe(false);
		expect(shouldForceLegacyRuntime({ drawingUiEnabled: true, drawingActiveTool: "ellipse" })).toBe(false);
		expect(shouldForceLegacyRuntime({ drawingUiEnabled: true, drawingActiveTool: "cursor", selectedDrawingType: "rectangle" })).toBe(false);
		expect(shouldForceLegacyRuntime({ drawingUiEnabled: true, drawingActiveTool: "unregisteredTool" })).toBe(false);
		expect(shouldForceLegacyRuntime({ drawingUiEnabled: true })).toBe(false);
		expect(shouldForceLegacyRuntime({ drawingUiEnabled: false })).toBe(false);
		expect(shouldForceLegacyRuntime({})).toBe(false);
	});

	describe("evaluateRuntimePolicy details", () => {
		it("M2-T02 & M2-T03: evaluates authoring lane with precise reason codes", () => {
			// L5: "auto" is a fork alias — every tool resolves fork/AUTO_DEFAULT.
			// Supported authoring tool
			expect(evaluateRuntimePolicy({
				engineRuntime: "auto",
				drawingUiEnabled: true,
				drawingActiveTool: "trendLine",
			})).toEqual({
				resolvedRuntime: "fork",
				reasonCode: "AUTO_DEFAULT_FORK_RUNTIME",
			});

			// Supported active tool (pitchfork)
			expect(evaluateRuntimePolicy({
				engineRuntime: "auto",
				drawingUiEnabled: true,
				drawingActiveTool: "pitchfork",
			})).toEqual({
				resolvedRuntime: "fork",
				reasonCode: "AUTO_DEFAULT_FORK_RUNTIME",
			});

			// Unregistered active tool (no longer falls back — fork alias)
			expect(evaluateRuntimePolicy({
				engineRuntime: "auto",
				drawingUiEnabled: true,
				drawingActiveTool: "unknownSuperTool",
			})).toEqual({
				resolvedRuntime: "fork",
				reasonCode: "AUTO_DEFAULT_FORK_RUNTIME",
			});
		});

		it("M2-T02 & M2-T04: evaluates manipulation lane with precise reason codes", () => {
			// L5: "auto" is a fork alias — every selection resolves fork/AUTO_DEFAULT.
			// Cursor mode with supported selected drawing
			expect(evaluateRuntimePolicy({
				engineRuntime: "auto",
				drawingUiEnabled: true,
				drawingActiveTool: "cursor",
				selectedDrawingType: "rectangle",
			})).toEqual({
				resolvedRuntime: "fork",
				reasonCode: "AUTO_DEFAULT_FORK_RUNTIME",
			});

			// Cursor mode with supported selected drawing (pitchfork)
			expect(evaluateRuntimePolicy({
				engineRuntime: "auto",
				drawingUiEnabled: true,
				drawingActiveTool: "cursor",
				selectedDrawingType: "pitchfork",
			})).toEqual({
				resolvedRuntime: "fork",
				reasonCode: "AUTO_DEFAULT_FORK_RUNTIME",
			});

			// Cursor mode with unregistered selected drawing (no fallback)
			expect(evaluateRuntimePolicy({
				engineRuntime: "auto",
				drawingUiEnabled: true,
				drawingActiveTool: "cursor",
				selectedDrawingType: "mythicalDrawingShape",
			})).toEqual({
				resolvedRuntime: "fork",
				reasonCode: "AUTO_DEFAULT_FORK_RUNTIME",
			});

			// Cursor mode with nothing selected
			expect(evaluateRuntimePolicy({
				engineRuntime: "auto",
				drawingUiEnabled: true,
				drawingActiveTool: "cursor",
				selectedDrawingType: null,
			})).toEqual({
				resolvedRuntime: "fork",
				reasonCode: "AUTO_DEFAULT_FORK_RUNTIME",
			});
		});

		it("M2-T02 & M2-T05: evaluates unsupported and disabled UI fallback lanes", () => {
			// L5: drawingUiEnabled no longer gates (fork alias) — kept resolving fork.
			// Drawing UI disabled
			expect(evaluateRuntimePolicy({
				engineRuntime: "auto",
				drawingUiEnabled: false,
				drawingActiveTool: "trendLine",
			})).toEqual({
				resolvedRuntime: "fork",
				reasonCode: "AUTO_DEFAULT_FORK_RUNTIME",
			});

			// No active tool specified (fallback to legacy)
			expect(evaluateRuntimePolicy({
				engineRuntime: "auto",
				drawingUiEnabled: true,
			})).toEqual({
				resolvedRuntime: "fork",
				reasonCode: "AUTO_DEFAULT_FORK_RUNTIME",
			});
		});
	});

	describe("L0 baseline: default vs auto tool lanes", () => {
		it("undefined engineRuntime always forks regardless of tool (no flip)", () => {
			for (const tool of ["arc", "anchoredVwap", "eraser", "trendLine", "cursor"]) {
				expect(evaluateRuntimePolicy({ drawingUiEnabled: true, drawingActiveTool: tool }))
					.toEqual({ resolvedRuntime: "fork", reasonCode: "DEFAULT_FORK_RUNTIME" });
			}
		});

		it("L1: auto + cursor-select on 7 capable authoringBeta tools stays fork (D-R01)", () => {
			for (const tool of ["arc", "anchoredVwap", "iconMarker", "ghostFeed", "barsPattern", "crossLine", "datePriceRange"]) {
				expect(evaluateRuntimePolicy({
					engineRuntime: "auto",
					drawingUiEnabled: true,
					drawingActiveTool: "cursor",
					selectedDrawingType: tool,
				})).toEqual({
					resolvedRuntime: "fork",
					reasonCode: "AUTO_DEFAULT_FORK_RUNTIME",
				});
			}
		});

		it("L5: auto + eraser manipulation resolves fork (alias, no fallback)", () => {
			expect(evaluateRuntimePolicy({
				engineRuntime: "auto",
				drawingUiEnabled: true,
				drawingActiveTool: "cursor",
				selectedDrawingType: "eraser",
			})).toEqual({
				resolvedRuntime: "fork",
				reasonCode: "AUTO_DEFAULT_FORK_RUNTIME",
			});
		});
	});
});