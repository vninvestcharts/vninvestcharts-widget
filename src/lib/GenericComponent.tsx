import React, { Component, type CSSProperties } from "react";
import PropTypes from "prop-types";
import { isNotDefined, isDefined, functor, identity, noop } from "./utils";
import StockChartContext, { type StockChartContextValue } from "./StockChartContext";
import type { AnyRecord, CanvasContexts } from "./types";

export function getAxisCanvas(contexts: CanvasContexts | undefined) {
	return contexts?.axes;
}

export function getMouseCanvas(contexts: CanvasContexts | undefined) {
	return contexts?.mouseCoord;
}

export interface GenericComponentProps {
	svgDraw: (moreProps: AnyRecord) => React.ReactNode;
	canvasDraw?: (ctx: CanvasRenderingContext2D, moreProps: AnyRecord) => void;
	drawOn: string[];
	clip?: boolean;
	edgeClip?: boolean;
	interactiveCursorClass?: string;
	selected?: boolean;
	enableDragOnHover?: boolean;
	disablePan?: boolean;
	shouldDisablePanOnMouseDown?: (event: unknown) => boolean;
	canvasToDraw?: (contexts: CanvasContexts | undefined) => CanvasRenderingContext2D | undefined;
	allowAnyChart?: boolean;
	isHover?: (moreProps: AnyRecord, e?: unknown) => boolean;
	onClick?: (moreProps: AnyRecord, e?: unknown) => void;
	onClickWhenHover?: (moreProps: AnyRecord, e?: unknown) => void;
	onClickOutside?: (moreProps: AnyRecord, e?: unknown) => void;
	onPan?: (moreProps: AnyRecord, e?: unknown) => void;
	onPanEnd?: (moreProps: AnyRecord, e?: unknown) => void;
	onDragStart?: (moreProps: AnyRecord, e?: unknown) => void;
	onDrag?: (moreProps: AnyRecord, e?: unknown) => void;
	onDragComplete?: (moreProps: AnyRecord, e?: unknown) => void;
	onDoubleClick?: (moreProps: AnyRecord, e?: unknown) => void;
	onDoubleClickWhenHover?: (moreProps: AnyRecord, e?: unknown) => void;
	onContextMenu?: (moreProps: AnyRecord, e?: unknown) => void;
	onContextMenuWhenHover?: (moreProps: AnyRecord, e?: unknown) => void;
	onMouseMove?: (moreProps: AnyRecord, e?: unknown) => void;
	onMouseDown?: (moreProps: AnyRecord, e?: unknown) => void;
	onHover?: (moreProps: AnyRecord, e?: unknown) => void;
	onUnHover?: (moreProps: AnyRecord, e?: unknown) => void;
	chartId?: number | string;
	morePropsDecorator?: (moreProps: AnyRecord) => AnyRecord;
}

interface GenericComponentState {
	updateCount: number;
}

const aliases: Record<string, string> = {
	mouseleave: "mousemove",
	panend: "pan",
	pinchzoom: "pan",
	mousedown: "mousemove",
	click: "mousemove",
	contextmenu: "mousemove",
	dblclick: "mousemove",
	dragstart: "drag",
	dragend: "drag",
	dragcancel: "drag",
};

