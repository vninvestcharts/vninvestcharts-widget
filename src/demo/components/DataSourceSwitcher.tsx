/**
 * OB-M03 — DataSourceSwitcher
 * Toggle Binance Online ↔ Offline ↔ VNInvest data source.
 */
import { useDemoI18n } from "../i18n";

export type ActiveSource = "binance" | "offline" | "vninvest";

export interface DataSourceSwitcherProps {
	activeSource: ActiveSource;
	onSwitch: (source: ActiveSource) => void;
}

export function DataSourceSwitcher({ activeSource, onSwitch }: DataSourceSwitcherProps) {
	const { t } = useDemoI18n();

	const sources: { id: ActiveSource; label: string }[] = [
		{ id: "binance", label: t("dataSource.binanceOnline") },
		{ id: "offline", label: t("dataSource.binanceOffline") },
		{ id: "vninvest", label: t("dataSource.vninvest") },
	];

	return (
		<div className="gc-datasource-switcher" role="group" aria-label={t("dataSource.label")}>
			{sources.map(({ id, label }) => (
				<button
					key={id}
					className={`gc-datasource-btn${activeSource === id ? " gc-datasource-btn--active" : ""}`}
					onClick={() => onSwitch(id)}
					aria-pressed={activeSource === id}
					type="button"
				>
					{label}
				</button>
			))}
		</div>
	);
}
