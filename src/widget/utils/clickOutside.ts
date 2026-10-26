export function isClickOutside(
	element: HTMLElement | null,
	event: MouseEvent | PointerEvent
): boolean {
	if (!element) return true;
	return !event.composedPath().includes(element);
}
