import { type PaneDescriptor, type ChartTheme } from "../../lib/core";
import type { DrawingObject } from "@vninvestcharts/engine-drawing";

export interface WorkspaceSettings {
	theme?: ChartTheme;
	timezone?: string;
	timeframe?: string;
	symbol?: string;
	maxVisiblePanes?: number;
	maxVisibleBars?: number;
	showNonTradingDays?: boolean;
	showDrawingPriceMarkers?: boolean;
	enableWhale?: boolean;
	whaleThreshold?: number;
	enableCVD?: boolean;
	cvdMode?: "oscillator" | "histogram";
	alertAudioEnabled?: boolean;
	overlayTimeframe?: string;
	overlayStyle?: "hollow" | "step" | "area" | "candle";
}

export interface WorkspaceSchema {
	version: number;
	timestamp: number;
	panes: readonly PaneDescriptor[];
	drawings: readonly DrawingObject[];
	settings: WorkspaceSettings;
}

export class WorkspaceSerializer {
	private static CURRENT_VERSION = 1;

	static serialize(
		panes: readonly PaneDescriptor[],
		drawings: readonly DrawingObject[],
		settings: WorkspaceSettings
	): string {
		const workspace: WorkspaceSchema = {
			version: this.CURRENT_VERSION,
			timestamp: Date.now(),
			panes,
			drawings,
			settings,
		};
		return JSON.stringify(workspace, null, 2);
	}

	static deserialize(jsonString: string): WorkspaceSchema | null {
		try {
			if (!jsonString) return null;
			const parsed = JSON.parse(jsonString);

			if (typeof parsed !== "object" || parsed === null) {
				return null;
			}

			// Validate schema version
			if (typeof parsed.version !== "number" || parsed.version > this.CURRENT_VERSION) {
				console.warn(`Unsupported workspace schema version: ${parsed.version}`);
				return null;
			}

			// Validate essential arrays
			if (!Array.isArray(parsed.panes)) {
				parsed.panes = [];
			}
			if (!Array.isArray(parsed.drawings)) {
				parsed.drawings = [];
			}
			if (typeof parsed.settings !== "object" || parsed.settings === null) {
				parsed.settings = {};
			}

			return parsed as WorkspaceSchema;
		} catch (err) {
			console.warn("Failed to deserialize workspace JSON:", err);
			return null;
		}
	}
}
