import type { ContextType, ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { WidgetI18nContext } from "./context/WidgetI18nContext";

export interface WidgetErrorBoundaryProps {
	children: ReactNode;
	onError?: (error: Error, info: ErrorInfo) => void;
	/** BL-10: called after the user clicks retry (parent may remount content). */
	onRetry?: () => void;
}

interface WidgetErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
}

export class WidgetErrorBoundary extends Component<WidgetErrorBoundaryProps, WidgetErrorBoundaryState> {
	static contextType = WidgetI18nContext;
	declare context: ContextType<typeof WidgetI18nContext>;

	state: WidgetErrorBoundaryState = {
		hasError: false,
		error: null,
	};

	static getDerivedStateFromError(error: Error) {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		this.props.onError?.(error, info);
	}

	private handleRetry = () => {
		this.setState({ hasError: false, error: null });
		this.props.onRetry?.();
	};

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
						gap: 12,
						minHeight: 240,
						padding: 24,
						borderRadius: 16,
						background: "rgba(15, 23, 42, 0.04)",
						color: "#b91c1c",
						fontSize: 14,
						fontWeight: 600,
						textAlign: "center",
					}}
				>
					<span>{this.context.t("widget.error")}</span>
					<button
						type="button"
						onClick={this.handleRetry}
						style={{
							padding: "8px 16px",
							borderRadius: 8,
							border: "1px solid currentColor",
							background: "transparent",
							color: "inherit",
							fontSize: 13,
							fontWeight: 600,
							cursor: "pointer",
						}}
					>
						{this.context.t("error.retry")}
					</button>
				</div>
			);
		}

		return this.props.children;
	}
}
