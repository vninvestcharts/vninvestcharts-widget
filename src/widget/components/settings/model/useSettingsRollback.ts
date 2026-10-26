/**
 * P1-1 (C1a): nút "Cancel" của Settings modal phải **HOÀN TÁC THẬT**.
 *
 * VÌ SAO: settings trong modal áp **live** (mỗi lần đổi control đã ghi composite +
 * broadcast `vnsc-settings-sync`) ⇒ trước đây `SettingsModal.tsx:391-395` cho CẢ
 * "Cancel" và "Apply" cùng gọi `onClose` ⇒ bấm "Cancel" vẫn **giữ** thay đổi ⇒ nhãn sai.
 * Không có đường thoát cho người dùng lỡ tay ⇒ đây là lỗi **hành vi**, không phải lỗi chữ.
 *
 * Cơ chế: chụp snapshot lúc modal mount (state lúc mở) ⇒ khi Cancel, ghi lại từng
 * section về đúng giá trị gốc (qua `updateSection` ⇒ ghi composite + broadcast ⇒
 * tầng widget (`useWidgetSettings.ts:495-510`) cũng quay lại).
 */
import { useCallback, useEffect, useRef } from "react";
import type { ChartSettingsState } from "./chartSettingsSchema";

type UpdateSection = (section: never, patch: never) => void;

export function useSettingsRollback(
	settings: ChartSettingsState,
	updateSection: UpdateSection,
	onCancel: () => void,
): () => void {
	const snapshotRef = useRef<ChartSettingsState | null>(null);

	// Modal mount 1 lần cho 1 lần mở ⇒ effect đầu tiên chụp đúng state lúc mở.
	useEffect(() => {
		if (snapshotRef.current === null) snapshotRef.current = settings;
	}, [settings]);

	return useCallback(() => {
		const snap = snapshotRef.current;
		if (snap) {
			for (const [section, original] of Object.entries(snap)) {
				if (section === "version" || original === undefined) continue;
				updateSection(section as never, original as never);
			}
		}
		snapshotRef.current = null;
		onCancel();
	}, [onCancel, updateSection]);
}
