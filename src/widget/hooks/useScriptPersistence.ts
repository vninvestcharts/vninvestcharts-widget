import { useCallback, useEffect, useRef, useState } from "react"

const STORAGE_KEY = "vn._scripts"
const CURRENT_VERSION = 1
const AUTOSAVE_DELAY = 2000

export interface ScriptData {
  id: string
  name: string
  source: string
  created: string
  lastModified: string
  /**
   * Tamper EVIDENCE, not tamper PROOF.
   *
   * This is an FNV-1a checksum of `source` with its length, stored so a load can tell
   * whether the text still matches what was saved. It catches an accidental edit, a
   * truncated autosave, a half-written localStorage value, or a hand-edited devtools
   * payload. It does **NOT** stop anyone who recomputes it, and it is not a signature:
   * there is no key in this repo and inventing one would only be security theatre.
   * `plan/SPEC §3.7 A25` asks for HMAC keyed off the license, which is a key-distribution
   * decision for backend/ops and is deliberately not faked here.
   *
   * Absent on stores written before this field existed — those load without a warning,
   * because there is nothing to compare against and warning on every legacy script would
   * be noise, not signal.
   */
  integrity?: { checksum: string; sourceLength: number }
}

export interface ScriptStore {
  formatVersion: number
  scripts: Record<string, ScriptData>
  lastActiveId: string | null
}

export type SaveStatus = "saved" | "unsaved" | "saving" | "error"

/**
 * Read-only view of the persisted scripts, for callers outside the editor panel.
 *
 * The panel is `lazy()`-loaded (see `VNInvestCharts.tsx`), so anything that must happen on a
 * plain page reload — most importantly re-registering saved Pine scripts with the plugin registry
 * — cannot live inside it. Doing the restore there meant it only ran if the user happened to open
 * the Pine tab, and the saved series stayed invisible until some unrelated layout invalidation
 * recomputed the render panes.
 *
 * SSR-safe: it touches `localStorage` only when called, never at module scope.
 */
export function readStoredScripts(): ScriptData[] {
	try {
		const store = loadStore();
		return Object.values(store.scripts ?? {});
	} catch {
		return [];
	}
}

function generateId(): string {
	return "pine_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now().toString(36)
}

// Export ra để test khoá đúng chuỗi này. Trước đây test copy một bản "gần
// giống" ⇒ đổi template thì test vẫn xanh trong khi sản phẩm hỏng (L-E01).
export function defaultTemplate(index: number): string {
	return `//@version=5\nindicator("Untitled ${index}", overlay=true)\n\n// Your code here\nplot(close)`
}

function loadStore(): ScriptStore {
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) {
			return { formatVersion: CURRENT_VERSION, scripts: {}, lastActiveId: null }
		}
		const parsed = JSON.parse(raw) as ScriptStore
		return migrateStore(parsed)
	} catch {
		return { formatVersion: CURRENT_VERSION, scripts: {}, lastActiveId: null }
	}
}

function saveStore(store: ScriptStore): boolean {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
		return true
	} catch {
		return false
	}
}

function migrateStore(store: ScriptStore): ScriptStore {
	return store
}

/** FNV-1a, 32-bit. Cheap, synchronous, and good enough to notice a changed byte. */
export function scriptChecksum(source: string): string {
	let h = 0x811c9dc5
	for (let i = 0; i < source.length; i += 1) {
		h ^= source.charCodeAt(i)
		// h *= 16777619, in 32-bit space, without overflowing into float imprecision.
		h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
	}
	return `${h.toString(16).padStart(8, "0")}:${source.length}`
}

/** True when `integrity` is absent (legacy, nothing to compare) or still matches. */
export function isScriptIntact(script: ScriptData): boolean {
	if (!script.integrity) return true
	return script.integrity.checksum === scriptChecksum(script.source)
}

/** Stamp a script with its integrity evidence. Called on every write path. */
function withIntegrity(script: ScriptData): ScriptData {
	return { ...script, integrity: { checksum: scriptChecksum(script.source), sourceLength: script.source.length } }
}

/**
 * Ids whose stored text no longer matches their checksum.
 *
 * A script can fail to PARSE and still be intact, and can be intact and still be
 * wrong; this only says the bytes moved underneath us.
 */
export function findAlteredScripts(scripts: Record<string, ScriptData>): string[] {
	return Object.keys(scripts).filter((id) => !isScriptIntact(scripts[id]))
}

export function generateExportData(script: ScriptData): string {
	return JSON.stringify(
		{
			formatVersion: CURRENT_VERSION,
			name: script.name,
			source: script.source,
			created: script.created,
			lastModified: script.lastModified,
		},
		null,
		2,
	)
}

export function parseImportData(json: string): ScriptData | null {
	try {
		const parsed = JSON.parse(json)
		if (!parsed.source || !parsed.name) return null
		return withIntegrity({
			id: generateId(),
			name: parsed.name,
			source: parsed.source,
			created: parsed.created || new Date().toISOString(),
			lastModified: new Date().toISOString(),
		})
	} catch {
		return null
	}
}