class GenericComponent extends Component<GenericComponentProps, GenericComponentState> {
	// We will use the static contextType for the main StockChartContext
	static contextType = StockChartContext;
	// NOTE: React 19 no longer runs propTypes validation at runtime.
	// PropTypes kept for documentation and IDE tooling only.
	static propTypes = {
		svgDraw: PropTypes.func.isRequired,
		canvasDraw: PropTypes.func,
		drawOn: PropTypes.array.isRequired,
		clip: PropTypes.bool.isRequired,
		edgeClip: PropTypes.bool.isRequired,
		interactiveCursorClass: PropTypes.string,
		selected: PropTypes.bool.isRequired,
		enableDragOnHover: PropTypes.bool.isRequired,
		disablePan: PropTypes.bool.isRequired,
		shouldDisablePanOnMouseDown: PropTypes.func,
		canvasToDraw: PropTypes.func.isRequired,
		isHover: PropTypes.func,
		onClick: PropTypes.func,
		onClickWhenHover: PropTypes.func,
		onClickOutside: PropTypes.func,
		onPan: PropTypes.func,
		onPanEnd: PropTypes.func,
		onDragStart: PropTypes.func,
		onDrag: PropTypes.func,
		onDragComplete: PropTypes.func,
		onDoubleClick: PropTypes.func,
		onDoubleClickWhenHover: PropTypes.func,
		onContextMenu: PropTypes.func,
		onContextMenuWhenHover: PropTypes.func,
		onMouseMove: PropTypes.func,
		onMouseDown: PropTypes.func,
		onHover: PropTypes.func,
		onUnHover: PropTypes.func,
		chartId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
	};

	static defaultProps = {
		svgDraw: functor(null),
		canvasToDraw: (contexts: CanvasContexts | undefined) => contexts?.mouseCoord,
		clip: true,
		edgeClip: false,
		selected: false,
		disablePan: false,
		enableDragOnHover: false,
		onClickWhenHover: noop,
		onClickOutside: noop,
		onDragStart: noop,
		onMouseMove: noop,
		onMouseDown: noop,
	} satisfies Partial<GenericComponentProps>;
	declare context: StockChartContextValue;
	declare moreProps: AnyRecord;
	declare suscriberId: number;
	declare dragInProgress: boolean | undefined;
	declare someDragInProgress: boolean | undefined;
	declare iSetTheCursorClass: boolean | undefined;
	declare evaluationInProgress: boolean | undefined;

	constructor(props: GenericComponentProps) {
		super(props);
		this.drawOnCanvas = this.drawOnCanvas.bind(this);
		this.getMoreProps = this.getMoreProps.bind(this);
		this.listener = this.listener.bind(this);
		this.draw = this.draw.bind(this);
		this.updateMoreProps = this.updateMoreProps.bind(this);
		this.evaluateType = this.evaluateType.bind(this);
		this.isHover = this.isHover.bind(this);
		this.preCanvasDraw = this.preCanvasDraw.bind(this);
		this.postCanvasDraw = this.postCanvasDraw.bind(this);
		this.getPanConditions = this.getPanConditions.bind(this);
		this.shouldTypeProceed = this.shouldTypeProceed.bind(this);
		this.preEvaluate = this.preEvaluate.bind(this);

		this.moreProps = {};
		this.state = { updateCount: 0 };
	}

	componentDidMount() {
		const { subscribe, generateSubscriptionId } = this.context;
		const { chartId } = this.props; // ChartId might be passed as prop now
		const { clip = true, edgeClip = false } = this.props;

		this.suscriberId = generateSubscriptionId();
		subscribe(this.suscriberId, {
			chartId, clip, edgeClip,
			listener: this.listener,
			draw: this.draw,
			getPanConditions: this.getPanConditions,
		});

		this.updateMorePropsFromContext(this.context);
		this.componentDidUpdate({} as Readonly<Partial<GenericComponentProps>>);
	}

	componentWillUnmount() {
		const { unsubscribe, setCursorClass } = this.context;
		unsubscribe(this.suscriberId);
		if (this.iSetTheCursorClass) {
			setCursorClass?.(null);
		}
	}

	componentDidUpdate(prevProps: Readonly<Partial<GenericComponentProps>> = {}) {
		const { chartCanvasType, setCursorClass } = this.context;
		const { canvasDraw, selected = false, interactiveCursorClass } = this.props;

		if (prevProps.selected !== selected) {
			if (selected && this.moreProps.hovering) {
				this.iSetTheCursorClass = true;
				setCursorClass?.(interactiveCursorClass);
			} else {
				this.iSetTheCursorClass = false;
				setCursorClass?.(null);
			}
		}

		if (isDefined(canvasDraw) && !this.evaluationInProgress && chartCanvasType !== "svg") {
			this.updateMoreProps(this.moreProps);
			// DT-22: Skip the immediate draw when moreProps.xScale is stale (e.g. after a zoom
			// setState in ChartCanvas). ChartCanvas.componentDidUpdate fires *after* all children
			// and will issue __sync__ (updating moreProps.xScale) then clearThreeCanvas + draw,
			// so we must not paint with the old scale here or drawings will flash at the wrong pos.
			const contextXScale = this.context.xScale;
			if (!contextXScale || this.moreProps.xScale === contextXScale) {
				this.drawOnCanvas();
			}
		}
	}

