export function isCleanSmokeModeEnabled(search: string | undefined): boolean {
	const params = new URLSearchParams(search ?? "");
	return params.get("smoke") === "clean" || params.get("cleanSmoke") === "1";
}