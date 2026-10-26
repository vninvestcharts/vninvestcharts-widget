import { ChartHandle } from '@vninvestcharts/engine-react';

export class GridChartRegistry {
	private static instances = new Map<string, ChartHandle>();

	static register(id: string, handle: ChartHandle): void {
		this.instances.set(id, handle);
	}

	static unregister(id: string): void {
		this.instances.delete(id);
	}

	static get(id: string): ChartHandle | undefined {
		return this.instances.get(id);
	}

	static getAll(): ChartHandle[] {
		return Array.from(this.instances.values());
	}

	static clear(): void {
		this.instances.clear();
	}
}
