declare module "d3-format" {
	export function format(specifier: string): (value: number) => string;
}

declare module "d3-time-format" {
	export function timeFormat(specifier: string): (value: Date | number) => string;
	export function utcFormat(specifier: string): (value: Date | number) => string;
}