	updateMorePropsFromContext(context: StockChartContextValue) {
		const { xScale, plotData, chartConfig, getMutableState, margin } = context;
		this.moreProps = {
			...this.moreProps,
			...getMutableState?.(),
			xScale, plotData, chartConfig, margin
		};
	}

	updateMoreProps(moreProps: AnyRecord) {
		Object.keys(moreProps).forEach(key => {
			this.moreProps[key] = moreProps[key];
		});
	}

	shouldTypeProceed(_type: string, _moreProps: AnyRecord) { return true; }
	preEvaluate(_type?: string, _moreProps?: AnyRecord, _e?: unknown) {}

	listener(type: string, moreProps: AnyRecord, state: unknown, e: unknown) {
		if (isDefined(moreProps)) {
			this.updateMoreProps(moreProps);
		}
		// Internal moreProps sync — only update cache, skip event processing and SVG re-renders.
		// Using a regular event type here would trigger forceUpdate() causing flicker.
		if (type === "__sync__") return;
		this.evaluationInProgress = true;
		this.evaluateType(type, e);
		this.evaluationInProgress = false;

		if (isDefined(this.props.svgDraw) && this.props.drawOn.indexOf(aliases[type] || type) > -1) {
			this.forceUpdate();
		}
	}

	evaluateType(type: string, e: unknown) {
		const newType = aliases[type] || type;
		const proceed = this.props.drawOn.indexOf(newType) > -1;
		if (!proceed) return;

		this.preEvaluate(type, this.moreProps, e);
		if (!this.shouldTypeProceed(type, this.moreProps)) return;

		const { setCursorClass, amIOnTop } = this.context;

		switch (type) {
			case "zoom":
			case "mouseenter":
				break;
			case "mouseleave": {
				this.moreProps.hovering = false;
				this.props.onUnHover?.(this.getMoreProps(), e);
				break;
			}
			case "contextmenu": {
				this.props.onContextMenu?.(this.getMoreProps(), e);
				if (this.moreProps.hovering) this.props.onContextMenuWhenHover?.(this.getMoreProps(), e);
				break;
			}
			case "mousedown": {
				this.props.onMouseDown?.(this.getMoreProps(), e);
				break;
			}
			case "click": {
				const moreProps = this.getMoreProps();
				if (this.moreProps.hovering) this.props.onClickWhenHover?.(moreProps, e);
				else this.props.onClickOutside?.(moreProps, e);
				this.props.onClick?.(moreProps, e);
				break;
			}
			case "mousemove": {
				const prevHover = this.moreProps.hovering;
				this.moreProps.hovering = this.isHover(e);

				if (this.moreProps.hovering && !this.props.selected && amIOnTop?.(this.suscriberId) && isDefined(this.props.onHover)) {
					setCursorClass?.("vninvestcharts-widget-pointer-cursor");
					this.iSetTheCursorClass = true;
				} else if (this.moreProps.hovering && this.props.selected && amIOnTop?.(this.suscriberId)) {
					setCursorClass?.(this.props.interactiveCursorClass);
					this.iSetTheCursorClass = true;
				} else if (prevHover && !this.moreProps.hovering && this.iSetTheCursorClass) {
					this.iSetTheCursorClass = false;
					setCursorClass?.(null);
				}

				const moreProps = this.getMoreProps();
				if (this.moreProps.hovering && !prevHover) this.props.onHover?.(moreProps, e);
				if (prevHover && !this.moreProps.hovering) this.props.onUnHover?.(moreProps, e);
				this.props.onMouseMove?.(moreProps, e);
				break;
			}
			case "dblclick": {
				const moreProps = this.getMoreProps();
				this.props.onDoubleClick?.(moreProps, e);
				if (this.moreProps.hovering) this.props.onDoubleClickWhenHover?.(moreProps, e);
				break;
			}
			case "pan": {
				this.moreProps.hovering = false;
				this.props.onPan?.(this.getMoreProps(), e);
				break;
			}
			case "panend": {
				this.props.onPanEnd?.(this.getMoreProps(), e);
				break;
			}
			case "dragstart": {
				if (this.getPanConditions().draggable) {
					if (amIOnTop?.(this.suscriberId)) {
						this.dragInProgress = true;
						this.props.onDragStart?.(this.getMoreProps(), e);
					}
				}
				this.someDragInProgress = true;
				break;
			}
			case "drag": {
				if (this.dragInProgress) this.props.onDrag?.(this.getMoreProps(), e);
				break;
			}
			case "dragend": {
				if (this.dragInProgress) this.props.onDragComplete?.(this.getMoreProps(), e);
				this.dragInProgress = false;
				this.someDragInProgress = false;
				break;
			}
		}
	}

