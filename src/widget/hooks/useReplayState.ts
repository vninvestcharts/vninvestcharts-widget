import { useCallback, useEffect, useRef, useState } from "react";
import { type EnrichedDatum } from "../../lib/core/calculators/types";
import { BarReplayController, REPLAY_SPEEDS, type ReplaySpeed } from "../../lib/core/replay/BarReplayController";

export interface ReplayState {
  playing: boolean;
  speed: number;
  currentBar: number;
  currentBarTimestamp: number | undefined;
  totalBars: number;
  replayData: readonly EnrichedDatum[] | undefined;
  /** A6: true from the first replay action until Stop; Pause never clears it. */
  sessionActive: boolean;
  /** A6: increments on Stop/Rewind/Play-at-end so owners reset before feeding. */
  sessionEpoch: number;
  replayActive: boolean;
  onReplayPlay: () => void;
  onReplayPause: () => void;
  onReplayStop: () => void;
  onReplayStepForward: () => void;
  onReplayStepBack: () => void;
  onReplayRewind: () => void;
  onReplaySpeedChange: (speed: number) => void;
  onReplaySeek: (barIndex: number) => void;
  onReplaySeekByDate: (date: Date | number) => void;
}

function speedToControllerSpeed(speed: number): ReplaySpeed {
	if (speed > 10) return "max";
	if ((REPLAY_SPEEDS as readonly number[]).includes(speed)) return speed as ReplaySpeed;
	return 1;
}

function speedFromControllerSpeed(speed: ReplaySpeed): number {
	return speed === "max" ? 10 : speed;
}

export interface UseReplayStateOptions {
	/** R3.1: fired on every controller index change (tick/seek/step). */
	onTick?: (barIndex: number, currentBarDate: number | undefined) => void;
	/** R3.1: bus-originated change — consume once and skip onTick (echo suppression). */
	suppressTickRef?: { current: boolean };
}

