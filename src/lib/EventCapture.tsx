import React, { forwardRef, useImperativeHandle, useRef, useState, useEffect } from "react";
import PropTypes from "prop-types";
import { select, pointer, pointers } from "d3-selection";

import {
	isDefined, mousePosition,
	d3Window,
	MOUSEMOVE, MOUSEUP,
	MOUSEENTER, MOUSELEAVE,
	TOUCHMOVE, TOUCHEND,
	noop
} from "./utils";
import { getCurrentCharts } from "./utils/ChartDataUtil";

// Z2-02 (ZOOM_TRADINGVIEW_PARITY): coalesce wheel events into a fixed window so
// the zoom input rate is capped regardless of device event frequency (trackpads emit
// 60-120Hz). rAF (~16ms) is intentionally NOT used: it still allows ~60 zoom/s.
// Exactly ONE onZoom fires per window (legacy zoomDir mapping preserved) —
// the old 1..WHEEL_MAX_STEPS stacked-zoom loop was a jank source (F-02).
const WHEEL_COALESCE_MS = 30;

const EventCapture = forwardRef<any, any>((props, ref) => {
	const {
		mouseMove,
		zoom,
		pan: panEnabled,
		focus: initialFocus,
		useCrossHairStyleCursor,
		width,
		height,
		chartConfig,
		xScale,
		disableInteraction,
		getAllPanConditions,
		onMouseMove,
		onMouseEnter,
		onMouseLeave,
		onZoom,
		onPinchZoom,
		onPinchZoomEnd,
		onPan,
		onPanEnd,
		onDragStart,
		onDrag,
		onDragComplete,
		onClick,
		onDoubleClick,
		onContextMenu,
		onMouseDown,
	} = props;

	const nodeRef = useRef<SVGRectElement | null>(null);

	// Instance variables as refs to avoid re-renders on every change
	const longPressTimerRef = useRef<any>(null);
	const longPressStartPosRef = useRef<{ x: number; y: number } | null>(null);
	const panEndTimeoutRef = useRef<any>(null);
	const clickedTimeoutRef = useRef<any>(null);

	const mouseInsideRef = useRef(false);
	const focusRef = useRef(initialFocus);
	const mouseInteractionRef = useRef(true);
	const panHappenedRef = useRef(false);
	const dragHappenedRef = useRef(false);
	const clickedRef = useRef(false);
	const lastNewPosRef = useRef<any>(null);
	const dxRef = useRef(0);

	// Phase 1: wheel-zoom accumulator (coalescing)
	const wheelAccumDeltaYRef = useRef(0);
	const wheelLastMouseRef = useRef<any>(null);
	const wheelTimerRef = useRef<any>(null);
	const dyRef = useRef(0);

	const panStartRef = useRef<any>(null);
	const dragStartPositionRef = useRef<any>(null);
	const dragInProgressRef = useRef(false);
	const pinchZoomStartRef = useRef<any>(null);

	// React state for properties that affect layout/classes
	const [panInProgress, setPanInProgress] = useState(false);
	const [cursorOverrideClass, setCursorOverrideClass] = useState<string | null>(null);

	// Imperative methods exposed to ChartCanvas
	useImperativeHandle(ref, () => ({
		setCursorClass(className: string | null | undefined) {
			if (className !== cursorOverrideClass) {
				setCursorOverrideClass(className ?? null);
			}
		}
	}));

	// Sync focus prop
	useEffect(() => {
		focusRef.current = initialFocus;
	}, [initialFocus]);

	// Cleanup timers and window-level listeners on unmount
	useEffect(() => {
		return () => {
			if (longPressTimerRef.current !== null) clearTimeout(longPressTimerRef.current);
			if (panEndTimeoutRef.current !== null) clearTimeout(panEndTimeoutRef.current);
			if (clickedTimeoutRef.current !== null) clearTimeout(clickedTimeoutRef.current);
			// Z2-05: a pending coalesced zoom must never fire after unmount.
			if (wheelTimerRef.current !== null) clearTimeout(wheelTimerRef.current);
			wheelTimerRef.current = null;
			wheelAccumDeltaYRef.current = 0;
			wheelLastMouseRef.current = null;

			if (nodeRef.current) {
				const win = d3Window(nodeRef.current);
				select(win)
					.on(MOUSEMOVE, null)
					.on(MOUSEUP, null)
					.on(TOUCHMOVE, null)
					.on(TOUCHEND, null);
			}
		};
	}, []);

	const shouldPan = () => {
		return panEnabled && onPan && isDefined(panStartRef.current);
	};

	const canPan = (e?: any) => {
		const panConditions = getAllPanConditions();
		const normalizedPanConditions = Array.isArray(panConditions) ? panConditions : [panConditions];

		const {
			panEnabled: panEnabledCondition,
			draggable: somethingSelected,
			panSuppressedByEvent,
		} = normalizedPanConditions.reduce((returnObj: any, a: any) => {
			return {
				draggable: returnObj.draggable || a.draggable,
				panEnabled: returnObj.panEnabled && a.panEnabled,
				panSuppressedByEvent: returnObj.panSuppressedByEvent || Boolean(e && a?.shouldDisablePanOnMouseDown?.(e)),
			};
		}, {
			draggable: false,
			panEnabled: panEnabled,
			panSuppressedByEvent: false,
		});

		return {
			panEnabled: panEnabledCondition,
			somethingSelected,
			panSuppressedByEvent,
		};
	};

	const queuePanEnd = () => {
		if (isDefined(panEndTimeoutRef.current)) {
			clearTimeout(panEndTimeoutRef.current);
		}
		panEndTimeoutRef.current = setTimeout(() => {
			handlePanEnd();
		}, 100);
	};

	const handlePanEnd = (e: any = undefined) => {
		if (isDefined(panStartRef.current)) {
			const { panStartXScale, chartsToPan } = panStartRef.current;

			const win = d3Window(nodeRef.current);
			select(win)
				.on(MOUSEMOVE, mouseInsideRef.current ? handleMouseMove : null)
				.on(MOUSEUP, null)
				.on(TOUCHMOVE, null)
				.on(TOUCHEND, null);

			if (panHappenedRef.current && panEnabled && onPanEnd) {
				const dx = dxRef.current;
				const dy = dyRef.current;

				dxRef.current = 0;
				dyRef.current = 0;
				onPanEnd(lastNewPosRef.current, panStartXScale, { dx, dy }, chartsToPan, e);
			}

			setPanInProgress(false);
			panStartRef.current = null;
		}
	};

	const handlePan = (e: any) => {
		if (shouldPan()) {
			panHappenedRef.current = true;

			const { panStartXScale, panOrigin, chartsToPan } = panStartRef.current;

			const mouseXY = mouseInteractionRef.current
				? pointer(e, nodeRef.current)
				: pointers(e, nodeRef.current)[0];

			lastNewPosRef.current = mouseXY;
			const dx = mouseXY[0] - panOrigin[0];
			const dy = mouseXY[1] - panOrigin[1];

			dxRef.current = dx;
			dyRef.current = dy;

			onPan(mouseXY, panStartXScale, { dx, dy }, chartsToPan, e);
		}
	};

	const handleMouseMove = (e: any) => {
		if (mouseInteractionRef.current && mouseMove && !panInProgress) {
			const newPos = pointer(e, nodeRef.current);
			onMouseMove(newPos, "mouse", e);
		}
	};

	const handleDrag = (e: any) => {
		if (onDrag) {
			dragHappenedRef.current = true;
			const mouseXY = pointer(e, nodeRef.current);
			onDrag({
				startPos: dragStartPositionRef.current,
				mouseXY
			}, e);
		}
	};

	const handleDragEnd = (e: any) => {
		const mouseXY = pointer(e, nodeRef.current);

		const win = d3Window(nodeRef.current);
		select(win)
			.on(MOUSEMOVE, mouseInsideRef.current ? handleMouseMove : null)
			.on(MOUSEUP, null);

		if (dragHappenedRef.current && onDragComplete) {
			onDragComplete({
				mouseXY
			}, e);
		}

		dragInProgressRef.current = false;
		mouseInteractionRef.current = true;
	};

	const handleMouseDown = (e: any) => {
		if (e.button !== 0) {
			return;
		}

		panHappenedRef.current = false;
		dragHappenedRef.current = false;
		focusRef.current = true;

		if (!panInProgress && mouseInteractionRef.current) {
			const mouseXY = mousePosition(e);
			const currentCharts = getCurrentCharts(chartConfig, mouseXY);
			const {
				panEnabled: panEnabledCondition,
				somethingSelected,
				panSuppressedByEvent,
			} = canPan(e);
			const pan = panEnabledCondition && !somethingSelected && !panSuppressedByEvent;

			if (pan) {
				panStartRef.current = {
					panStartXScale: xScale,
					panOrigin: mouseXY,
					chartsToPan: currentCharts
				};
				setPanInProgress(true);

				const win = d3Window(nodeRef.current);
				select(win)
					.on(MOUSEMOVE, handlePan)
					.on(MOUSEUP, handlePanEnd);
			} else {
				const win = d3Window(nodeRef.current);
				select(win)
					.on(MOUSEMOVE, handleMouseMove);

				if (somethingSelected) {
					dragInProgressRef.current = true;
					panStartRef.current = null;
					dragStartPositionRef.current = mouseXY;
					onDragStart({ startPos: mouseXY }, e);

					select(win)
						.on(MOUSEMOVE, handleDrag)
						.on(MOUSEUP, handleDragEnd);
				}
			}

			onMouseDown(mouseXY, currentCharts, e);
		}
		e.preventDefault();
	};

	const handleClick = (e: any) => {
		const mouseXY = pointer(e, nodeRef.current);

		if (!panHappenedRef.current && !dragHappenedRef.current) {
			if (clickedRef.current) {
				onDoubleClick(mouseXY, e);
				clickedRef.current = false;
			} else {
				onClick(mouseXY, e);
				clickedRef.current = true;
				if (clickedTimeoutRef.current) {
					clearTimeout(clickedTimeoutRef.current);
				}
				clickedTimeoutRef.current = setTimeout(() => {
					if (clickedRef.current) {
						clickedRef.current = false;
					}
				}, 400);
			}
		}
	};

	const handleRightClick = (e: any) => {
		e.stopPropagation();
		e.preventDefault();

		const mouseXY = mousePosition(e, nodeRef.current?.getBoundingClientRect());

		if (isDefined(panStartRef.current)) {
			const { panStartXScale, panOrigin, chartsToPan } = panStartRef.current;
			if (panHappenedRef.current) {
				onPanEnd(mouseXY, panStartXScale, panOrigin, chartsToPan, e);
			}
			const win = d3Window(nodeRef.current);
			select(win)
				.on(MOUSEMOVE, null)
				.on(MOUSEUP, null);

			setPanInProgress(false);
			panStartRef.current = null;
		}

		onContextMenu(mouseXY, e);
	};

	const handleTouchStart = (e: any) => {
		mouseInteractionRef.current = false;

		if (e.touches.length === 1) {
			panHappenedRef.current = false;
			const touchXY = pointer(e, nodeRef.current);
			onMouseMove(touchXY, "touch", e);

			if (panEnabled) {
				const currentCharts = getCurrentCharts(chartConfig, touchXY);
				panStartRef.current = {
					panStartXScale: xScale,
					panOrigin: touchXY,
					chartsToPan: currentCharts,
				};
				setPanInProgress(true);

				const win = d3Window(nodeRef.current);
				select(win)
					.on(TOUCHMOVE, handlePan, false)
					.on(TOUCHEND, handlePanEnd, false);
			}
		} else if (e.touches.length === 2) {
			if (panInProgress && panEnabled && onPanEnd) {
				const { panStartXScale, panOrigin, chartsToPan } = panStartRef.current;

				const win = d3Window(nodeRef.current);
				select(win)
					.on(MOUSEMOVE, mouseInsideRef.current ? handleMouseMove : null)
					.on(MOUSEUP, null)
					.on(TOUCHMOVE, handlePinchZoom, false)
					.on(TOUCHEND, handlePinchZoomEnd, false);

				const [touch1Pos, touch2Pos] = pointers(e, nodeRef.current);

				if (panHappenedRef.current && panEnabled && onPanEnd) {
					onPanEnd(lastNewPosRef.current, panStartXScale, panOrigin, chartsToPan, e);
				}

				setPanInProgress(false);
				pinchZoomStartRef.current = {
					xScale,
					touch1Pos,
					touch2Pos,
					range: xScale.range(),
					chartsToPan,
				};
			}
		}
	};

	const handleTouchMove = (e: any) => {
		const touchXY = pointer(e, nodeRef.current);
		onMouseMove(touchXY, "touch", e);
	};

	const handlePinchZoom = (e: any) => {
		const [touch1Pos, touch2Pos] = pointers(e, nodeRef.current);
		const { chartsToPan, ...initialPinch } = pinchZoomStartRef.current;

		if (zoom && onPinchZoom) {
			onPinchZoom(initialPinch, {
				touch1Pos,
				touch2Pos,
				xScale,
			}, e);
		}
	};

	const handlePinchZoomEnd = (e: any) => {
		const win = d3Window(nodeRef.current);
		select(win)
			.on(TOUCHMOVE, null)
			.on(TOUCHEND, null);

		const { chartsToPan, ...initialPinch } = pinchZoomStartRef.current;

		if (zoom && onPinchZoomEnd) {
			onPinchZoomEnd(initialPinch, e);
		}

		pinchZoomStartRef.current = null;
	};

	const handlePointerDown = (e: React.PointerEvent<SVGRectElement>) => {
		if (e.pointerType === "mouse") return;
		try {
			e.currentTarget.setPointerCapture(e.pointerId);
		} catch {
			// ignore in tests
		}

		if (longPressTimerRef.current !== null) {
			clearTimeout(longPressTimerRef.current);
		}
		longPressStartPosRef.current = { x: e.clientX, y: e.clientY };

		if (onContextMenu) {
			const eSnapshot = { clientX: e.clientX, clientY: e.clientY, pointerType: e.pointerType };
			longPressTimerRef.current = setTimeout(() => {
				if (longPressStartPosRef.current && nodeRef.current) {
					const rect = nodeRef.current.getBoundingClientRect();
					const mouseXY = [eSnapshot.clientX - rect.left, eSnapshot.clientY - rect.top];
					onContextMenu(mouseXY, eSnapshot);
				}
				longPressTimerRef.current = null;
				longPressStartPosRef.current = null;
			}, 500);
		}
	};

	const handlePointerMoveLongPress = (e: React.PointerEvent<SVGRectElement>) => {
		if (e.pointerType === "mouse" || !longPressStartPosRef.current) return;
		const dx = e.clientX - longPressStartPosRef.current.x;
		const dy = e.clientY - longPressStartPosRef.current.y;
		if (Math.hypot(dx, dy) > 10) {
			if (longPressTimerRef.current !== null) {
				clearTimeout(longPressTimerRef.current);
				longPressTimerRef.current = null;
			}
			longPressStartPosRef.current = null;
		}
	};

	const handlePointerUpLongPress = (_e: React.PointerEvent<SVGRectElement>) => {
		if (longPressTimerRef.current !== null) {
			clearTimeout(longPressTimerRef.current);
			longPressTimerRef.current = null;
		}
		longPressStartPosRef.current = null;
	};

	// Event bindings for element and window
	useEffect(() => {
		const element = nodeRef.current;
		if (!element) return;

		const handleEnter = (e: any) => {
			mouseInsideRef.current = true;
			if (!panInProgress && !dragInProgressRef.current) {
				const win = d3Window(element);
				select(win).on(MOUSEMOVE, handleMouseMove);
			}
			if (onMouseEnter) onMouseEnter(e);
		};

		const handleLeave = (e: any) => {
			mouseInsideRef.current = false;
			if (!panInProgress && !dragInProgressRef.current) {
				const win = d3Window(element);
				select(win).on(MOUSEMOVE, null);
			}
			if (onMouseLeave) onMouseLeave(e);
		};

		const handleWheel = (e: any) => {
			const yZoom = Math.abs(e.deltaY) > Math.abs(e.deltaX) && Math.abs(e.deltaY) > 0;
			const mouseXY = mousePosition(e);
			e.preventDefault();

			if (zoom && yZoom && !panInProgress) {
			// Z2-02 (D-Z03 v2): ONE onZoom per WHEEL_COALESCE_MS window — no step loop.
			// Legacy mapping preserved: scroll down (deltaY > 0) → zoomDir 1 → domain
			// expands (zoom out); scroll up → zoomDir -1 → zoom in. A fast fling no
			// longer fires up to WHEEL_MAX_STEPS stacked zooms (jank source, F-02).
				wheelAccumDeltaYRef.current += e.deltaY;
				wheelLastMouseRef.current = mouseXY;
				if (!wheelTimerRef.current) {
					wheelTimerRef.current = setTimeout(() => {
						wheelTimerRef.current = null;
						const totalDeltaY = wheelAccumDeltaYRef.current;
						wheelAccumDeltaYRef.current = 0;
						const lastMouseXY = wheelLastMouseRef.current;
						if (lastMouseXY == null || totalDeltaY === 0) return;
						const zoomDir = totalDeltaY > 0 ? 1 : -1;
						if (onZoom) {
							onZoom(zoomDir, lastMouseXY, e);
						}
					}, WHEEL_COALESCE_MS);
				}
				return;
			}
			if (focusRef.current) {
				if (shouldPan()) {
					const { panStartXScale, chartsToPan } = panStartRef.current;
					lastNewPosRef.current = mouseXY;
					panHappenedRef.current = true;

					dxRef.current += e.deltaX;
					dyRef.current += e.deltaY;
					const dxdy = { dx: dxRef.current, dy: dyRef.current };

					if (onPan) onPan(mouseXY, panStartXScale, dxdy, chartsToPan, e);
				} else {
					const currentCharts = getCurrentCharts(chartConfig, mouseXY);
					dxRef.current = 0;
					dyRef.current = 0;
					panStartRef.current = {
						panStartXScale: xScale,
						panOrigin: mouseXY,
						chartsToPan: currentCharts
					};
					setPanInProgress(true);
				}
				queuePanEnd();
			}
		};

		select(element)
			.on(MOUSEENTER, handleEnter)
			.on(MOUSELEAVE, handleLeave);

		element.addEventListener("wheel", handleWheel, { passive: false });

		return () => {
			select(element)
				.on(MOUSEENTER, null)
				.on(MOUSELEAVE, null);
			element.removeEventListener("wheel", handleWheel);
		};
	}, [panInProgress, chartConfig, xScale, zoom, onZoom, onPan, onMouseEnter, onMouseLeave]);

	const className = cursorOverrideClass != null
		? cursorOverrideClass
		: !useCrossHairStyleCursor ? "" : panInProgress
			? "vninvestcharts-widget-grabbing-cursor"
			: "vninvestcharts-widget-crosshair-cursor";

	const interactionProps = disableInteraction || {
		onMouseDown: handleMouseDown,
		onClick: handleClick,
		onContextMenu: handleRightClick,
		onTouchStart: handleTouchStart,
		onTouchMove: handleTouchMove,
		onPointerDown: handlePointerDown,
		onPointerMove: handlePointerMoveLongPress,
		onPointerUp: handlePointerUpLongPress,
		onPointerCancel: handlePointerUpLongPress,
	};

	return (
		<rect
			ref={nodeRef}
			className={className}
			width={width}
			height={height}
			style={{ opacity: 0, touchAction: "none" }}
			{...interactionProps}
		/>
	);
});

