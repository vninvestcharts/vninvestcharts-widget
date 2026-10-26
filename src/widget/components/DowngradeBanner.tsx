import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePortalRoot, useShadowRoot } from "../context/VNInvestChartsContext";

export interface DowngradeBannerProps {
	open: boolean;
	upgradeUrl?: string;
	onDismiss: () => void;
	onUpgrade: () => void;
}

export function DowngradeBanner({ open, upgradeUrl, onDismiss, onUpgrade, portalRoot: portalRootProp }: DowngradeBannerProps & { portalRoot?: HTMLElement | null }) {
	const contextPortalRoot = usePortalRoot();
	const shadowRoot = useShadowRoot();
	const resolvedPortalRoot = portalRootProp ?? contextPortalRoot;
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		if (open) {
			setVisible(true);
		} else {
			const timer = setTimeout(() => setVisible(false), 300);
			return () => clearTimeout(timer);
		}
	}, [open]);

	if (!visible) return null;

	const banner = (
		<div
			style={{
				position: "fixed",
				bottom: 24,
				left: "50%",
				transform: open ? "translateX(-50%)" : "translateX(-50%) translateY(20px)",
				opacity: open ? 1 : 0,
				transition: "opacity 0.3s, transform 0.3s",
				zIndex: 2147483000,
				display: "flex",
				alignItems: "center",
				gap: 12,
				padding: "10px 20px",
				borderRadius: 10,
				background: "var(--vni-bg-warning, #7c3aed)",
				color: "#fff",
				fontSize: 13,
				boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
				pointerEvents: "auto",
			}}
			role="alert"
		>
			<span>
				Premium drawings temporarily hidden due to tier change.{" "}
				{upgradeUrl && (
					<a
						href={upgradeUrl}
						target="_blank"
						rel="noopener noreferrer"
						style={{ color: "#fcd34d", fontWeight: 600, textDecoration: "underline", cursor: "pointer" }}
						onClick={onUpgrade}
					>
						Upgrade to Pro
					</a>
				)}
			</span>
			<button
				onClick={onDismiss}
				style={{
					background: "rgba(255,255,255,0.15)",
					border: "none",
					borderRadius: 6,
					color: "#fff",
					padding: "4px 10px",
					fontSize: 12,
					cursor: "pointer",
					whiteSpace: "nowrap",
				}}
			>
				Dismiss
			</button>
		</div>
	);

	if (typeof document === "undefined") return null;
	const target = resolvedPortalRoot ?? (shadowRoot as unknown as Element) ?? document.body;
	return createPortal(banner, target);
}
