import { DrawingContextMenu, type DrawingContextMenuItem } from "@vninvestcharts/engine-react";
import type { PriceScaleMode } from "@vninvestcharts/engine-core";

export interface PriceScaleMenuState {
	/** Menu anchor in chart-local px. */
	x: number;
	y: number;
	paneId: string;
	scaleSlotId: string;
	/** Current slot mode (for the active checkmark). */
	mode: PriceScaleMode;
	/** False when the slot domain is non-positive (log unavailable). */
	logAvailable: boolean;
	/**
	 * CHART_CLAMP: viewport-space right/bottom of the owning chart surface
	 * (same space as x/y). Keeps the menu inside its own chart in multi-grid.
	 */
	flipRight?: number;
	flipBottom?: number;
}

export interface PriceScaleMenuProps {
	menu: PriceScaleMenuState | null;
	isDark?: boolean;
	t: (key: string) => string;
	onSelectMode: (mode: PriceScaleMode) => void;
	onResetZoom: () => void;
	onClose: () => void;
}

export function PriceScaleMenu({ menu, isDark, t, onSelectMode, onResetZoom, onClose }: PriceScaleMenuProps) {
	if (!menu) return null;
	const modes: { value: PriceScaleMode; labelKey: string; disabled?: boolean }[] = [
		{ value: "linear", labelKey: "priceScale.auto" },
		{ value: "log", labelKey: "priceScale.log", disabled: !menu.logAvailable },
		{ value: "percent", labelKey: "priceScale.percent" },
	];
	const items: DrawingContextMenuItem[] = [
		...modes.map((mode) => ({
			key: `scale-${mode.value}`,
			label: t(mode.labelKey),
			onSelect: () => onSelectMode(mode.value),
			disabled: mode.disabled,
			// MENU_STANDARD: persistent selected tint (no "✓" text prefix).
			selected: menu.mode === mode.value,
		})),
		{ key: "sep", label: "", onSelect: () => {}, type: "separator" },
		{
			key: "reset-zoom",
			label: t("priceScale.resetZoom"),
			onSelect: onResetZoom,
		},
	];
	return (
		<DrawingContextMenu
			ariaLabel={t("priceScale.menuTitle")}
			title={t("priceScale.menuTitle")}
			isDark={isDark}
			position={{ x: menu.x, y: menu.y }}
			// openMenuAt stores viewport clientX/Y — pin to the viewport so
			// dock margins, grid offsets, sidebars and scroll can't shift it.
			positionSpace="viewport"
			// CHART_CLAMP: never bleed into a neighbor cell (it paints above).
			flipBounds={
				menu.flipRight != null || menu.flipBottom != null
					? { right: menu.flipRight, bottom: menu.flipBottom }
					: undefined
			}
			onClose={onClose}
			items={items}
		/>
	);
}
