import { useWidgetI18n } from "../../context/WidgetI18nContext";
import { IconLock, IconMoreVertical } from "../common/Icons";

/**
 * D6: slim 40px rail shown to free tier instead of the dock.
 * Mirrors the real dock strip (same width/bg/border) + the drawing toolbar
 * handle grip (vertical dots) for left/right symmetry. The lock badge keeps
 * the Pro-gated meaning; the tooltip explains. The dock chunk is never
 * fetched in this path (see resolveDockAccess).
 */
export function DockUpgradeNudge({ onUpgradeClick }: { onUpgradeClick?: () => void }) {
	const { t } = useWidgetI18n();
	const label = t("dock.upgrade");
	return (
		<button
			type="button"
			data-testid="dock-upgrade-nudge"
			onClick={onUpgradeClick}
			title={label}
			aria-label={label}
			style={{
				width: 40,
				alignSelf: "stretch",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap: 10,
				background: "var(--vnsc-bg-primary, #131722)",
				border: "none",
				borderLeft: "1px solid var(--vnsc-border-divider, #2a2a2a)",
				color: "var(--vnsc-text-secondary, #787b86)",
				cursor: onUpgradeClick ? "pointer" : "default",
			}}
		>
			<IconMoreVertical size={16} />
			<IconLock size={11} />
		</button>
	);
}
