export interface SettingsRangeSliderMark {
	value: number;
	label: string;
}

export interface SettingsRangeSliderProps {
	value: number;
	min: number;
	max: number;
	step: number;
	onChange: (next: number) => void;
	marks?: readonly SettingsRangeSliderMark[];
	formatValue?: (value: number) => string;
	inputAriaLabel?: string;
	inputAriaValueText?: string;
	showCurrentIndicator?: boolean;
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function areValuesClose(a: number, b: number, tolerance: number) {
	return Math.abs(a - b) <= tolerance;
}

export function SettingsRangeSlider({
	value,
	min,
	max,
	step,
	onChange,
	marks,
	formatValue = (next) => `${next}`,
	inputAriaLabel,
	inputAriaValueText,
	showCurrentIndicator = true,
}: SettingsRangeSliderProps) {
	const clampedValue = clamp(value, min, max);
	const percent = max > min ? ((clampedValue - min) / (max - min)) * 100 : 0;
	const activeTolerance = Math.max(step / 2, Number.EPSILON * 10);
	const hasMarks = Boolean(marks && marks.length > 0);
	const hasActiveMark = Boolean(marks?.some((mark) => areValuesClose(mark.value, clampedValue, activeTolerance)));

	return (
		<div className="gc-settings-slider-shell">
			<input
				type="range"
				className="gc-settings-range"
				min={min}
				max={max}
				step={step}
				value={clampedValue}
				aria-label={inputAriaLabel}
				aria-valuetext={inputAriaValueText}
				onChange={(event) => {
					const nextValue = Number(event.target.value);
					onChange(clamp(Number.isFinite(nextValue) ? nextValue : clampedValue, min, max));
				}}
			/>
			{hasMarks ? (
				<div className="gc-settings-slider-steps" aria-hidden="true">
					{(marks ?? []).map((mark) => (
						<span
							key={mark.value}
							className={areValuesClose(mark.value, clampedValue, activeTolerance) ? "gc-settings-slider-steps__label gc-settings-slider-steps__label--active" : "gc-settings-slider-steps__label"}
							style={{ left: `${max > min ? ((mark.value - min) / (max - min)) * 100 : 0}%` }}
						>
							{mark.label}
						</span>
					))}
					{showCurrentIndicator && !hasActiveMark ? (
						<span className="gc-settings-slider-steps__current" style={{ left: `${percent}%` }}>
							{formatValue(clampedValue)}
						</span>
					) : null}
				</div>
			) : (
				<div className="gc-settings-slider-readout" aria-hidden="true">
					<span className={areValuesClose(clampedValue, min, activeTolerance) ? "gc-settings-slider-readout__edge gc-settings-slider-readout__edge--active" : "gc-settings-slider-readout__edge"}>{formatValue(min)}</span>
					<span className={areValuesClose(clampedValue, max, activeTolerance) ? "gc-settings-slider-readout__edge gc-settings-slider-readout__edge--active" : "gc-settings-slider-readout__edge"}>{formatValue(max)}</span>
					<span className="gc-settings-slider-readout__current" style={{ left: `${percent}%` }}>{formatValue(clampedValue)}</span>
				</div>
			)}
		</div>
	);
}