export function useReplayState(
	plotData: readonly EnrichedDatum[],
	options?: UseReplayStateOptions
): ReplayState {
	const [playing, setPlaying] = useState(false);
	const [speed, setSpeed] = useState(1);
	const [currentBar, setCurrentBar] = useState(() => Math.max(0, plotData.length - 1));
	const [totalBars, setTotalBars] = useState(plotData.length);
	const [sessionActive, setSessionActive] = useState(false);
	const [sessionEpoch, setSessionEpoch] = useState(0);

	const prevDataLengthRef = useRef(plotData.length);
	const currentBarRef = useRef(currentBar);
	const prevTickIndexRef = useRef<number | null>(null);
	const optionsRef = useRef(options);
	optionsRef.current = options;

	// Use a ref to track the subscribed controller instance so we only
	// subscribe once per controller lifetime.  This is immune to
	// StrictMode double-mount because we compare the controller reference
	// directly, not via useEffect cleanup.
	const controllerRef = useRef<BarReplayController<EnrichedDatum> | null>(null);
	const subControllerRef = useRef<BarReplayController<EnrichedDatum> | null>(null);

	// Lazily initialize controller (render-phase)
	if (!controllerRef.current) {
		controllerRef.current = new BarReplayController<EnrichedDatum>({
			allData: plotData,
			startIndex: plotData.length,
		});
	}

	// Subscribe to the current controller if we haven't already.
	// The subscribe() method calls the listener synchronously with the
	// current state; setState during render is safe in React 18 and is
	// the most reliable way to bridge a non-React event emitter to
	// React state without lifecycle races.
	if (controllerRef.current !== subControllerRef.current) {
		subControllerRef.current = controllerRef.current;
		const ctrl = controllerRef.current;
		ctrl.subscribe((state) => {
			setPlaying(state.isPlaying);
			setSpeed(speedFromControllerSpeed(state.speed));
			setCurrentBar(state.currentIndex - 1);
			currentBarRef.current = state.currentIndex - 1;
			setTotalBars(state.allData.length);
			// R3.1: broadcast every index change directly (no heartbeat wait).
			if (prevTickIndexRef.current !== null && prevTickIndexRef.current !== state.currentIndex) {
				const opts = optionsRef.current;
				if (opts?.suppressTickRef?.current) {
					opts.suppressTickRef.current = false;
				} else {
					const tickDatum = state.allData[state.currentIndex - 1] as EnrichedDatum | undefined;
					const tickDate = tickDatum?.date;
					opts?.onTick?.(state.currentIndex - 1, tickDate instanceof Date ? tickDate.getTime() : tickDate);
				}
			}
			prevTickIndexRef.current = state.currentIndex;
		});
	}

	// Sync data when plotData length changes.
	// Preserve the user's current position relative to the growing dataset in
	// BOTH playing and paused states. When paused after the user has chosen a
	// start bar (currentBar < end), the cursor must NOT snap back to the end on
	// every live-tick — otherwise the slice/cursor stays glued to the last bar
	// and the chosen start is lost. When currentBar is already at the end
	// (no replay in progress) the math keeps it at the end, so replayActive
	// stays false and the engine still receives the full dataset.
	if (plotData.length !== prevDataLengthRef.current) {
		const ctrl = controllerRef.current;
		const oldLength = prevDataLengthRef.current;
		prevDataLengthRef.current = plotData.length;
		if (ctrl) {
			const currentIndex = currentBarRef.current + 1;
			const delta = plotData.length - oldLength;
			const shiftedIndex = Math.max(1, Math.min(currentIndex + delta, plotData.length));
			ctrl.setData(plotData, shiftedIndex);
		}
	}

	// F-15: dispose controller on unmount to clear the setInterval timer + listeners,
	// preventing a leaked interval that keeps calling setState after unmount.
	// Nulling both refs makes this StrictMode-safe: the double-invoke unmount disposes
	// the instance, and the next render (StrictMode remount) lazily recreates +
	// re-subscribes a fresh controller instead of using the disposed one.
	useEffect(() => {
		return () => {
			controllerRef.current?.dispose();
			controllerRef.current = null;
			subControllerRef.current = null;
		};
	}, []);

	const replayActive = sessionActive;
	const replayData = sessionActive && totalBars > 0
		? plotData.slice(0, currentBar + 1)
		: undefined;

	const currentBarTimestamp = totalBars > 0 && currentBar >= 0 && currentBar < totalBars
		? plotData[currentBar]?.date?.getTime()
		: undefined;

	const onReplayPlay = useCallback(() => {
		const ctrl = controllerRef.current;
		if (!ctrl) return;
		const currentIdx = ctrl.getCurrentIndex();
		const dataLen = ctrl.getState().allData.length;
		const atEnd = currentIdx >= dataLen;
		if (atEnd && dataLen > 0) {
			ctrl.rewind();
			currentBarRef.current = 0;
			setCurrentBar(0);
			setSessionEpoch((epoch) => epoch + 1);
		}
		if (dataLen > 0) {
			setSessionActive(true);
		}
		ctrl.play();
	}, []);

	const onReplayPause = useCallback(() => {
		controllerRef.current?.pause();
	}, []);

	const onReplayStop = useCallback(() => {
		const ctrl = controllerRef.current;
		if (!ctrl) return;
		ctrl.pause();
		ctrl.jumpToIndex(Math.max(0, ctrl.getState().allData.length - 1));
		setSessionActive(false);
		setSessionEpoch((epoch) => epoch + 1);
	}, []);

	const onReplayStepForward = useCallback(() => {
		const ctrl = controllerRef.current;
		if (!ctrl) return;
		const before = ctrl.getCurrentIndex();
		ctrl.stepForward();
		if (ctrl.getCurrentIndex() !== before) {
			setSessionActive(true);
		}
	}, []);

	const onReplayStepBack = useCallback(() => {
		const ctrl = controllerRef.current;
		if (!ctrl) return;
		const before = ctrl.getCurrentIndex();
		ctrl.stepBack();
		if (ctrl.getCurrentIndex() !== before) {
			setSessionActive(true);
		}
	}, []);

	const onReplayRewind = useCallback(() => {
		const ctrl = controllerRef.current;
		if (!ctrl) return;
		ctrl.rewind();
		setSessionActive(true);
		setSessionEpoch((epoch) => epoch + 1);
	}, []);

	const onReplaySpeedChange = useCallback((newSpeed: number) => {
		controllerRef.current?.setSpeed(speedToControllerSpeed(newSpeed));
	}, []);

	const onReplaySeek = useCallback((barIndex: number) => {
		const ctrl = controllerRef.current;
		if (!ctrl) return;
		if (ctrl.isPlayingNow()) {
			ctrl.pause();
		}
		ctrl.jumpToIndex(barIndex);
		if (ctrl.getState().allData.length > 0) {
			setSessionActive(true);
		}
	}, []);

	const onReplaySeekByDate = useCallback((date: Date | number) => {
		const ctrl = controllerRef.current;
		if (!ctrl) return;
		if (ctrl.isPlayingNow()) {
			ctrl.pause();
		}
		ctrl.jumpToDate(date);
		if (ctrl.getState().allData.length > 0) {
			setSessionActive(true);
		}
	}, []);

	return {
		playing,
		speed,
		currentBar,
		currentBarTimestamp,
		totalBars,
		replayData,
		sessionActive,
		sessionEpoch,
		replayActive,
		onReplayPlay,
		onReplayPause,
		onReplayStop,
		onReplayStepForward,
		onReplayStepBack,
		onReplayRewind,
		onReplaySpeedChange,
		onReplaySeek,
		onReplaySeekByDate,
	};
}
