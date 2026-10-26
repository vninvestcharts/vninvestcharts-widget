import type { DemoRuntimeLane } from "./demoSettings";
import { resolveRequestedRuntime } from "../widget/runtimePolicy";

export interface DemoRuntimePolicyInput {
	runtimeLane: DemoRuntimeLane;
	activeTool: string;
	drawingCount: number;
	drawingDockRequested?: boolean;
	selectedDrawingType?: string | null;
}

export interface DemoRuntimePolicy {
	/** G4: only fork remains, so this is no longer a union. */
	predictedRuntime: "fork";
	drawingUiEnabled: boolean;
}

function isDrawingIntentActive(activeTool: string) {
	return activeTool !== "cursor" && activeTool !== "crosshair";
}

export function resolveDemoRuntimePolicy(input: DemoRuntimePolicyInput): DemoRuntimePolicy {
	if (input.runtimeLane === "fork") {
		return {
			predictedRuntime: "fork",
			drawingUiEnabled: true,
		};
	}

	const drawingRuntimeRequested = isDrawingIntentActive(input.activeTool)
		|| input.drawingDockRequested === true
		|| typeof input.selectedDrawingType === "string";
	const drawingUiEnabled = drawingRuntimeRequested;

	return {
		predictedRuntime: resolveRequestedRuntime({
			engineRuntime: input.runtimeLane,
			drawingUiEnabled,
			drawingActiveTool: input.activeTool,
			selectedDrawingType: input.selectedDrawingType,
		}),
		drawingUiEnabled,
	};
}