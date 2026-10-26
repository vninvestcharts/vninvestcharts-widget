import { useState, useCallback, useEffect, useRef } from "react";
import { useDemoI18n } from "../i18n";
import type { ShowcaseName } from "../showcases";
import styles from "./SystemMenu.module.css";

interface SyncSettings {
  syncVisibleRange: boolean;
  syncCrosshair: boolean;
  syncDrawings: boolean;
  syncSymbolLinks: boolean;
}

interface ShowcaseInfo {
  name: ShowcaseName;
  label: string;
  description: string;
}

export interface SystemMenuProps {
  showcases: readonly ShowcaseInfo[];
  activeShowcase: ShowcaseName;
  onShowcaseChange: (name: ShowcaseName) => void;
  syncSettings: SyncSettings;
  onSyncChange: (key: keyof SyncSettings, value: boolean) => void;
  onSaveWorkspace?: () => void;
  onAddChart?: () => void;
}

function getAllFocusableElements(container: HTMLElement): HTMLElement[] {
	return Array.from(
		container.querySelectorAll<HTMLElement>(
			'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
		)
	).filter((el) => el.offsetParent !== null);
}

export function SystemMenu({
	showcases,
	activeShowcase,
	onShowcaseChange,
	syncSettings,
	onSyncChange,
	onSaveWorkspace,
	onAddChart,
}: SystemMenuProps) {
	const { t } = useDemoI18n();
	const [open, setOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);

	const toggle = useCallback(() => setOpen((v) => !v), []);
	const close = useCallback(() => {
		setOpen(false);
		triggerRef.current?.focus();
	}, []);

	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				close();
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open, close]);

	// Focus first item on open
	useEffect(() => {
		if (!open) return;
		const menuEl = menuRef.current?.querySelector(`.${styles.menu}`);
		if (menuEl) {
			const focusable = getAllFocusableElements(menuEl as HTMLElement);
			focusable[0]?.focus();
		}
	}, [open]);

	// Keyboard navigation and focus trap
	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent) => {
			const menuEl = menuRef.current?.querySelector(`.${styles.menu}`);
			if (!menuEl) return;
			const focusable = getAllFocusableElements(menuEl as HTMLElement);
			if (focusable.length === 0) return;

			const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);

			if (e.key === "Escape") {
				e.preventDefault();
				close();
				return;
			}
			if (e.key === "ArrowDown") {
				e.preventDefault();
				const next = (currentIndex + 1) % focusable.length;
				focusable[next]?.focus();
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				const prev = (currentIndex - 1 + focusable.length) % focusable.length;
				focusable[prev]?.focus();
				return;
			}
			if (e.key === "Tab") {
				if (focusable.length === 0) {
					e.preventDefault();
					return;
				}
				if (e.shiftKey) {
					if (currentIndex <= 0) {
						e.preventDefault();
						focusable[focusable.length - 1]?.focus();
					}
				} else {
					if (currentIndex === focusable.length - 1 || currentIndex === -1) {
						e.preventDefault();
						focusable[0]?.focus();
					}
				}
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [open, close]);

	const handleShowcaseClick = useCallback(
		(name: ShowcaseName) => {
			onShowcaseChange(name);
			close();
		},
		[onShowcaseChange, close]
	);

	const syncItems: { key: keyof SyncSettings; label: string }[] = [
		{ key: "syncVisibleRange", label: t("demo.syncVisibleRange") },
		{ key: "syncCrosshair", label: t("demo.syncCrosshair") },
		{ key: "syncDrawings", label: t("demo.syncDrawings") },
		{ key: "syncSymbolLinks", label: t("demo.syncSymbolLinks") },
	];

	return (
		<div ref={menuRef} style={{ position: "relative" }}>
			<button
				ref={triggerRef}
				className={styles.trigger}
				onClick={toggle}
				aria-expanded={open}
				aria-label={t("demo.systemMenu")}
				title={t("demo.systemMenu")}
				aria-haspopup="menu"
			>
        ☰
			</button>

			{open && (
				<>
					<div className={styles.overlay} onClick={close} aria-hidden="true" />

					<div className={styles.menu} role="menu" aria-label={t("demo.systemMenu")}>
						{/* Showcase Selector */}
						<div className={styles.section}>
							<div className={styles.sectionTitle}>{t("demo.systemMenu.showcase")}</div>
							{showcases.map((s) => (
								<button
									key={s.name}
									className={`${styles.item} ${activeShowcase === s.name ? styles.itemActive : ""}`}
									onClick={() => handleShowcaseClick(s.name)}
									role="menuitem"
									title={s.description}
								>
									<span className={styles.itemIcon}>{activeShowcase === s.name ? "✓" : ""}</span>
									<span>{s.label}</span>
								</button>
							))}
						</div>

						{/* Sync Settings */}
						<div className={styles.section}>
							<div className={styles.sectionTitle}>{t("demo.systemMenu.sync")}</div>
							{syncItems.map(({ key, label }) => (
								<label key={key} className={styles.checkbox}>
									<input
										type="checkbox"
										checked={syncSettings[key]}
										onChange={(e) => onSyncChange(key, e.target.checked)}
									/>
									<span>{label}</span>
								</label>
							))}
						</div>

						{/* Workspace Controls */}
						<div className={styles.section}>
							<div className={styles.sectionTitle}>{t("demo.systemMenu.workspace")}</div>
							<button
								className={styles.item}
								onClick={() => {
									onSaveWorkspace?.();
									close();
								}}
								role="menuitem"
							>
								<span className={styles.itemIcon}>💾</span>
								<span>{t("demo.systemMenu.save")}</span>
							</button>
							{onAddChart && (
								<button
									className={styles.item}
									onClick={() => {
										onAddChart();
										close();
									}}
									role="menuitem"
								>
									<span className={styles.itemIcon}>+</span>
									<span>{t("demo.addChart")}</span>
								</button>
							)}
						</div>

						{/* Keyboard Shortcuts — chỉ liệt kê phím ĐANG chạy.
							Trước 2026-09-30 dòng này quảng cá `Ctrl+S` (Save) và `Ctrl+D` (Add Chart).
							Cả hai đều KHÔNG có handler nào: `Ctrl+S` còn là phím Save của trình duyệt.
							Đã thay bằng binding thật, lấy từ i18n `shortcuts.*` để không lệch với
							`ShortcutManager` (guard ở `ShortcutManager.collision.test.ts`). */}
						<div className={styles.section}>
							<div className={styles.sectionTitle}>{t("demo.systemMenu.shortcutsTitle")}</div>
							<div className={styles.shortcutRow}>
								<span>{t("shortcuts.symbolSearch")}</span>
								<kbd className={styles.shortcutKey}>Ctrl+K</kbd>
							</div>
							<div className={styles.shortcutRow}>
								<span>{t("shortcuts.dockToggle")}</span>
								<kbd className={styles.shortcutKey}>Ctrl+Shift+L</kbd>
							</div>
							<div className={styles.shortcutRow}>
								<span>{t("shortcuts.syncToggles")}</span>
								<kbd className={styles.shortcutKey}>Ctrl+Shift+H / Ctrl+Shift+V</kbd>
							</div>
							<div className={styles.shortcutRow}>
								<span>{t("shortcuts.thisHelp")}</span>
								<kbd className={styles.shortcutKey}>?</kbd>
							</div>
						</div>

						{/* Footer Links */}
						<div className={styles.section}>
							<a
								className={`${styles.item} ${styles.link}`}
								href="https://github.com/anomalyco/vninvestcharts-widget"
								target="_blank"
								rel="noopener noreferrer"
								onClick={close}
							>
								<span className={styles.itemIcon}>&#128279;</span>
								<span>{t("demo.systemMenu.viewOnGithub")}</span>
							</a>
						</div>
					</div>
				</>
			)}
		</div>
	);
}
