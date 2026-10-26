/**
 * Licensing Settings Tab
 */
import React, { useState, useContext } from "react";
import { SaaSFeatureContext } from "../../../contexts/SaaSFeatureContext";
import { useWidgetI18n } from "../../../context/WidgetI18nContext";
import { useLicenseDiagnostics } from "../../../hooks/useLicenseDiagnostics";
import { parseLicenseKey, verifyLicenseKey } from "@vninvestcharts/engine-core";
import { writeLicenseKey, clearLicenseKey, readLicenseKey } from "../../../../lib/credentials/credentialStore";
import styles from "./settingsTabs.module.css";

type FeedbackKind = "ok" | "warn" | "error";

export function LicensingSettingsTab() {
	const saasContext = useContext(SaaSFeatureContext);
	const { t } = useWidgetI18n();

	const [inputPat, setInputPat] = useState("");
	const [inputLicense, setInputLicense] = useState(() => readLicenseKey());
	const [revealLicense, setRevealLicense] = useState(false);
	const [feedbackMessage, setFeedbackMessage] = useState("");
	const [feedbackKind, setFeedbackKind] = useState<FeedbackKind>("ok");
	const diagnostics = useLicenseDiagnostics();

	if (!saasContext) return null;

	const {
		isLoading,
		tenantMetadata,
		error: saasError,
		userPat: currentSavedPat,
		setUserPat: updateSavedPat,
		degradedReason,
		serverRejectReason,
	} = saasContext;

	const flashFeedback = (message: string, kind: FeedbackKind) => {
		setFeedbackMessage(message);
		setFeedbackKind(kind);
		setTimeout(() => setFeedbackMessage(""), 6000);
	};

	// LIC-UX: báo kết quả THẬT thay vì success giả — key legacy (server xác thực),
	// key ký số vni1.* (verify offline ngay), key hỏng (báo đỏ).
	// CS-6: two visible fields, one per channel. This one owns the PAT slot only;
	// a `vni1.*` blob is refused here with guidance toward the license field above.
	// (The old single field routed by sniffing; splitting removes the mental-model
	// error where pasting destroyed a license.)
	const handleSavePat = async () => {
		const raw = inputPat.trim();
		if (parseLicenseKey(raw)) {
			flashFeedback(t("licensing.offlineInvalid") || "Invalid or expired signed key.", "error");
			return;
		}
		// CS-1: setUserPat returns false when the credential was REFUSED and nothing was
		// persisted. Reporting success there is what made a user believe a key was
		// stored when it was not.
		if (!updateSavedPat(raw)) {
			flashFeedback(t("licensing.notSaved") || "Key not saved.", "error");
			return;
		}
		flashFeedback(t("licensing.legacySaved") || "Key saved (legacy format).", "warn");
	};

	const handleClearPat = () => {
		setInputPat("");
		updateSavedPat("");
		setFeedbackMessage(t("licensing.successClear") || "Default configuration restored.");
		setTimeout(() => setFeedbackMessage(""), 4000);
	};

	// CS-6: the license field owns the LICENSE slot only. It verifies immediately
	// so feedback is about THIS save, not ambient state.
	// CS-6 audit: verify BEFORE writing. The first version wrote the blob and
	// then verified, so an invalid key stayed persisted with only an error toast
	// to show for it — the slot and the message disagreed.
	const handleSaveLicense = async () => {
		const raw = inputLicense.trim();
		if (!parseLicenseKey(raw)) {
			flashFeedback(t("licensing.offlineInvalid") || "Invalid or expired signed key.", "error");
			return;
		}
		try {
			const verified = await verifyLicenseKey(raw, {
				host: typeof window !== "undefined" ? window.location.hostname : undefined,
			});
			if (!verified) {
				flashFeedback(t("licensing.offlineInvalid") || "Invalid or expired signed key.", "error");
				return;
			}
			writeLicenseKey(raw);
			setRevealLicense(false);
			flashFeedback(t("licensing.licenseSaved") || "License key saved (offline).", "ok");
		} catch {
			flashFeedback(t("licensing.offlineInvalid") || "Invalid or expired signed key.", "error");
		}
	};

	const handleClearLicense = () => {
		setInputLicense("");
		setRevealLicense(false);
		clearLicenseKey();
		flashFeedback(t("licensing.licenseCleared") || "Offline license key removed.", "ok");
	};

	const planLabel = tenantMetadata?.plan ? tenantMetadata.plan.toUpperCase() : "FREE";
	const statusText =
		tenantMetadata?.status === "active"
			? t("licensing.statusActive") || "Active"
			: tenantMetadata?.status === "suspended"
				? t("licensing.statusSuspended") || "Suspended"
				: t("licensing.statusExpired") || "Expired / Invalid";

	const statusColor = tenantMetadata?.status === "active" ? "#10b981" : "#ef4444";

	// SEC (2026-10-18): the stored key used to render plaintext in a prefilled
	// text input, so every screenshot/screen-share leaked the whole blob and the
	// serial. Mask by default (password dots), reveal only on explicit user action,
	// and never print the full serial.
	const storedLicense = readLicenseKey();
	const serial = storedLicense ? parseLicenseKey(storedLicense)?.payload.s : undefined;
	const licenseIsStored = storedLicense.length > 0 && inputLicense.trim() === storedLicense;
	const licenseMasked = licenseIsStored && !revealLicense;
	const maskSerial = (value: string) =>
		value.length <= 10 ? `${value.slice(0, 2)}…${value.slice(-2)}` : `${value.slice(0, 6)}…${value.slice(-4)}`;

	return (
		<div className={styles.tabContainer}>
			<div className={styles.section}>
				<h4 className={styles.sectionTitle}>{t("licensing.title") || "Licensing & API Key"}</h4>
				<div className={styles.subLabel}>
					{t("licensing.desc") || "Enter Personal Access Token (PAT) to activate premium charting features."}
				</div>

				<div className={styles.card} style={{ marginTop: 10 }}>
					<div className={styles.row}>
						<span style={{ fontSize: 12, color: "var(--vnsc-text-secondary, #94a3b8)" }}>
							{t("licensing.status") || "Status"}:
						</span>
						<span style={{ fontWeight: "bold", color: statusColor }}>
							{isLoading ? "..." : statusText}
						</span>
					</div>
					<div className={styles.row}>
						<span style={{ fontSize: 12, color: "var(--vnsc-text-secondary, #94a3b8)" }}>
							{t("licensing.tenant") || "Owner"}:
						</span>
						<span style={{ fontWeight: 500, color: "var(--vnsc-text-primary, #f1f5f9)" }}>
							{isLoading ? "..." : tenantMetadata?.tenantName || "VNInvest Charts"}
						</span>
					</div>
					<div className={styles.row}>
						<span style={{ fontSize: 12, color: "var(--vnsc-text-secondary, #94a3b8)" }}>
							{t("licensing.plan") || "Service Plan"}:
						</span>
						<span
							style={{
								background: planLabel === "FREE" ? "rgba(255, 255, 255, 0.1)" : "rgba(37, 99, 235, 0.2)",
								color: planLabel === "FREE" ? "var(--vnsc-text-secondary)" : "var(--vnsc-accent, #38bdf8)",
								padding: "2px 8px",
								borderRadius: "4px",
								fontSize: "11px",
								fontWeight: "bold",
							}}
						>
							{isLoading ? "..." : planLabel}
						</span>
					</div>
				</div>

				{/* CS-6: environment diagnostics. A license cannot verify without WebCrypto,
				    so say so instead of silently showing free. */}
				{diagnostics.reason && (
					<div
						style={{
							marginTop: 10, fontSize: 12, textAlign: "center", color: "#f59e0b",
							background: "rgba(245, 158, 11, 0.1)", padding: 8, borderRadius: 4,
						}}
					>
						{t(diagnostics.reason === "insecure-context" ? "licensing.diag.insecureContext" : "licensing.diag.subtleUnavailable") ||
							"License cannot be verified in this environment."}
					</div>
				)}

				{/* CS-6: degraded banner. Narrowed on purpose: only offline, grace-expired,
				    and plan-limited banner. "no-pat" never banners — an anonymous free user
				    is the normal state, not a degradation worth nagging about. Dismissible
				    by navigating away; never blocks interaction. */}
				{(degradedReason === "offline" || degradedReason === "grace-expired" || degradedReason === "plan-limited") && (
					<div
						data-testid="degraded-banner"
						style={{
							marginTop: 10, fontSize: 12, textAlign: "center", color: "#f59e0b",
							background: "rgba(245, 158, 11, 0.1)", padding: 8, borderRadius: 4,
						}}
					>
						{degradedReason === "offline"
							? t("licensing.degraded.offline") || "Cannot reach the server."
							: degradedReason === "grace-expired"
								? t("licensing.degraded.graceExpired") || "Server data is stale."
								: t("licensing.degraded.planLimited") || "Some features need a higher plan."}
					</div>
				)}

				<div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
					<span style={{ fontSize: 12, fontWeight: 600 }}>{t("licensing.licenseTitle") || "Offline License Key"}</span>
					<div style={{ display: "flex", gap: 8 }}>
						<input
							type={licenseMasked ? "password" : "text"}
							data-testid="license-input"
							className={styles.input}
							value={inputLicense}
							placeholder={t("licensing.licensePlaceholder") || "Paste vni1.… here"}
							onChange={(e) => setInputLicense(e.target.value)}
							disabled={isLoading}
							autoComplete="off"
							style={{ flex: 1, minWidth: 0 }}
						/>
						{licenseIsStored && (
							<button
								type="button"
								data-testid="license-reveal"
								className={styles.btnSm}
								aria-pressed={revealLicense}
								onClick={() => setRevealLicense((v) => !v)}
								disabled={isLoading}
								style={{ padding: "8px 10px", whiteSpace: "nowrap" }}
							>
								{revealLicense ? t("licensing.conceal") || "Hide key" : t("licensing.reveal") || "Show key"}
							</button>
						)}
						<button
							type="button"
							data-testid="license-save"
							className={styles.btnSm}
							onClick={handleSaveLicense}
							disabled={isLoading || !inputLicense.trim()}
							style={{ padding: "8px 14px", whiteSpace: "nowrap" }}
						>
							{isLoading ? "..." : t("licensing.save") || "Update Key"}
						</button>
						{storedLicense && (
							<button type="button" className={styles.btnSm} onClick={handleClearLicense} disabled={isLoading} style={{ padding: "8px 14px", whiteSpace: "nowrap" }}>
								{t("licensing.clear") || "Restore Defaults"}
							</button>
						)}
					</div>
					{serial && (
						<span style={{ fontSize: 11, color: "var(--vnsc-text-secondary, #94a3b8)" }}>
							{t("licensing.licenseSerial") || "Serial"}: {maskSerial(serial)}
						</span>
					)}
				</div>

				<div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
					<span style={{ fontSize: 12, fontWeight: 600 }}>{t("licensing.patTitle") || "Access Token (PAT)"}</span>
					<div style={{ display: "flex", gap: 8 }}>
						<input
							type="text"
							data-testid="pat-input"
							className={styles.input}
							value={inputPat}
							placeholder={t("licensing.patPlaceholder") || "Paste key vni_... here..."}
							onChange={(e) => setInputPat(e.target.value)}
							disabled={isLoading}
							style={{ flex: 1, minWidth: 0 }}
						/>
						<button
							type="button"
							data-testid="pat-save"
							className={styles.btnSm}
							onClick={handleSavePat}
							disabled={isLoading || !inputPat.trim() || inputPat.trim() === currentSavedPat}
							style={{ padding: "8px 14px", whiteSpace: "nowrap" }}
						>
							{isLoading ? "..." : t("licensing.save") || "Update Key"}
						</button>
						{currentSavedPat && (
							<button type="button" className={styles.btnSm} onClick={handleClearPat} disabled={isLoading} style={{ padding: "8px 14px", whiteSpace: "nowrap" }}>
								{t("licensing.clear") || "Restore Defaults"}
							</button>
						)}
					</div>
				</div>

				{!isLoading && currentSavedPat && !parseLicenseKey(currentSavedPat) && tenantMetadata?.plan === "free" && (
					<div
						style={{
							marginTop: 10,
							fontSize: 12,
							textAlign: "center",
							color: "#f59e0b",
							background: "rgba(245, 158, 11, 0.1)",
							padding: 8,
							borderRadius: 4,
						}}
					>
						{t("licensing.legacyHint") || "Legacy key format — cannot unlock Pro offline."}
					</div>
				)}
				{(feedbackMessage || saasError) && (
					<div
						style={{
							marginTop: 10,
							fontSize: 12,
							textAlign: "center",
							color: feedbackMessage
								? feedbackKind === "error" ? "#ef4444" : feedbackKind === "warn" ? "#f59e0b" : "#10b981"
								: "#ef4444",
							background: feedbackMessage
								? feedbackKind === "error" ? "rgba(239, 68, 68, 0.1)" : feedbackKind === "warn" ? "rgba(245, 158, 11, 0.1)" : "rgba(16, 185, 129, 0.1)"
								: "rgba(239, 68, 68, 0.1)",
							padding: 8,
							borderRadius: 4,
						}}
					>
						{feedbackMessage || saasError}
					</div>
				)}
				{/* Server rejection reason: what the backend actually said, mapped to copy.
			    A 401 used to collapse into "old format" no matter the cause. The four
			    mapped cases cover the backend's vocabulary; anything else renders the
			    raw detail because it is server data, not hardcoded UI copy. */}
				{/* Server rejection reason: what the backend actually said, mapped to copy.
			    Rendered INDEPENDENTLY of the transient save feedback above — that one
			    reports what the save did ("stored"), this one reports what the server
			    answered ("rejected, and why"). Gating one on the other hid the verdict
			    behind a 6-second toast. */}
				{serverRejectReason && (() => {
					const r = serverRejectReason;
					const statusMatch = r.match(/PAT is (\w+)/i);
					const headline = /invalid or revoked/i.test(r)
						? t("licensing.reject.unknown") || "Server does not recognize this key."
						: statusMatch
							? t("licensing.reject.status", { status: statusMatch[1], defaultValue: `Server reports this key is ${statusMatch[1]}.` })
							: /disabled/i.test(r)
								? t("licensing.reject.disabled") || "Server reports its service account is disabled."
								: /IP|CIDR|địa chỉ IP/i.test(r)
									? t("licensing.reject.network") || "Server refuses this network for the key."
									: null;
					return (
						<div
							data-testid="server-reject"
							style={{
								marginTop: 10, fontSize: 12, textAlign: "center", color: "#ef4444",
								background: "rgba(239, 68, 68, 0.1)", padding: 8, borderRadius: 4,
							}}
						>
							<div>{headline ?? r}</div>
							{headline && (
								<div style={{ marginTop: 4, fontSize: 11, opacity: 0.8 }}>
								Server: {r}
								</div>
							)}
						</div>
					);
				})()}
			</div>
		</div>
	);
}
