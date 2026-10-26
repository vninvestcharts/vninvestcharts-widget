import { useMemo, useState } from "react";

const ALL_ICONS = [
	"⭐", "🚀", "🔥", "💎", "⚡", "🎯", "📌", "📍", "🔔", "💡", "📈", "📉", "✅", "❌", "⚠️", "🚨", "💰", "📊", "🔍", "🛡️",
	"⬆️", "⬇️", "➡️", "⬅️", "↗️", "↘️", "↖️", "↙️", "🔼", "🔽", "⏫", "⏬", "▶️", "◀️", "⏭️", "⏮️", "🔄", "🔁", "🔂", "♻️",
	"1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟", "🔢", "#️⃣", "*️⃣",
	"🟢", "🔴", "🟡", "🔵", "🟣", "⚪", "⚫", "🟠", "🟤", "🔶", "🔷", "🔸", "🔹", "🟩", "🟥", "🟨", "🟦", "🟪",
	"❤️", "🧡", "💛", "💚", "💙", "💜", "🤍", "🖤", "❣️", "💕", "💞", "💓", "💗", "💖", "💝", "💘",
	"🏁", "🚩", "🎌", "🏳️", "🏴", "🏳️‍🌈", "🏴‍☠️",
	"💬", "💭", "🗯️", "💤", "💢", "💦", "💨", "🕳️", "💣", "🧨", "🎈", "🎉", "🎊", "🎁", "🏆", "🥇", "🥈", "🥉",
] as const;

const CATEGORIES: Record<string, readonly string[]> = {
	Emojis: ALL_ICONS.slice(0, 20),
	Trading: ALL_ICONS.slice(20, 40),
	Arrows: ALL_ICONS.slice(40, 60),
	Badges: ALL_ICONS.slice(60, 80),
};

export interface IconPickerPanelProps {
	value?: string;
	onSelect: (icon: string) => void;
}

export default function IconPickerPanel({ value, onSelect }: IconPickerPanelProps) {
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState<keyof typeof CATEGORIES>("Emojis");
	const [customUrl, setCustomUrl] = useState("");

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return CATEGORIES[category] ?? ALL_ICONS;
		return ALL_ICONS.filter((e) => e.toLowerCase().includes(q));
	}, [query, category]);

	return (
		<div style={{ display: "grid", gap: 8 }}>
			<input
				type="text"
				placeholder="Search icons…"
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				style={{ width: "100%", padding: "6px 8px", fontSize: 12, background: "var(--vnsc-bg-tertiary, #1a1a1a)", border: "1px solid var(--vnsc-border)", borderRadius: 4, color: "var(--vnsc-text-primary)", outline: "none" }}
			/>
			<div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
				{Object.keys(CATEGORIES).map((cat) => (
					<button
						key={cat}
						type="button"
						onClick={() => { setCategory(cat as keyof typeof CATEGORIES); setQuery(""); }}
						style={{ padding: "4px 8px", fontSize: 11, borderRadius: 999, border: "1px solid var(--vnsc-border)", background: category === cat ? "var(--vnsc-accent)" : "transparent", color: category === cat ? "#fff" : "var(--vnsc-text-secondary)", cursor: "pointer" }}
					>
						{cat}
					</button>
				))}
			</div>
			<div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, maxHeight: 180, overflowY: "auto", padding: 2 }}>
				{filtered.map((emoji) => (
					<button
						key={emoji}
						type="button"
						onClick={() => onSelect(emoji)}
						style={{ height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, border: `1px solid ${value === emoji ? "var(--vnsc-accent)" : "var(--vnsc-border)"}`, borderRadius: 4, background: value === emoji ? "var(--vnsc-bg-secondary)" : "var(--vnsc-bg-tertiary)", cursor: "pointer" }}
						title={emoji}
					>
						{emoji}
					</button>
				))}
			</div>
			<div style={{ display: "flex", gap: 6, alignItems: "center" }}>
				<input
					type="text"
					placeholder="Custom URL (SVG)"
					value={customUrl}
					onChange={(e) => setCustomUrl(e.target.value)}
					style={{ flex: 1, padding: "6px 8px", fontSize: 11, background: "var(--vnsc-bg-tertiary)", border: "1px solid var(--vnsc-border)", borderRadius: 4, color: "var(--vnsc-text-primary)", outline: "none" }}
				/>
				<button
					type="button"
					onClick={() => { if (customUrl.trim()) { try { new URL(customUrl); if (customUrl.includes("<script")) throw new Error("invalid"); onSelect(customUrl.trim()); setCustomUrl(""); } catch {} } }}
					style={{ padding: "6px 10px", fontSize: 11, borderRadius: 4, border: "1px solid var(--vnsc-border)", background: "transparent", color: "var(--vnsc-text-secondary)", cursor: "pointer" }}
				>
					Add
				</button>
			</div>
		</div>
	);
}
