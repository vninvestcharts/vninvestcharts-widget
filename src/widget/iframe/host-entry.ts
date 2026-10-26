/**
 * Host-only entry point for iframe embedding.
 *
 * This module intentionally excludes React and the iframe runtime bundle.
 * Website hosts import the postMessage Host SDK from `vninvestcharts-widget/iframe-host`.
 */
export { VNInvestChartsHostSDK, createVNInvestChartsHost, EmbedError } from "./hostSDK";
export { IframeBridge, createHostBridge, DEFAULT_ALLOWED_ORIGINS } from "./iframeBridge";
export type { HostSDKConfig, WidgetController } from "./hostSDK";
export type { AllowedOriginsConfig, BridgeConfig } from "./iframeBridge";
export type {
	AdapterConfig,
	HostToIframeCommand,
	IframeToHostEvent,
	ResponsePayload,
	WidgetConfig,
} from "./messageProtocol";
