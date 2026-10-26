/**
 * S4: fallback banner for unclassified symbols (Q3 decision).
 * Shown when the symbol falls back to VN_SPOT rules without looking like a
 * VN ticker. Dismiss lasts the session; "Open Settings" jumps to config.
 */
import { useState } from "react";
import { useWidgetI18n } from "../../context/WidgetI18nContext";
import { IconX } from "../../components/common/Icons";
import { isUnclassifiedMarketSymbol } from "../../../lib/core/trading/MarketRules";

export function MarketFallbackBanner({
	symbol,
	onOpenSettings,
}: {
	symbol: string | null | undefined;
	onOpenSettings: () => void;
}) {
	const { t } = useWidgetI18n();
	const [dismissed, setDismissed] = useState(false);
	if (!symbol || dismissed || !isUnclassifiedMarketSymbol(symbol)) return null;
	return (
		<div data-testid="market-fallback-banner" role="status">
			<span>{t("widget.trading.unknownMarket")}</span>
			<button type="button" data-testid="market-fallback-settings" onClick={onOpenSettings}>
				{t("widget.trading.openSettings")}
			</button>
			<button
				type="button"
				data-testid="market-fallback-dismiss"
				aria-label={t("widget.trading.cancel", { defaultValue: "Cancel" })}
				onClick={() => setDismissed(true)}
			>
				<IconX size={10} />
			</button>
		</div>
	);
}