EventCapture.displayName = "EventCapture";

// NOTE: React 19 no longer runs propTypes validation at runtime.
// PropTypes kept for documentation and IDE tooling only.
(EventCapture as any).propTypes = {
	mouseMove: PropTypes.bool.isRequired,
	zoom: PropTypes.bool.isRequired,
	pan: PropTypes.bool.isRequired,
	panSpeedMultiplier: PropTypes.number.isRequired,
	focus: PropTypes.bool.isRequired,
	useCrossHairStyleCursor: PropTypes.bool.isRequired,

	width: PropTypes.number.isRequired,
	height: PropTypes.number.isRequired,
	chartConfig: PropTypes.array,
	xScale: PropTypes.func.isRequired,
	xAccessor: PropTypes.func.isRequired,
	disableInteraction: PropTypes.bool.isRequired,

	getAllPanConditions: PropTypes.func.isRequired,

	onMouseMove: PropTypes.func,
	onMouseEnter: PropTypes.func,
	onMouseLeave: PropTypes.func,
	onZoom: PropTypes.func,
	onPinchZoom: PropTypes.func,
	onPinchZoomEnd: PropTypes.func.isRequired,
	onPan: PropTypes.func,
	onPanEnd: PropTypes.func,
	onDragStart: PropTypes.func,
	onDrag: PropTypes.func,
	onDragComplete: PropTypes.func,

	onClick: PropTypes.func,
	onDoubleClick: PropTypes.func,
	onContextMenu: PropTypes.func,
	onMouseDown: PropTypes.func,
	children: PropTypes.node,
};

(EventCapture as any).defaultProps = {
	mouseMove: false,
	zoom: false,
	pan: false,
	panSpeedMultiplier: 1,
	focus: false,
	onDragComplete: noop,
	disableInteraction: false,
};

export default EventCapture;