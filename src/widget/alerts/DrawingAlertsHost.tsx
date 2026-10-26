import { AlertNotificationToast } from "@vninvestcharts/engine-react";
import { useWidgetI18n } from "../context/WidgetI18nContext";
import { useDrawingAlerts } from "../alerts/useDrawingAlerts";
import type { DrawingObject } from "@vninvestcharts/engine-drawing";

/**
 * W1.1 — host render toast alert + badge "chỉ hoạt động khi tab mở".
 *
 * Đây là chỗ duy nhất trong widget gọi `AlertNotificationToast` (trước đó chỉ
 * được re-export ở `drawing-shim.ts`/`index.ts` nhưng không render ở đâu).
 */
export interface DrawingAlertsHostProps {
	/** Đã gate sẵn bởi `useTierGatedFeatures().allows("alert_drawing")`. */
	enabled: boolean;
	drawings: readonly DrawingObject[];
	plotData: readonly { close?: number | null }[];
	updateDrawing: (id: string, patch: Partial<DrawingObject>) => void;
	muted?: boolean;
}

export function DrawingAlertsHost({
	enabled,
	drawings,
	plotData,
	updateDrawing,
	muted = false,
}: DrawingAlertsHostProps) {
	const { t } = useWidgetI18n();
	const alerts = useDrawingAlerts({ enabled, drawings, plotData, updateDrawing, muted });

	if (!enabled || alerts.items.length === 0) return null;

	return (
		<>
			<div
				className="vnsc-alert-host"
				role="status"
				aria-live="polite"
				data-local-only={alerts.isLocalOnly ? "true" : "false"}
				title={alerts.isLocalOnly ? t("data.alertLocalOnly.body") : undefined}
			>
				{alerts.isLocalOnly ? (
					<span className="vnsc-alert-host__badge">{t("data.alertLocalOnly.badge")}</span>
				) : null}
				<AlertNotificationToast
					items={alerts.items}
					onDismiss={alerts.dismiss}
					audioEnabled={false}
				/>
			</div>
		</>
	);
}
