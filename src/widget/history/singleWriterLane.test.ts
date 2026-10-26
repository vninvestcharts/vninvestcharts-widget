import { describe, expect, it } from "vitest";
import { createSingleWriterLane } from "./singleWriterLane";

describe("createSingleWriterLane", () => {
	it("runs writers in submission order", async () => {
		const lane = createSingleWriterLane();
		const events: string[] = [];

		const first = lane.run(async () => {
			events.push("first:start");
			await Promise.resolve();
			events.push("first:end");
		});

		const second = lane.run(() => {
			events.push("second");
		});

		await Promise.all([first, second]);
		expect(events).toEqual(["first:start", "first:end", "second"]);
	});

	it("does not overlap writers", async () => {
		const lane = createSingleWriterLane();
		let activeWriters = 0;
		let maxConcurrent = 0;

		const runWriter = () => lane.run(async () => {
			activeWriters += 1;
			maxConcurrent = Math.max(maxConcurrent, activeWriters);
			await Promise.resolve();
			activeWriters -= 1;
		});

		await Promise.all([runWriter(), runWriter(), runWriter()]);
		expect(maxConcurrent).toBe(1);
	});

	it("continues queue after a failed writer", async () => {
		const lane = createSingleWriterLane();
		const events: string[] = [];

		const failing = lane.run(async () => {
			events.push("failing:start");
			throw new Error("writer failed");
		});

		const following = lane.run(() => {
			events.push("following");
			return "ok";
		});

		await expect(failing).rejects.toThrow("writer failed");
		await expect(following).resolves.toBe("ok");
		expect(events).toEqual(["failing:start", "following"]);
	});
});
