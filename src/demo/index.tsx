import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import MultiChartsShowcaseDemo from "./MultiChartsShowcaseDemo";
import StandaloneEmbedDemo from "./StandaloneEmbedDemo";
import TierProviderHarnessDemo from "./TierProviderHarnessDemo";
import { DemoI18nProvider } from "./i18n";
import { maybeInstallDemoLicense } from "./demoLicense";

/** Injected by webpack DefinePlugin from the `VNI_API_BASE` env var at build time. */
declare const VNI_API_BASE: string | undefined;

// DEMO-MODE (2026-10-17): cài license pro demo TRƯỚC khi mount để mọi khách truy
// cập test được toàn bộ chức năng. Blob chỉ tồn tại khi build demo có env
// VNI_DEMO_LICENSE; mọi build khác là no-op. Xem src/demo/demoLicense.ts.
maybeInstallDemoLicense();

// PAT key + API base for VNInvest API.
// SECURITY: never hardcode a real PAT token in source. Supply it at runtime
// (e.g. via env injection or window.__VNI_PAT_TOKEN__) before mounting.
// NOTE: Default PAT disabled for free tier testing.
//
// API base resolution, in order:
//   1. runtime override  window.__VNI_API_BASE__ (set by the host page)
//   2. build-time value  VNI_API_BASE, injected by webpack DefinePlugin from the
//      VNI_API_BASE env var at build time. This is how the charts-test deployment
//      points at the configured API base without a hardcoded hostname.
//   3. browser origin   — right for a reverse-proxied deployment where the API
//      is served on the same host.
//
// The old default was the hardcoded "http://localhost:8080" for every non-dev
// host. Measured consequence: on a REMOTE deployment that resolves to the
// *visitor's* own machine, so every core API call failed. Behind this app's CSP
// it also required whitelisting a localhost origin that no deployed nginx serves.
if (typeof globalThis !== "undefined") {
	(globalThis as any).__VNI_PAT_TOKEN__ = (globalThis as any).__VNI_PAT_TOKEN__ || "";
	const isDevServer =
		typeof location !== "undefined" &&
		(location.hostname === "localhost" ||
			location.hostname === "127.0.0.1" ||
			location.port === "3000");
	if (!isDevServer) {
		const buildTime = typeof VNI_API_BASE === "string" ? VNI_API_BASE : "";
		const origin = typeof location !== "undefined" ? location.origin : "";
		(globalThis as any).__VNI_API_BASE__ = buildTime || origin;
	}
}

const container = document.getElementById("root");
if (container) {
	const root = createRoot(container);

	// Check if '?standalone=true' or '?standalone=1' is in the URL query string
	const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
	const isStandalone = params.get("standalone") === "true" || params.get("standalone") === "1";
	// UIUX_AC_RUNTIME_2026-10-21 (A5/RD-09): harness multi KHÔNG wrap `SaaSFeatureProvider`
	// ⇒ đo được tier cap (không bị demo mask). Surface ADDITIVE, demo cũ không đổi.
	const isTierHarness = params.get("noprovider") === "1";

	root.render(
		<StrictMode>
			<DemoI18nProvider>
				{isTierHarness ? (
					<TierProviderHarnessDemo />
				) : isStandalone ? (
					<StandaloneEmbedDemo />
				) : (
					<MultiChartsShowcaseDemo />
				)}
			</DemoI18nProvider>
		</StrictMode>
	);
}
