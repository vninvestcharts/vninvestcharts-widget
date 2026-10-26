import { Component, type ErrorInfo, type ReactNode } from "react";

interface GridSlotErrorBoundaryProps {
	children: ReactNode;
	chartId: string;
}

interface GridSlotErrorBoundaryState {
	hasError: boolean;
}

export class GridSlotErrorBoundary extends Component<GridSlotErrorBoundaryProps, GridSlotErrorBoundaryState> {
	state: GridSlotErrorBoundaryState = { hasError: false };

	static getDerivedStateFromError() {
		return { hasError: true };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.warn(`[GridSlotErrorBoundary] Chart ${this.props.chartId} crashed:`, error.message, info.componentStack);
	}

	render() {
		if (this.state.hasError) {
			return (
				<div
					role="alert"
					style={{
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "center",
						minHeight: 200,
						width: "100%",
						padding: 16,
						borderRadius: 8,
						background: "rgba(185, 28, 28, 0.06)",
						color: "#991b1b",
						fontSize: 13,
						lineHeight: 1.5,
						textAlign: "center",
						gap: 8,
					}}
					data-chart-id={this.props.chartId}
				>
					<span style={{ fontSize: 24, opacity: 0.7 }}>⚠</span>
					<span>Chart failed to render</span>
					<span style={{ fontSize: 12, opacity: 0.6 }}>{this.props.chartId}</span>
				</div>
			);
		}

		return this.props.children;
	}
}
