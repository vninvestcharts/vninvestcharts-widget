export interface ChartTemplate {
	name: string;
	activeSeriesConfigs: any[];
	isDark: boolean;
	timeframe: string;
}

export class ChartSerializer {
	static saveTemplate(name: string, data: Omit<ChartTemplate, "name">) {
		const templates = this.getAllTemplates();
		templates.set(name, { name, ...data });
		localStorage.setItem("vninvestcharts-widget_templates", JSON.stringify(Array.from(templates.entries())));
	}

	static loadTemplate(name: string): ChartTemplate | null {
		const templates = this.getAllTemplates();
		return templates.get(name) || null;
	}

	static getAllTemplates(): Map<string, ChartTemplate> {
		try {
			const raw = localStorage.getItem("vninvestcharts-widget_templates");
			if (!raw) return new Map();
			const arr = JSON.parse(raw);
			return new Map(arr);
		} catch {
			return new Map();
		}
	}

	static deleteTemplate(name: string) {
		const templates = this.getAllTemplates();
		templates.delete(name);
		localStorage.setItem("vninvestcharts-widget_templates", JSON.stringify(Array.from(templates.entries())));
	}
}
