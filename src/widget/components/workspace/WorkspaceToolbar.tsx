import React, { useState, useCallback, useRef, type CSSProperties, type ReactNode, type ChangeEvent } from "react";
import { defaultLocalStorageAdapter } from "@vninvestcharts/engine-react";
import type { StorageAdapter } from "@vninvestcharts/engine-react";
import { ConfirmDialog } from "../ConfirmDialog";
import styles from "./WorkspaceToolbar.module.css";

export interface WorkspaceInfo {
  id: string;
  name: string;
  updatedAt: number;
}

export interface WorkspaceToolbarProps {
  // Current workspace
  currentWorkspaceId?: string;
  currentWorkspaceName?: string;

  // Workspace list
  workspaces: WorkspaceInfo[];

  // Callbacks
  onSave: (workspaceId: string, name: string) => Promise<void>;
  onLoad: (workspaceId: string) => Promise<void>;
  onDelete?: (workspaceId: string) => Promise<void>;
  onImport?: (file: File) => Promise<void>;
  onExport?: (workspaceId: string) => Promise<void>;

  // Adapters
  storageAdapter?: StorageAdapter;

  // Styling
  className?: string;
  style?: CSSProperties;

  // Children (for custom actions)
  children?: ReactNode;

  // Auto-save
  autoSaveEnabled?: boolean;
  onAutoSaveToggle?: (enabled: boolean) => void;
}