	isHover(e: unknown) {
		return this.props.isHover?.(this.getMoreProps(), e) ?? false;
	}

	getPanConditions() {
		const draggable = !!(this.props.selected && this.moreProps.hovering) || (this.props.enableDragOnHover && this.moreProps.hovering);
		return {
			draggable,
			panEnabled: !this.props.disablePan,
			shouldDisablePanOnMouseDown: this.props.shouldDisablePanOnMouseDown,
		};
	}

	draw({ trigger, force }: { trigger?: string; force?: boolean } = { force: false }) {
		const type = trigger ? (aliases[trigger] || trigger) : undefined;
		const proceed = type ? this.props.drawOn.indexOf(type) > -1 : false;
		if (proceed || this.props.selected || force) {
			const { chartCanvasType } = this.context;
			const { canvasDraw } = this.props;
			if (isNotDefined(canvasDraw) || chartCanvasType === "svg") {
				this.setState(({ updateCount }) => ({ updateCount: updateCount + 1 }));
			} else {
				this.drawOnCanvas();
			}
		}
	}

	getMoreProps(): AnyRecord {
		const { xScale, plotData, chartConfig, morePropsDecorator, xAccessor, displayXAccessor, width, height, fullData, margin } = this.context;
		const { chartId } = this.props;

		const moreProps = {
			xScale, plotData, chartConfig,
			xAccessor, displayXAccessor,
			width, height,
			chartId,
			fullData,
			margin,
			...this.moreProps,
		};
		return (morePropsDecorator || identity)(moreProps);
	}

	preCanvasDraw(_ctx: CanvasRenderingContext2D, _moreProps: AnyRecord) {}
	postCanvasDraw(_ctx: CanvasRenderingContext2D, _moreProps: AnyRecord) {}

	drawOnCanvas() {
		const { canvasDraw, canvasToDraw = (contexts: CanvasContexts | undefined) => contexts?.mouseCoord } = this.props;
		const { getCanvasContexts = () => undefined } = this.context;
		const moreProps = this.getMoreProps();
		const ctx = canvasToDraw(getCanvasContexts());
		if (!ctx) return;

		this.preCanvasDraw(ctx, moreProps);
		canvasDraw?.(ctx, moreProps);
		this.postCanvasDraw(ctx, moreProps);
	}

	render() {
		const { chartCanvasType } = this.context;
		const { chartId, canvasDraw, clip, svgDraw } = this.props;
		if (isDefined(canvasDraw) && chartCanvasType !== "svg") return null;

		const suffix = isDefined(chartId) ? "-" + chartId : "";
		const style: CSSProperties | undefined = clip ? { clipPath: `url(#chart-area-clip${suffix})` } : undefined;
		return <g style={style}>{svgDraw(this.getMoreProps())}</g>;
	}

}

export default GenericComponent;
