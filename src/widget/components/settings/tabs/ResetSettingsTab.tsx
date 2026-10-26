/**
 * Reset Settings Tab
 */
import React from "react";
import { useSettingsContext } from "../SettingsContext";
import { useWidgetI18n } from "../../../context/WidgetI18nContext";
import styles from "./settingsTabs.module.css";

export interface ResetSettingsTabProps {
	onReset?: () => void;
}

export function ResetSettingsTab(props: ResetSettingsTabProps) {
	const { onReset } = props;
	const { resetAll } = useSettingsContext();
	const { t } = useWidgetI18n();

	const handleReset = () => {
		resetAll();
		onReset?.();
	};

	return (
		<div className={styles.tabContainer}>
			<div className={styles.section}>
				<h4 className={styles.sectionTitle}>{t("settings.resetKicker") || "Reset Settings"}</h4>
				<div className={styles.row}>
					<div>
						<div style={{ fontSize: 13, fontWeight: 600, color: "var(--vnsc-text-primary, #f1f5f9)" }}>
							{t("settings.resetDefaults") || "Reset all chart settings"}
						</div>
						<div className={styles.subLabel}>
							{t("settings.resetNote") || "This will restore pane sizes, colors, and indicators to default."}
						</div>
					</div>
					<button
						type="button"
						className={styles.btnSm}
						style={{ color: "#ef5350", borderColor: "rgba(239, 83, 80, 0.4)", padding: "8px 16px" }}
						onClick={handleReset}
					>
						{t("settings.resetLayout") || "Reset to Default"}
					</button>
				</div>
			</div>
		</div>
	);
}
