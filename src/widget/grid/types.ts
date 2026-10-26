import { SymbolLinkGroupId } from '@vninvestcharts/engine-react';

export interface SlotConfig {
  id: string; // Unique ID for each chart slot (e.g. 'chart-1', 'chart-2')
  rowStart: number; // 1-indexed start row
  rowEnd: number;   // 1-indexed end row
  colStart: number; // 1-indexed start column
  colEnd: number;   // 1-indexed end column
  symbol?: string;
  timeframe?: string;
  symbolLinkGroup?: SymbolLinkGroupId | null;

  // Asymmetric layout support
  areaName?: string; // Named grid area for grid-template-areas
  zIndex?: number;   // Z-index for overlapping areas
}

export interface GridLayout {
  rows: number;
  cols: number;
  slots: SlotConfig[];
  rowSizes: string[]; // e.g., ['1fr', '1fr'] or ['300px', '400px']
  colSizes: string[]; // e.g., ['1fr', '1fr']

  // Asymmetric layout support
  templateAreas?: string[]; // CSS grid-template-areas rows
  areas?: Record<string, SlotConfig>; // Named area configurations
}

export interface SplitterConfig {
  id: string;
  orientation: 'vertical' | 'horizontal';
  gridIndex: number; // Index of the row or col after which the splitter is placed (1-indexed)
  minSizeBeforePx: number; // Minimum size for preceding slot
  minSizeAfterPx: number;  // Minimum size for succeeding slot
}

// Layout preset for asymmetric layouts
export interface LayoutPreset {
  id: string;
  name: string;
  nameKey?: string; // i18n key for name
  layout: GridLayout;
  description?: string;
  descriptionKey?: string; // i18n key for description
  thumbnail?: string; // Optional thumbnail URL
  category?: 'symmetric' | 'asymmetric' | 'focus' | 'custom';
}
