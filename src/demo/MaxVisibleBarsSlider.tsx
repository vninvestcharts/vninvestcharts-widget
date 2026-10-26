import { MAX_VISIBLE_BARS_OPTIONS } from "./demoSettings";
import { SettingsRangeSlider } from "./SettingsRangeSlider";

function formatMaxVisibleBarsLabel(value: number): string {
	return value >= 1000 ? `${value / 1000}k` : `${value}`;
}

export interface MaxVisibleBarsSliderProps {
	value: number;
	onChange: (next: number) => void;
	ariaLabel: string;
}

export function MaxVisibleBarsSlider({ value, onChange, ariaLabel }: MaxVisibleBarsSliderProps) {
	const selectedIndex = Math.max(0, MAX_VISIBLE_BARS_OPTIONS.indexOf(value as (typeof MAX_VISIBLE_BARS_OPTIONS)[number]));
	const selectedValue = MAX_VISIBLE_BARS_OPTIONS[selectedIndex] ?? MAX_VISIBLE_BARS_OPTIONS[0];

	return (
		<SettingsRangeSlider
			value={selectedIndex}
			min={0}
			max={MAX_VISIBLE_BARS_OPTIONS.length - 1}
			step={1}
			onChange={(nextIndex) => onChange(MAX_VISIBLE_BARS_OPTIONS[nextIndex] ?? selectedValue)}
			marks={MAX_VISIBLE_BARS_OPTIONS.map((option, index) => ({ value: index, label: formatMaxVisibleBarsLabel(option) }))}
			inputAriaLabel={ariaLabel}
			inputAriaValueText={formatMaxVisibleBarsLabel(selectedValue)}
			showCurrentIndicator={false}
		/>
	);
}