export const WorkspaceToolbar: React.FC<WorkspaceToolbarProps> = ({
	currentWorkspaceId,
	currentWorkspaceName = "Untitled Workspace",
	workspaces = [],
	onSave,
	onLoad,
	onDelete,
	onImport,
	onExport,
	storageAdapter = defaultLocalStorageAdapter,
	className = "",
	style,
	children,
	autoSaveEnabled = false,
	onAutoSaveToggle,
}) => {
	const [showSaveDialog, setShowSaveDialog] = useState(false);
	const [showLoadDialog, setShowLoadDialog] = useState(false);
	const [showImportDialog, setShowImportDialog] = useState(false);
	const [newWorkspaceName, setNewWorkspaceName] = useState("");
	const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
	const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const saveDialogInputRef = useRef<HTMLInputElement>(null);

	// Handle save
	const handleSave = useCallback(async () => {
		if (!newWorkspaceName.trim()) return;
		await onSave(currentWorkspaceId || `workspace-${Date.now()}`, newWorkspaceName.trim());
		setShowSaveDialog(false);
		setNewWorkspaceName("");
	}, [newWorkspaceName, currentWorkspaceId, onSave]);

	// Handle load
	const handleLoad = useCallback(async () => {
		if (!selectedWorkspaceId) return;
		await onLoad(selectedWorkspaceId);
		setShowLoadDialog(false);
		setSelectedWorkspaceId(null);
	}, [selectedWorkspaceId, onLoad]);

	// Handle delete
	const handleDelete = useCallback(async (workspaceId: string) => {
		if (!onDelete) return;
		const wsName = workspaces.find(w => w.id === workspaceId)?.name || workspaceId;
		setPendingDelete({ id: workspaceId, name: wsName });
	}, [onDelete, workspaces]);

	// Handle import
	const handleImport = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file || !onImport) return;
		await onImport(file);
		setShowImportDialog(false);
		if (event.target) event.target.value = "";
	}, [onImport]);

	// Handle export
	const handleExport = useCallback(async () => {
		if (!currentWorkspaceId || !onExport) return;
		await onExport(currentWorkspaceId);
	}, [currentWorkspaceId, onExport]);

	// Open save dialog
	const openSaveDialog = useCallback(() => {
		setNewWorkspaceName(currentWorkspaceName);
		setShowSaveDialog(true);
		setTimeout(() => saveDialogInputRef.current?.focus(), 0);
	}, [currentWorkspaceName]);

	// Open load dialog
	const openLoadDialog = useCallback(() => {
		setShowLoadDialog(true);
	}, []);

	// Open import dialog
	const openImportDialog = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	// Keyboard shortcuts
	const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
		if ((event.ctrlKey || event.metaKey) && event.key === "s") {
			event.preventDefault();
			openSaveDialog();
		}
		if ((event.ctrlKey || event.metaKey) && event.key === "o") {
			event.preventDefault();
			openLoadDialog();
		}
	}, [openSaveDialog, openLoadDialog]);

	// Focus management for dialogs
	const handleDialogKeyDown = useCallback((event: React.KeyboardEvent) => {
		if (event.key === "Escape") {
			setShowSaveDialog(false);
			setShowLoadDialog(false);
			setShowImportDialog(false);
		}
		if (event.key === "Enter" && !event.shiftKey) {
			if (showSaveDialog) handleSave();
			if (showLoadDialog) handleLoad();
		}
	}, [showSaveDialog, showLoadDialog, handleSave, handleLoad]);

	return (
		<div
			className={`${styles.toolbar} ${className}`}
			style={style}
			onKeyDown={handleKeyDown}
			role="toolbar"
			aria-label="Workspace toolbar"
		>
			{/* Workspace name display */}
			<div className={styles.workspaceInfo}>
				<span className={styles.workspaceIcon} aria-hidden="true">📁</span>
				<span className={styles.workspaceName} title={currentWorkspaceName}>
					{currentWorkspaceName}
				</span>
				{currentWorkspaceId && (
					<span className={styles.workspaceId} title={currentWorkspaceId}>
						{currentWorkspaceId.slice(0, 8)}...
					</span>
				)}
			</div>

			{/* Action buttons */}
			<div className={styles.actions}>
				<button
					className={`${styles.button} ${styles.saveButton}`}
					onClick={openSaveDialog}
					aria-label="Save workspace"
					title="Save workspace"
				>
					<span aria-hidden="true">💾</span>
					<span>Save</span>
				</button>

				<button
					className={`${styles.button} ${styles.loadButton}`}
					onClick={openLoadDialog}
					aria-label="Load workspace (Ctrl+O)"
					title="Load workspace (Ctrl+O)"
				>
					<span aria-hidden="true">📂</span>
					<span>Load</span>
				</button>

				{onImport && (
					<button
						className={`${styles.button} ${styles.importButton}`}
						onClick={openImportDialog}
						aria-label="Import workspace"
						title="Import workspace"
					>
						<span aria-hidden="true">⬆️</span>
						<span>Import</span>
					</button>
				)}

				{onExport && currentWorkspaceId && (
					<button
						className={`${styles.button} ${styles.exportButton}`}
						onClick={handleExport}
						aria-label="Export workspace"
						title="Export workspace"
					>
						<span aria-hidden="true">⬇️</span>
						<span>Export</span>
					</button>
				)}

				{onAutoSaveToggle && (
					<label className={`${styles.autoSaveToggle} ${autoSaveEnabled ? styles.enabled : ""}`}>
						<input
							type="checkbox"
							checked={autoSaveEnabled}
							onChange={e => onAutoSaveToggle(e.target.checked)}
							aria-label="Auto-save workspace"
						/>
						<span className={styles.autoSaveLabel}>Auto-save</span>
					</label>
				)}

				{children}
			</div>

			{/* Save Dialog */}
			{showSaveDialog && (
				<div className={styles.dialogOverlay} onClick={() => setShowSaveDialog(false)} role="dialog" aria-modal="true" aria-labelledby="save-dialog-title">
					<div className={styles.dialog} onClick={e => e.stopPropagation()}>
						<h3 id="save-dialog-title" className={styles.dialogTitle}>Save Workspace</h3>
						<input
							ref={saveDialogInputRef}
							type="text"
							className={styles.dialogInput}
							value={newWorkspaceName}
							onChange={e => setNewWorkspaceName(e.target.value)}
							onKeyDown={handleDialogKeyDown}
							placeholder="Workspace name"
							autoFocus
						/>
						<div className={styles.dialogActions}>
							<button className={`${styles.button} ${styles.cancelButton}`} onClick={() => setShowSaveDialog(false)}>
                Cancel
							</button>
							<button className={`${styles.button} ${styles.confirmButton}`} onClick={handleSave}>
                Save
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Load Dialog */}
			{showLoadDialog && (
				<div className={styles.dialogOverlay} onClick={() => setShowLoadDialog(false)} role="dialog" aria-modal="true" aria-labelledby="load-dialog-title">
					<div className={styles.dialog} onClick={e => e.stopPropagation()}>
						<h3 id="load-dialog-title" className={styles.dialogTitle}>Load Workspace</h3>
						<div className={styles.workspaceList}>
							{workspaces.length === 0 ? (
								<p className={styles.emptyList}>No saved workspaces</p>
							) : (
								workspaces.map(ws => (
									<button
										key={ws.id}
										className={`${styles.workspaceItem} ${selectedWorkspaceId === ws.id ? styles.selected : ""}`}
										onClick={() => setSelectedWorkspaceId(ws.id)}
										onDoubleClick={handleLoad}
									>
										<span className={styles.workspaceItemName}>{ws.name}</span>
										<span className={styles.workspaceItemDate}>
											{new Date(ws.updatedAt).toLocaleString()}
										</span>
										{onDelete && (
											<button
												className={styles.deleteButton}
												onClick={e => { e.stopPropagation(); handleDelete(ws.id); }}
												aria-label={`Delete ${ws.name}`}
												title={`Delete ${ws.name}`}
											>
                        ×
											</button>
										)}
									</button>
								))
							)}
						</div>
						<div className={styles.dialogActions}>
							<button className={`${styles.button} ${styles.cancelButton}`} onClick={() => setShowLoadDialog(false)}>
                Cancel
							</button>
							<button
								className={`${styles.button} ${styles.confirmButton} ${!selectedWorkspaceId ? styles.disabled : ""}`}
								onClick={handleLoad}
								disabled={!selectedWorkspaceId}
							>
                Load
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Import Dialog */}
			{showImportDialog && (
				// eslint-disable-next-line @typescript-eslint/no-unused-expressions
				<input
					ref={fileInputRef}
					type="file"
					accept=".json"
					className={styles.hiddenInput}
					onChange={handleImport}
					{...({ onCancel: () => setShowImportDialog(false) } as any)} // ARC-1-keep: legacy bridge
				/>
			)}

			<ConfirmDialog
				open={!!pendingDelete}
				message={`Delete workspace "${pendingDelete?.name ?? ""}"?`}
				confirmLabel="Delete"
				cancelLabel="Cancel"
				variant="danger"
				onConfirm={async () => {
					if (pendingDelete && onDelete) {
						await onDelete(pendingDelete.id);
						setPendingDelete(null);
					}
				}}
				onCancel={() => setPendingDelete(null)}
			/>
		</div>
	);
};

WorkspaceToolbar.displayName = "WorkspaceToolbar";

export default WorkspaceToolbar;