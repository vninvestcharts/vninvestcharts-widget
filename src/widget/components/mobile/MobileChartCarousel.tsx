import React, { useState, useRef, useEffect, useCallback } from "react";
import { GridChartRegistry } from "../../grid/GridChartRegistry";
import { MemoryBudgetManager } from "../../grid/MemoryBudgetManager";
import type { MultiChartConfig } from "../../VNInvestMultiCharts";
import styles from "../../styles/components/MobileChartCarousel.module.css";

interface MobileChartCarouselProps {
	charts: MultiChartConfig[];
	activeIndex: number;
	onChange: (index: number) => void;
	renderChart: (config: MultiChartConfig, isActive: boolean) => React.ReactNode;
	activeTool?: string;
}

export function MobileChartCarousel({
	charts,
	activeIndex,
	onChange,
	renderChart,
	activeTool = "cursor",
}: MobileChartCarouselProps) {
	const [translateX, setTranslateX] = useState(0);
	const [isDragging, setIsDragging] = useState(false);
	const startXRef = useRef(0);
	const currentXRef = useRef(0);
	const containerRef = useRef<HTMLDivElement>(null);

	const freezeAll = useCallback(() => {
		charts.forEach(c => {
			void MemoryBudgetManager.freezeContext(c.id);
		});
	}, [charts]);

	const thawActive = useCallback((activeIdx: number) => {
		charts.forEach((c, idx) => {
			if (idx === activeIdx) {
				void MemoryBudgetManager.thawContext(c.id);
			} else {
				void MemoryBudgetManager.freezeContext(c.id);
			}
		});
	}, [charts]);

	// Initialize freeze/thaw on mount / activeIndex change
	useEffect(() => {
		thawActive(activeIndex);
	}, [activeIndex, thawActive]);

	const EDGE_ZONE = 30; // only swipe from edges to preserve chart pan/zoom

	const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		if (charts.length <= 1) return;
		const rect = containerRef.current?.getBoundingClientRect();
		if (!rect) return;
		const relX = e.clientX - rect.left;
		// Only carousel-swipe from edge zones; center area reserved for chart pan/zoom
		if (relX > EDGE_ZONE && relX < rect.width - EDGE_ZONE) return;
		setIsDragging(true);
		startXRef.current = e.clientX;
		currentXRef.current = e.clientX;
		freezeAll();
		if (containerRef.current) {
			containerRef.current.style.transition = "none";
		}
	};

	const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		if (!isDragging) return;
		currentXRef.current = e.clientX;
		const deltaX = currentXRef.current - startXRef.current;
		const trackWidth = containerRef.current?.getBoundingClientRect().width ?? 375;
		const width = trackWidth / charts.length;
		const baseOffset = -activeIndex * width;
		setTranslateX(baseOffset + deltaX);
	};

	const handlePointerUp = () => {
		if (!isDragging) return;
		setIsDragging(false);
		const deltaX = currentXRef.current - startXRef.current;
		const trackWidth = containerRef.current?.getBoundingClientRect().width ?? 375;
		const width = trackWidth / charts.length;

		let nextIndex = activeIndex;
		const threshold = width * 0.2; // 20% width to trigger swipe

		if (deltaX < -threshold && activeIndex < charts.length - 1) {
			nextIndex = activeIndex + 1;
		} else if (deltaX > threshold && activeIndex > 0) {
			nextIndex = activeIndex - 1;
		}

		if (containerRef.current) {
			containerRef.current.style.transition = "transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
		}

		setTranslateX(-nextIndex * width);

		requestAnimationFrame(() => {
			onChange(nextIndex);
			thawActive(nextIndex);
		});
	};

	// Keep offset synchronized with activeIndex when not dragging
	useEffect(() => {
		if (isDragging) return;
		const trackWidth = containerRef.current?.getBoundingClientRect().width ?? 375;
		const width = trackWidth / charts.length;
		setTranslateX(-activeIndex * width);
	}, [activeIndex, isDragging, charts.length]);

	// Handle window resize
	useEffect(() => {
		const handleResize = () => {
			if (containerRef.current) {
				const trackWidth = containerRef.current.getBoundingClientRect().width;
				const width = trackWidth / charts.length;
				setTranslateX(-activeIndex * width);
			}
		};
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, [activeIndex, charts.length]);

	const isDrawingMode = activeTool !== "cursor" && activeTool !== "crosshair";

	return (
		<div className={styles.carouselContainer}>
			<div
				ref={containerRef}
				className={styles.carouselTrack}
				style={{
					transform: `translateX(${translateX}px)`,
					width: `${charts.length * 100}%`,
					pointerEvents: isDrawingMode ? "none" : "auto",
				}}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onPointerCancel={handlePointerUp}
			>
				{charts.map((chart, index) => (
					<div
						key={chart.id}
						className={styles.carouselSlide}
						style={{
							width: `${100 / charts.length}%`,
							pointerEvents: "auto",
						}}
					>
						{renderChart(chart, index === activeIndex)}
					</div>
				))}
			</div>

		</div>
	);
}
