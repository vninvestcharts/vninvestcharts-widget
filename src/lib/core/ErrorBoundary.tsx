import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
	fallback?: ReactNode;
	children: ReactNode;
	paneId: string;
}

interface State {
	hasError: boolean;
	error: Error | null;
}

export class PaneErrorBoundary extends Component<Props, State> {
	public state: State = {
		hasError: false,
		error: null
	};

	public static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		console.error(`[PaneErrorBoundary] Error in pane ${this.props.paneId}:`, error, errorInfo);
	}

	public render() {
		if (this.state.hasError) {
			return this.props.fallback || (
				<div style={{
					height: "100%",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					background: "rgba(220, 53, 69, 0.05)",
					color: "#dc3545",
					border: "1px dashed #dc3545",
					fontSize: "12px",
					padding: "10px",
					boxSizing: "border-box"
				}}>
					<span>Lỗi hiển thị Pane {this.props.paneId}. Chi tiết: {this.state.error?.message}</span>
				</div>
			);
		}

		return this.props.children;
	}
}
