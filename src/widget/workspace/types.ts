import { GridLayout } from '../grid/types';
import { DrawingData, SyncGroupState, SymbolLinkGroupId, VisibleRangePayload } from '@vninvestcharts/engine-react';

export interface WorkspaceData {
  id: string;
  name: string;
  layout: GridLayout;
  charts: {
    id: string;
    symbol: string;
    timeframe: string;
    visibleRange?: VisibleRangePayload;
    symbolLinkGroup?: SymbolLinkGroupId | null;
    // Engine-specific state (opaque to MultiCharts)
    engineState?: Record<string, unknown>;
  }[];
  drawings: DrawingData[];
  syncGroups: SyncGroupState[];
  activeChartId?: string | null;  // Track which chart was active
  createdAt: number;
  updatedAt: number;
  version: number;
}
