import { forkRuntimeData } from "./mockAdapter";
export { forkRuntimeData };

export const extendedForkRuntimeData = [
	...forkRuntimeData,
	{
		date: new Date("2024-01-01T11:00:00Z"),
		open: 104,
		high: 107,
		low: 102,
		close: 105,
		volume: 1400,
		index: 2,
		dataIndex: 2,
	},
	{
		date: new Date("2024-01-01T12:00:00Z"),
		open: 105,
		high: 108,
		low: 103,
		close: 106,
		volume: 1500,
		index: 3,
		dataIndex: 3,
	},
];
