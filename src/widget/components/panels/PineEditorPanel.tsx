import { useRef, useCallback, useState, useEffect, useMemo } from "react"
import { useWidgetI18n } from "../../context/WidgetI18nContext"
import { getPineScriptAdapter } from "../../../lib/pinescript/adapter"
import { pineSeriesTypeFor } from "../../../lib/core/seriesValueResolver"
import { useScriptPersistence, type SaveStatus, type ScriptData } from "../../hooks/useScriptPersistence"
import styles from "../../styles/pine-editor.module.css"

interface WorkerResponse {
  id: string
  type: "result" | "error"
  output?: Record<string, number[]>
  errors?: Array<{ message: string; line?: number; column?: number }>
}

export interface PineEditorPanelProps {
  onAddIndicator: (config: any) => void
  bars?: { open: number[]; high: number[]; low: number[]; close: number[]; volume: number[] }
  /**
   * 1.6b: series types the host already has on the chart. A saved script is restored only when
   * its type appears here, which is what makes the restore idempotent (it never dispatches
   * `addSeries`, so StrictMode cannot duplicate a series) and stops it resurrecting a Pine series
   * the user deleted from the chart but kept in the editor.
   */
  restorableSeriesTypes?: readonly string[]
}

const DEFAULT_SCRIPT = `study("My custom SMA", overlay=true)
src = close
len = 14
val = ta.sma(src, len)
plot(val, title="SMA Line", color="#ff9800")`

let nextRequestId = 1

