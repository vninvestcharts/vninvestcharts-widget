import { useState, useEffect } from "react";
import type { DrawingObject, DrawingToolType } from "@vninvestcharts/engine-drawing";
import { resolveDrawingStyle } from "@vninvestcharts/engine-drawing";
import { listTemplates, saveTemplate, deleteTemplate, loadTemplateData } from "@vninvestcharts/engine-drawing";
import styles from "../../styles/drawing-dock.module.css";

export interface TemplateManagerLabels {
	loadTemplate?: string;
	saveAs?: string;
	deleteTemplate?: string;
	load?: string;
	save?: string;
	delete?: string;
	namePlaceholder?: string;
}

export interface TemplateManagerPanelProps {
	drawingType: DrawingToolType;
	drawing?: DrawingObject;
	locked?: boolean;
	onUpdate?: (updates: Partial<DrawingObject>) => void;
	labels?: TemplateManagerLabels;
}

export default function TemplateManagerPanel({
	drawingType,
	drawing,
	locked = false,
	onUpdate,
	labels = {},
}: TemplateManagerPanelProps) {
	const [templatesList, setTemplatesList] = useState<string[]>([]);
	const [selectedTemplate, setSelectedTemplate] = useState("");
	const [newTemplateName, setNewTemplateName] = useState("");

	useEffect(() => {
		if (drawing) {
			setTemplatesList(listTemplates(drawing.type));
			setSelectedTemplate("");
			setNewTemplateName("");
		}
	}, [drawing?.type, drawing?.id]);

	const handleSaveTemplate = () => {
		if (!drawing) return;
		const name = newTemplateName.trim();
		if (!name) return;
		saveTemplate(drawing.type, name, resolveDrawingStyle(drawing), { segmentStyles: drawing.segmentStyles, segmentVisible: drawing.segmentVisible });
		const updatedList = listTemplates(drawing.type);
		setTemplatesList(updatedList);
		setSelectedTemplate(name);
		setNewTemplateName("");
	};

	const handleDeleteTemplate = () => {
		if (!drawing || !selectedTemplate) return;
		deleteTemplate(drawing.type, selectedTemplate);
		const updatedList = listTemplates(drawing.type);
		setTemplatesList(updatedList);
		setSelectedTemplate("");
	};

	const handleLoadTemplate = () => {
		if (!drawing || !selectedTemplate || !onUpdate) return;
		const template = loadTemplateData(drawing.type, selectedTemplate);
		if (template) {
			onUpdate({ style: { ...drawing.style, ...template.style }, ...(template.segmentStyles ? { segmentStyles: template.segmentStyles } : {}), ...(template.segmentVisible ? { segmentVisible: template.segmentVisible } : {}) });
		}
	};

	return (
		<div className={styles.templateManager}>
			<div className={styles.templateGroup}>
				<label htmlFor="template-manager-select" className={styles.templateLabel}>
					{labels.loadTemplate ?? "Load Template"}
				</label>
				<div className={styles.templateRow}>
					<select
						id="template-manager-select"
						className={styles.templateSelect}
						value={selectedTemplate}
						onChange={(e) => setSelectedTemplate(e.target.value)}
					>
						<option value="">-- Select template --</option>
						{templatesList.map((name) => (
							<option key={name} value={name}>{name}</option>
						))}
					</select>
					<button type="button" className={styles.templateButton} onClick={handleLoadTemplate} disabled={!selectedTemplate || locked}>
						{labels.load ?? "Load"}
					</button>
					<button type="button" className={styles.templateButtonDanger} onClick={handleDeleteTemplate} disabled={!selectedTemplate || locked}>
						{labels.delete ?? "Delete"}
					</button>
				</div>
			</div>
			<div className={styles.templateDivider} />
			<div className={styles.templateGroup}>
				<label htmlFor="template-manager-new-name" className={styles.templateLabel}>
					{labels.saveAs ?? "Save As"}
				</label>
				<div className={styles.templateRow}>
					<input
						id="template-manager-new-name"
						type="text"
						className={styles.templateInput}
						placeholder={labels.namePlaceholder ?? "New template name..."}
						value={newTemplateName}
						disabled={locked}
						onChange={(e) => setNewTemplateName(e.target.value)}
					/>
					<button type="button" className={styles.templateButton} onClick={handleSaveTemplate} disabled={!newTemplateName.trim() || locked}>
						{labels.save ?? "Save"}
					</button>
				</div>
			</div>
		</div>
	);
}
