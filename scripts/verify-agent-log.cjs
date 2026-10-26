"use strict";
const fs = require("node:fs");
const path = require("node:path");

const PLANNING = path.join(process.cwd(), ".planning");

function readJSONL(filePath) {
	const results = [];
	if (!fs.existsSync(filePath)) return results;
	const content = fs.readFileSync(filePath, "utf8");
	for (const line of content.split("\n")) {
		if (!line.trim()) continue;
		try {
			results.push(JSON.parse(line));
		} catch (e) {
			results.push({ _corrupt: line, _error: e.message });
		}
	}
	return results;
}

function scan() {
	const report = { slices: {}, totalEvents: 0, corruptLines: 0, slicesWithActivity: 0 };
	if (!fs.existsSync(PLANNING)) return report;
	for (const entry of fs.readdirSync(PLANNING, { withFileTypes: true })) {
		if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
		const slice = entry.name;
		const events = [
			...readJSONL(path.join(PLANNING, slice, ".inject-log.jsonl")),
			...readJSONL(path.join(PLANNING, slice, "ledger.jsonl")),
		];
		const corrupt = events.filter((e) => e._corrupt).length;
		report.corruptLines += corrupt;
		if (events.length > 0) {
			report.slicesWithActivity += 1;
			report.slices[slice] = {
				eventCount: events.length,
				corruptLines: corrupt,
				sessions: [...new Set(events.map((e) => e.sessionID).filter(Boolean))],
				phases: [...new Set(events.map((e) => e.phase).filter(Boolean))],
				tools: [...new Set(events.filter((e) => e.tool).map((e) => e.tool))],
				firstTS: Math.min(...events.map((e) => e.ts).filter(Boolean)),
				lastTS: Math.max(...events.map((e) => e.ts).filter(Boolean)),
			};
			report.totalEvents += events.length;
		}
	}
	return report;
}

const report = scan();
console.log(JSON.stringify(report, null, 2));
process.exit(report.corruptLines > 0 ? 1 : 0);
