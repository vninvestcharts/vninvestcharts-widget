/**
 * OB-M03 — PATTokenModal
 * Source selector modal: Binance info, Offline file loader, VNInvest token/login.
 * Never logs PAT values to console.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { useDemoI18n } from "../i18n";
import { DataSourceSwitcher, type ActiveSource } from "./DataSourceSwitcher";
import { VNInvestClient } from "../../widget/adapters/VNInvestClient";
import { useDialogFocus } from "../../widget/hooks/useDialogFocus";

type Tab = "paste" | "login";

export interface ParsedFileBar {
	timestamp: number; open: number; high: number; low: number; close: number; volume: number;
}

export interface PATTokenModalProps {
	isOpen: boolean;
	client: VNInvestClient;
	activeSource: ActiveSource;
	onSourceChange: (source: ActiveSource) => void;
	onClose: () => void;
	/** Called after PAT is successfully saved. */
	onSaved: (hasToken: boolean) => void;
	/** Called after the active VNInvest connection settings change. */
	onConfigChange?: () => void;
	/** Called after a local file is parsed successfully. */
	onFileLoaded?: (bars: ParsedFileBar[], filename: string) => void;
	initialTab?: Tab;
}

function parseCSVBars(text: string): ParsedFileBar[] {
	const lines = text.trim().split("\n").filter(Boolean);
	if (lines.length < 2) return [];
	const firstField = lines[0].split(",")[0].trim().replace(/"/g, "");
	const hasHeader = isNaN(Number(firstField)) && isNaN(Date.parse(firstField) / 1000);
	const dataLines = hasHeader ? lines.slice(1) : lines;
	return dataLines.flatMap((line) => {
		const cols = line.split(",").map((c) => c.trim().replace(/"/g, ""));
		if (cols.length < 5) return [];
		const [dateStr, o, h, l, c, v = "0"] = cols;
		const ts = isNaN(Number(dateStr)) ? Date.parse(dateStr) : Number(dateStr) * (Number(dateStr) < 1e12 ? 1000 : 1);
		if (!ts || isNaN(ts)) return [];
		const open = Number(o), high = Number(h), low = Number(l), close = Number(c), volume = Number(v);
		if ([open, high, low, close].some(isNaN)) return [];
		return [{ timestamp: ts, open, high, low, close, volume: isNaN(volume) ? 0 : volume }];
	});
}

export function PATTokenModal({
	isOpen,
	client,
	activeSource,
	onSourceChange,
	onClose,
	onSaved,
	onConfigChange,
	onFileLoaded,
	initialTab = "paste",
}: PATTokenModalProps) {
	const { t } = useDemoI18n();
	const [activeTab, setActiveTab] = useState<Tab>(initialTab);
	const [pasteValue, setPasteValue] = useState("");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
	const [errorMsg, setErrorMsg] = useState("");
	const [loadedFileName, setLoadedFileName] = useState<string | null>(null);
	const [apiBaseInput, setApiBaseInput] = useState(() => client.getBase());
	const fileInputRef = useRef<HTMLInputElement>(null);
	const backdropRef = useRef<HTMLDivElement>(null);

	// Reset form on open
	useEffect(() => {
		if (isOpen) {
			setActiveTab(initialTab);
			setPasteValue("");
			setUsername("");
			setPassword("");
			setStatus("idle");
			setErrorMsg("");
			setApiBaseInput(client.getBase());
		}
	}, [client, initialTab, isOpen]);

	function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
		if (e.target === backdropRef.current) onClose();
	}

	// Stable identity keeps `useDialogFocus` from re-running its effect (and
	// stealing focus back to the trigger) on every parent render.
	const handleEscape = useCallback(() => onClose(), [onClose]);

	function applyApiBaseInput(): { base: string; changed: boolean } {
		const trimmed = apiBaseInput.trim().replace(/\/+$/, "");
		if (!trimmed) {
			return { base: client.getBase(), changed: false };
		}
		const currentBase = client.getBase();
		const changed = trimmed !== currentBase;
		if (changed) {
			client.setBase(trimmed);
		}
		setApiBaseInput(trimmed);
		return { base: trimmed, changed };
	}

	function handleSaveToken() {
		const token = pasteValue.trim();
		if (!token) {
			setStatus("error");
			setErrorMsg(t("vninvest.error.noPAT"));
			return;
		}
		applyApiBaseInput();
		client.setPAT(token);
		onConfigChange?.();
		setStatus("success");
		onSaved(true);
	}

	function handleClearToken() {
		client.setPAT("");
		setPasteValue("");
		setStatus("idle");
		onSaved(false);
	}

	function handleSaveBase() {
		const { changed } = applyApiBaseInput();
		if (changed) {
			onConfigChange?.();
		}
	}

	async function handleLogin() {
		const u = username.trim();
		const p = password.trim();
		if (!u || !p) {
			setStatus("error");
			setErrorMsg(t("vninvest.patModal.status.error"));
			return;
		}
		setStatus("loading");
		setErrorMsg("");
		try {
			const { base } = applyApiBaseInput();
			const res = await fetch(`${base}/api/auth/token/`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username: u, password: p }),
			});
			if (!res.ok) throw new Error("AUTH_FAILED");
			const data = await res.json() as { access?: string };
			const accessToken = data.access;
			if (!accessToken || typeof accessToken !== "string") throw new Error("NO_TOKEN");
			client.setPAT(accessToken);
			onConfigChange?.();
			setStatus("success");
			onSaved(true);
		} catch {
			setStatus("error");
			setErrorMsg(t("vninvest.patModal.status.error"));
		}
	}

	function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (ev) => {
			const text = ev.target?.result;
			if (typeof text !== "string") return;
			const bars = parseCSVBars(text);
			if (bars.length === 0) {
				setStatus("error");
				setErrorMsg(t("dataSource.offline.hint"));
				return;
			}
			setLoadedFileName(file.name);
			setStatus("success");
			onFileLoaded?.(bars, file.name);
		};
		reader.readAsText(file);
		// Reset input so same file can be re-selected
		e.target.value = "";
	}

	// UX-02 parity: this dialog is `aria-modal="true"` but had no keyboard
	// dismissal and no focus trap, so a keyboard user could Tab out into the
	// page behind it and could not close it with Escape — only the mouse ✕ or a
	// backdrop click worked. Reuse the widget's shared contract. MUST be called
	// before the `if (!isOpen) return null` below, otherwise the hook count
	// differs between the closed and open render (the same trap that made the
	// mobile flyout crash on open).
	useDialogFocus(backdropRef, { open: isOpen, onEscape: handleEscape });

	if (!isOpen) return null;

	return (
		<div
			ref={backdropRef}
			className="gc-modal-backdrop"
			role="dialog"
			aria-modal="true"
			aria-label={t("vninvest.patModal.title")}
			onClick={handleBackdropClick}
		>
			<div className="gc-modal gc-pat-modal">
				<div className="gc-modal__header">
					<span className="gc-modal__title">{t("vninvest.patModal.title")}</span>
					<button className="gc-modal__close" onClick={onClose} type="button" aria-label={t("settings.dialogClose")}>
						✕
					</button>
				</div>
				<div className="gc-modal__body">
					<div className="gc-pat-modal__source">
						<div className="gc-form-label">{t("dataSource.label")}</div>
						<DataSourceSwitcher activeSource={activeSource} onSwitch={onSourceChange} />
					</div>

					{activeSource === "binance" && (
						<div className="gc-pat-source-info">
							<svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
								<circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
								<line x1="8" y1="5" x2="8" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
								<circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
							</svg>
							<span>{t("dataSource.binance.info")}</span>
						</div>
					)}

					{activeSource === "offline" && (
						<div className="gc-pat-offline">
							<p className="gc-form-label">{t("dataSource.offline.selectFile")}</p>
							<p className="gc-pat-offline__hint">{t("dataSource.offline.hint")}</p>
							<div className="gc-pat-tab__actions">
								<button
									className="gc-btn gc-btn--primary"
									type="button"
									onClick={() => fileInputRef.current?.click()}
								>
									{t("dataSource.offline.selectFile")}
								</button>
								{loadedFileName && (
									<span className="gc-pat-offline__loaded">
										{t("dataSource.offline.loaded")} <strong>{loadedFileName}</strong>
									</span>
								)}
							</div>
							<input
								ref={fileInputRef}
								type="file"
								accept=".csv,.tsv,.txt,.json"
								hidden
								onChange={handleFileChange}
							/>
						</div>
					)}

					{activeSource === "vninvest" && (
						<>
							<div className="gc-pat-tab">
								<label htmlFor="gc-api-base-input" className="gc-form-label">
									{t("vninvest.patModal.input.serverUrl")}
								</label>
								<div style={{ display: "flex", gap: 6 }}>
									<input
										id="gc-api-base-input"
										className="gc-form-input"
										type="url"
										value={apiBaseInput}
										onChange={(e) => setApiBaseInput(e.target.value)}
										placeholder="http://127.0.0.1"
										autoComplete="off"
										onKeyDown={(e) => { if (e.key === "Enter") handleSaveBase(); }}
										style={{ flex: 1 }}
									/>
									<button className="gc-btn gc-btn--ghost" onClick={handleSaveBase} type="button">
										{t("vninvest.patModal.btn.setServer")}
									</button>
								</div>
							</div>
							<div className="gc-modal__tabs">
								<button
									className={`gc-modal__tab ${activeTab === "paste" ? "gc-modal__tab--active" : ""}`}
									onClick={() => setActiveTab("paste")}
									type="button"
								>
									{t("vninvest.patModal.tab.paste")}
								</button>
								<button
									className={`gc-modal__tab ${activeTab === "login" ? "gc-modal__tab--active" : ""}`}
									onClick={() => setActiveTab("login")}
									type="button"
								>
									{t("vninvest.patModal.tab.login")}
								</button>
							</div>
							{activeTab === "paste" && (
								<div className="gc-pat-tab">
									<label htmlFor="gc-pat-input" className="gc-form-label">
										{t("vninvest.patModal.input.token")}
									</label>
									<input
										id="gc-pat-input"
										className="gc-form-input"
										type="password"
										value={pasteValue}
										onChange={(e) => setPasteValue(e.target.value)}
										placeholder={t("vninvest.patModal.input.token")}
										autoComplete="off"
									/>
									<div className="gc-pat-tab__actions">
										<button className="gc-btn gc-btn--primary" onClick={handleSaveToken} type="button">
											{t("vninvest.patModal.btn.save")}
										</button>
										<button className="gc-btn gc-btn--ghost" onClick={handleClearToken} type="button">
											{t("vninvest.patModal.btn.clear")}
										</button>
									</div>
								</div>
							)}
							{activeTab === "login" && (
								<div className="gc-login-tab">
									<label htmlFor="gc-login-username" className="gc-form-label">
										{t("vninvest.patModal.input.username")}
									</label>
									<input
										id="gc-login-username"
										className="gc-form-input"
										type="text"
										value={username}
										onChange={(e) => setUsername(e.target.value)}
										autoComplete="username"
									/>
									<label htmlFor="gc-login-password" className="gc-form-label">
										{t("vninvest.patModal.input.password")}
									</label>
									<input
										id="gc-login-password"
										className="gc-form-input"
										type="password"
										value={password}
										onChange={(e) => setPassword(e.target.value)}
										autoComplete="current-password"
									/>
									<div className="gc-pat-tab__actions">
										<button
											className="gc-btn gc-btn--primary"
											onClick={() => void handleLogin()}
											type="button"
											disabled={status === "loading"}
										>
											{status === "loading" ? t("common.loading") : t("vninvest.patModal.btn.login")}
										</button>
									</div>
								</div>
							)}
						</>
					)}

					{status === "success" && (
						<div className="gc-form-feedback gc-form-feedback--success">
							{t("vninvest.patModal.status.success")}
						</div>
					)}
					{status === "error" && (
						<div className="gc-form-feedback gc-form-feedback--error">{errorMsg}</div>
					)}
				</div>
			</div>
		</div>
	);
}