export function PineEditorPanel({ onAddIndicator, bars, restorableSeriesTypes }: PineEditorPanelProps) {
	const { t } = useWidgetI18n()
	const {
		scripts,
		activeId,
		getActiveScript,
		saveStatus,
		initDone,
		setScriptSource,
		createScript,
		selectScript,
		deleteScript,
		renameScript,
		exportScript,
		importScript,
	} = useScriptPersistence()

	const [error, setError] = useState<string | null>(null)
	const [successMsg, setSuccessMsg] = useState<string | null>(null)
	const [compileStatus, setCompileStatus] = useState<"idle" | "compiling" | "ok" | "error">("idle")
	const [localCode, setLocalCode] = useState<string>(DEFAULT_SCRIPT)
	const [showSidebar, setShowSidebar] = useState(true)
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
	const [renamingId, setRenamingId] = useState<string | null>(null)
	const [renameValue, setRenameValue] = useState("")
	const fileInputRef = useRef<HTMLInputElement>(null)
	const editorRef = useRef<any>(null)
	const monacoRef = useRef<any>(null)
	const workerRef = useRef<Worker | null>(null)
	const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	const syncedScriptIdRef = useRef<string | null>(null)
	useEffect(() => {
		if (!initDone) return
		const active = getActiveScript()
		if (!active) {
			createScript()
			return
		}
		// Only adopt the source when the ACTIVE SCRIPT actually changed.
		//
		// This effect used to call `setLocalCode(active.source)` on every run, and it re-runs
		// whenever `getActiveScript` changes identity — which happens right after `createScript`.
		// Typing immediately after pressing "New Script" therefore lost the edit: the model showed
		// the new text while `localCode` had been reset to the default template, so *Add to chart*
		// compiled the WRONG script. Measured in G-PINE-E2E as the overlay=false script silently
		// landing in the price pane while the editor plainly showed `overlay=false`.
		if (syncedScriptIdRef.current === active.id) return
		syncedScriptIdRef.current = active.id
		setLocalCode(active.source)
	}, [initDone, getActiveScript, createScript])

	// 1.6b restore no longer lives here: this panel is `lazy()`-loaded, so a restore inside it only
	// ran if the user happened to open the Pine tab, and a saved series stayed invisible after a
	// plain reload. `usePineScriptRestore` does it at widget mount instead, and returns a version
	// so `renderPanes` recomputes once the registry is populated.

	const scheduleCompile = useCallback((src: string) => {
		if (pendingRef.current) clearTimeout(pendingRef.current)
		pendingRef.current = setTimeout(() => {
			if (!workerRef.current) return
			const id = String(nextRequestId++)
			workerRef.current.postMessage({
				id,
				type: "compile",
				source: src,
				bars: bars ?? { open: [], high: [], low: [], close: [], volume: [] },
			})
			setCompileStatus("compiling")
			setError(null)
		}, 500)
	}, [])

	useEffect(() => {
		const adapter = getPineScriptAdapter()
		if (!adapter) return
		let worker: Worker
		try {
			worker = adapter.createWorker()
		} catch {
			return
		}
		workerRef.current = worker

		worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
			const resp = e.data
			if (resp.type === "error") {
				setCompileStatus("error")
				setError(resp.errors?.[0]?.message ?? t("ui.pinescript.workerError"))
			} else if (resp.errors && resp.errors.length > 0) {
				setCompileStatus("error")
				setError(resp.errors[0].message)
			} else {
				setCompileStatus("ok")
				setError(null)
			}
		}

		worker.onerror = (err: ErrorEvent) => {
			setCompileStatus("error")
			setError(t("ui.pinescript.workerErrorDetail", { message: err.message }))
		}

		return () => {
			worker.terminate()
		}
	}, [])

	const handleCodeChange = useCallback(
		(value: string | undefined) => {
			const next = value ?? ""
			setLocalCode(next)
			setSuccessMsg(null)
			if (compileStatus !== "idle") setCompileStatus("idle")
			setError(null)
			if (activeId) setScriptSource(next)
			scheduleCompile(next)
		},
		[compileStatus, scheduleCompile, activeId, setScriptSource],
	)

	const handleCompile = () => {
		setError(null)
		setSuccessMsg(null)
		const adapter = getPineScriptAdapter()
		if (!adapter) {
			setError(t("ui.pinescript.proModuleNotLoaded"))
			return
		}
		const { compile, runStrategy, isStrategySource, registerPineScript } = adapter
		try {
			// P0-2 (2026-10-22): script STRATEGY phải đi qua engine strategy
			// (`runStrategy`), không qua `compile()`. Đo trên đường compile thật:
			// `compile(strategyScript)` → "Undefined variable: strategy.long", còn
			// `runStrategy(strategyScript, bars)` → không lỗi, ra lệnh + equity.
			// ⇒ trước đây editor **từ chối** mọi script strategy, tức chiến lược
			// Pine không dùng được (và `runStrategy` không có call site nào trong
			// production). Ở đây editor định tuyến đúng engine và báo lỗi THẬT
			// của script (nếu có) thay vì lỗi sai.
			if (isStrategySource(localCode)) {
				if (!bars) {
					setError(t("ui.pinescript.strategyNeedsBars"))
					return
				}
				const strategyResult = runStrategy(localCode, bars)
				if (strategyResult.errors.length > 0) {
					setError(strategyResult.errors[0].message)
					return
				}
				// Một chiến lược không sinh series để vẽ lên chart ⇒ KHÔNG
				// register làm Pine series (register sẽ tạo một series rỗng).
				setSuccessMsg(t("ui.pinescript.strategyValidated"))
				return
			}

			const result = compile(localCode)
			if (result.errors.length > 0) {
				setError(result.errors[0].message)
				return
			}

			// STAGE-1: the series type must be STABLE and derivable from the persisted script, not
			// random per click. A random id meant a fresh `pine_custom_*` type on every compile, so
			// (a) the key lookup could never name it, and (b) a pane layout saved with the old id
			// pointed at a type that no longer existed after reload.
			const scriptId = getActiveScript()?.id ?? `scratch_${Date.now().toString(36)}`
			const pluginId = pineSeriesTypeFor(scriptId)
			if (registerPineScript(scriptId, localCode) === null) {
				setError(result.errors[0]?.message ?? t("ui.pinescript.compileFailed"))
				return
			}

			onAddIndicator({
				id: pluginId,
				type: pluginId,
				yAxis: "right",
				params: {},
				// 1.5: the host needs to know whether to overlay the price pane or open its own.
				// `grammar.ts:46` already parses `overlay=`; defaulting to true preserves the
				// pre-existing behaviour for a declaration that omits the keyword.
				overlay: result.overlay !== false,
			})

			setSuccessMsg(t("ui.pinescript.success"))
		} catch (err: any) {
			setError(err.message || t("ui.pinescript.compileFailed"))
		}
	}

	// beforeMount: Monaco đã nạp (và đã tự gán MonacoEnvironment mặc định dùng blob
	// worker — bị CSP chặn), editor CHƯA create. Đây là điểm duy nhất patch được
	// getWorker TRƯỚC khi worker đầu tiên được spawn. PINE-13, 2026-10-17.
	const handleBeforeMount = useCallback(() => {
		const adapter = getPineScriptAdapter()
		if (!adapter) return
		adapter.installMonacoEnvironment(adapter.pineMonacoVSPath())
	}, [])

	const handleMount = useCallback((editor: any, monaco: any) => {
		editorRef.current = editor
		monacoRef.current = monaco
		const adapter = getPineScriptAdapter()
		if (!adapter) return
		;(adapter.VnScriptLanguage as { register: (m: unknown) => void }).register(monaco)
		monaco.editor.defineTheme("vninvest-widget", {
			base: "vs-dark",
			inherit: true,
			rules: [
				{ token: "keyword", foreground: "#569cd6", fontStyle: "bold" },
				{ token: "function", foreground: "#dcdcaa" },
				{ token: "string", foreground: "#ce9178" },
				{ token: "number", foreground: "#b5cea8" },
				{ token: "comment", foreground: "#6a9955", fontStyle: "italic" },
				{ token: "type", foreground: "#4ec9b0" },
			],
			colors: {
				"editor.background": "#090d14",
				"editor.foreground": "#a9b2c3",
				"editor.lineHighlightBackground": "#0f1520",
				"editor.selectionBackground": "#264f78",
				"editorCursor.foreground": "#a9b2c3",
				"editorLineNumber.foreground": "#3a4555",
			},
		})
		monaco.editor.setTheme("vninvest-widget")
	}, [])

	const [EditorComponent, setEditorComponent] = useState<any>(null)
	useEffect(() => {
		import("@monaco-editor/react").then((mod) => {
			// B2 (2026-10-17): trỏ loader vào assets TỰ HOST trước khi Editor mount — mặc
			// định của @monaco-editor/react là CDN jsdelivr, bị CSP `script-src 'self'`
			// chặn (PINE-10/11/13). Xem widget-pro pinescript/monacoPaths.
			const adapter = getPineScriptAdapter()
			if (!adapter) return
			mod.loader.config({ paths: { vs: adapter.pineMonacoVSPath() } })
			setEditorComponent(() => mod.default)
		})
	}, [])

	const handleNewScript = useCallback(() => {
		createScript()
	}, [createScript])

	const handleDelete = useCallback(
		(id: string) => {
			setDeleteConfirmId(null)
			deleteScript(id)
		},
		[deleteScript],
	)

	const handleExport = useCallback(
		(id: string) => {
			exportScript(id)
		},
		[exportScript],
	)

	const handleImport = useCallback(() => {
		fileInputRef.current?.click()
	}, [])

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0]
			if (!file) return
			const reader = new FileReader()
			reader.onload = (ev) => {
				const text = ev.target?.result
				if (typeof text === "string") {
					const ok = importScript(text)
					if (ok) {
						try {
							const parsed = JSON.parse(text)
							setSuccessMsg(t("ui.pinescript.importSuccess", { name: parsed.name }))
						} catch {
							setSuccessMsg(t("ui.pinescript.importSuccess", { name: file.name }))
						}
					} else {
						setError(t("ui.pinescript.importFailed"))
					}
				}
			}
			reader.readAsText(file)
			e.target.value = ""
		},
		[importScript, t],
	)

	const startRename = useCallback((id: string, name: string) => {
		setRenamingId(id)
		setRenameValue(name)
	}, [])

	const sortedScripts = useMemo(() => {
		return Object.values(scripts).sort(
			(a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime(),
		)
	}, [scripts])

	const saveStatusText = useMemo(() => {
		const map: Record<SaveStatus, string> = {
			saved: t("ui.pinescript.saved"),
			unsaved: t("ui.pinescript.unsaved"),
			saving: t("ui.pinescript.saving"),
			error: t("ui.pinescript.saveFailed"),
		}
		return map[saveStatus]
	}, [saveStatus, t])

	const saveStatusColor = useMemo(() => {
		const map: Record<SaveStatus, string> = {
			saved: "#53d769",
			unsaved: "#ffc800",
			saving: "#ffc800",
			error: "#f23645",
		}
		return map[saveStatus]
	}, [saveStatus])

	const activeScript = getActiveScript()

	return (
		<div className={styles.panel}>
			<div className={styles.toolbar}>
				<span className={styles.title}>{t("ui.pinescript.editor")}</span>
				<span style={{ fontSize: 11, color: saveStatusColor }}>
					{"\u25CF"} {saveStatusText}
				</span>
				{compileStatus === "ok" && !error && (
					<span style={{ fontSize: 11, color: "#53d769" }}>
						{"●"} {t("ui.pinescript.statusCompiled")}
					</span>
				)}
				{compileStatus === "error" && (
					<span style={{ fontSize: 11, color: "#f23645" }}>
						{"●"} {t("ui.pinescript.statusError")}
					</span>
				)}
				{compileStatus === "compiling" && (
					<span style={{ fontSize: 11, color: "#ffc800" }}>
						{"●"} {t("ui.pinescript.statusCompiling")}
					</span>
				)}
				<button
					onClick={handleNewScript}
					className={styles.toolBtn}
					title={t("ui.pinescript.newScript")}
				>
          + {t("ui.pinescript.newScript")}
				</button>
				<button
					onClick={handleCompile}
					disabled={compileStatus === "compiling"}
					className={styles.compileBtn}
				>
					{t("ui.pinescript.compile")}
				</button>
			</div>

			<div className={styles.body}>
				{showSidebar && (
					<div className={styles.sidebar}>
						<div className={styles.sidebarHeader}>
							<span>{t("ui.pinescript.scriptList")}</span>
							<button
								onClick={handleImport}
								className={styles.smallBtn}
								title={t("ui.pinescript.import")}
							>
								{t("ui.pinescript.import")}
							</button>
							<input
								ref={fileInputRef}
								type="file"
								accept=".pine"
								style={{ display: "none" }}
								onChange={handleFileChange}
							/>
						</div>
						<div className={styles.scriptList}>
							{sortedScripts.map((sc) => (
								<div
									key={sc.id}
									className={`${styles.scriptItem} ${sc.id === activeId ? styles.scriptItemActive : ""}`}
									onClick={() => selectScript(sc.id)}
								>
									{renamingId === sc.id ? (
										<input
											className={styles.renameInput}
											value={renameValue}
											onChange={(e) => setRenameValue(e.target.value)}
											onBlur={() => {
												if (renamingId && renameValue.trim()) {
													renameScript(renamingId, renameValue.trim())
												}
												setRenamingId(null)
											}}
											onKeyDown={(e) => {
												if (e.key === "Enter") {
													if (renamingId && renameValue.trim()) {
														renameScript(renamingId, renameValue.trim())
													}
													setRenamingId(null)
													e.stopPropagation()
												}
												if (e.key === "Escape") {
													setRenamingId(null)
													e.stopPropagation()
												}
											}}
											autoFocus
											onClick={(e) => e.stopPropagation()}
										/>
									) : (
										<span
											className={styles.scriptName}
											onDoubleClick={() => startRename(sc.id, sc.name)}
										>
											{sc.name}
										</span>
									)}
									<div className={styles.scriptActions}>
										<button
											className={styles.smallBtn}
											onClick={(e) => {
												e.stopPropagation()
												handleExport(sc.id)
											}}
											title={t("ui.pinescript.export")}
										>
											{t("ui.pinescript.export")}
										</button>
										{deleteConfirmId === sc.id ? (
											<>
												<button
													className={styles.smallBtnDanger}
													onClick={(e) => {
														e.stopPropagation()
														handleDelete(sc.id)
													}}
												>
													{t("ui.pinescript.delete")}
												</button>
												<button
													className={styles.smallBtn}
													onClick={(e) => {
														e.stopPropagation()
														setDeleteConfirmId(null)
													}}
												>
													{t("ui.pinescript.cancel")}
												</button>
											</>
										) : (
											<button
												className={styles.smallBtnDanger}
												onClick={(e) => {
													e.stopPropagation()
													setDeleteConfirmId(sc.id)
												}}
												title={t("ui.pinescript.delete")}
											>
												{t("ui.pinescript.delete")}
											</button>
										)}
									</div>
								</div>
							))}
						</div>
					</div>
				)}

				<div className={styles.editorContainer}>
					{!EditorComponent ? (
						<div
							style={{
								flex: 1,
								background: "#090d14",
								border: "1px solid #202b3c",
								borderRadius: 4,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								color: "#5d6b7f",
								fontSize: 13,
							}}
						>
							{t("ui.pinescript.loadingEditor")}
						</div>
					) : (
						<EditorComponent
							height="100%"
							defaultLanguage="vnscript"
							value={localCode}
							theme="vninvest-widget"
							beforeMount={handleBeforeMount}
							onChange={handleCodeChange}
							onMount={handleMount}
							options={{
								minimap: { enabled: false },
								fontSize: 13,
								fontFamily: "'Fira Code', 'Consolas', monospace",
								lineNumbers: "on",
								renderLineHighlight: "line",
								scrollBeyondLastLine: false,
								automaticLayout: true,
								tabSize: 2,
								wordWrap: "on",
							}}
						/>
					)}
				</div>
			</div>

			{error && (
				<div className={styles.errorBox}>
					<strong>{t("ui.pinescript.error")}:</strong> {error}
				</div>
			)}
			{successMsg && <div className={styles.successBox}>{successMsg}</div>}
		</div>
	)
}
