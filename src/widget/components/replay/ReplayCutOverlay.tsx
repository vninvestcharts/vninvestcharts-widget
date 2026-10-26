import type { EngineOverlayCrosshairSnapshot } from "@vninvestcharts/engine-core";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import styles from "./ReplayCutOverlay.module.css";

export interface ReplayCutOverlayProps {
	crosshair: EngineOverlayCrosshairSnapshot | null;
	plotData: ReadonlyArray<{ date?: Date | number | null }>;
}

function formatCutDate(locale: string, value: Date | number): string {
	const tag = locale === "en" ? "en-US" : "vi-VN";
	const date = value instanceof Date ? value : new Date(value);
	return new Intl.DateTimeFormat(tag, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function ReplayCutOverlay({ crosshair, plotData }: ReplayCutOverlayProps) {
	const { t, locale } = useWidgetI18n();
	if (!crosshair) return null;
	const datum = crosshair.dataIndex !== null && crosshair.dataIndex !== undefined ? plotData[crosshair.dataIndex] : undefined;
	const barDate = datum?.date ?? null;
	return (
		<div className={styles.cutLayer} data-testid="replay-cut-overlay" aria-hidden="true">
			<div className={styles.cutLine} style={{ transform: `translate3d(${crosshair.x}px, 0, 0)` }} />
			{barDate !== null && barDate !== undefined && (
				<div className={styles.cutBadge} style={{ transform: `translate3d(${crosshair.x}px, 0, 0)` }}>
					{t("replay.cutBadge", { date: formatCutDate(locale, barDate) })}
				</div>
			)}
		</div>
	);
}