export function useScriptPersistence() {
	const [scripts, setScripts] = useState<Record<string, ScriptData>>({})
	const [activeId, setActiveId] = useState<string | null>(null)
	const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved")
	const [initDone, setInitDone] = useState(false)
	const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const nextUntitledRef = useRef(1)

	useEffect(() => {
		const store = loadStore()
		setScripts(store.scripts)
		nextUntitledRef.current = Object.keys(store.scripts).length + 1
		if (store.lastActiveId && store.scripts[store.lastActiveId]) {
			setActiveId(store.lastActiveId)
		} else {
			const keys = Object.keys(store.scripts)
			if (keys.length > 0) {
				setActiveId(keys[0])
			}
		}
		setInitDone(true)
	}, [])

	const persist = useCallback((updatedScripts: Record<string, ScriptData>, active: string | null) => {
		const store: ScriptStore = {
			formatVersion: CURRENT_VERSION,
			scripts: updatedScripts,
			lastActiveId: active,
		}
		return saveStore(store)
	}, [])

	const getActiveScript = useCallback((): ScriptData | null => {
		if (!activeId) return null
		return scripts[activeId] ?? null
	}, [activeId, scripts])

	const setScriptSource = useCallback(
		(source: string) => {
			if (!activeId) return
			setSaveStatus("unsaved")
			if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
			autoSaveTimerRef.current = setTimeout(() => {
				setSaveStatus("saving")
				setScripts((prev) => {
					const existing = prev[activeId]
					if (!existing) return prev
					const updated = {
						...prev,
						[activeId]: withIntegrity({ ...existing, source, lastModified: new Date().toISOString() }),
					}
					const ok = persist(updated, activeId)
					setSaveStatus(ok ? "saved" : "error")
					return updated
				})
			}, AUTOSAVE_DELAY)
		},
		[activeId, persist],
	)

	const createScript = useCallback(
		(name?: string, source?: string) => {
			const id = generateId()
			const now = new Date().toISOString()
			const script: ScriptData = withIntegrity({
				id,
				name: name || `Untitled ${nextUntitledRef.current}`,
				source: source || defaultTemplate(nextUntitledRef.current),
				created: now,
				lastModified: now,
			})
			nextUntitledRef.current++
			setScripts((prev) => {
				const updated = { ...prev, [id]: script }
				persist(updated, id)
				return updated
			})
			setActiveId(id)
			setSaveStatus("saved")
			return id
		},
		[persist],
	)

	const selectScript = useCallback(
		(id: string) => {
			if (autoSaveTimerRef.current) {
				clearTimeout(autoSaveTimerRef.current)
				autoSaveTimerRef.current = null
			}
			setActiveId(id)
			setSaveStatus("saved")
			setScripts((prev) => {
				persist(prev, id)
				return prev
			})
		},
		[persist],
	)

	const deleteScript = useCallback(
		(id: string) => {
			setScripts((prev) => {
				const { [id]: _, ...rest } = prev
				const nextActive = id === activeId ? (Object.keys(rest)[0] ?? null) : activeId
				persist(rest, nextActive)
				setActiveId(nextActive)
				return rest
			})
			if (autoSaveTimerRef.current) {
				clearTimeout(autoSaveTimerRef.current)
				autoSaveTimerRef.current = null
			}
		},
		[activeId, persist],
	)

	const renameScript = useCallback(
		(id: string, newName: string) => {
			setScripts((prev) => {
				const existing = prev[id]
				if (!existing) return prev
				const updated = {
					...prev,
					[id]: withIntegrity({ ...existing, name: newName, lastModified: new Date().toISOString() }),
				}
				persist(updated, activeId)
				return updated
			})
		},
		[activeId, persist],
	)

	const exportScript = useCallback(
		(id: string) => {
			const script = scripts[id]
			if (!script) return false
			// Refuse to share text whose stored checksum no longer matches. Plan A25 asks to
			// block share/publish on a mismatch; the honest half of that is a refusal, not
			// a re-stamp that would erase the evidence.
			if (!isScriptIntact(script)) return false
			const data = generateExportData(script)
			const blob = new Blob([data], { type: "application/json" })
			const url = URL.createObjectURL(blob)
			const a = document.createElement("a")
			a.href = url
			a.download = `${script.name.replace(/\s+/g, "_")}.pine`
			document.body.appendChild(a)
			a.click()
			document.body.removeChild(a)
			URL.revokeObjectURL(url)
			return true
		},
		[scripts],
	)

	const importScript = useCallback(
		(json: string) => {
			const parsed = parseImportData(json)
			if (!parsed) return false
			setScripts((prev) => {
				const updated = { ...prev, [parsed.id]: parsed }
				persist(updated, parsed.id)
				return updated
			})
			setActiveId(parsed.id)
			setSaveStatus("saved")
			return true
		},
		[persist],
	)

	useEffect(() => {
		return () => {
			if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
		}
	}, [])

	return {
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
	}
}
