import { describe, it, expect } from "vitest";
import { HistoryFetchQueue } from "../historyFetchQueue";

describe("HistoryFetchQueue", () => {
	it("enqueue rồi dequeue trả đúng job", () => {
		const q = new HistoryFetchQueue();
		q.enqueue({ key: "b:BTC:1m", side: "left", targetTs: 1000, priority: 1, generation: 0 });
		const job = q.dequeue(0);
		expect(job).not.toBeNull();
		expect(job!.key).toBe("b:BTC:1m");
		expect(job!.side).toBe("left");
	});

	it("dequeue trả null khi có inflight", () => {
		const q = new HistoryFetchQueue();
		q.enqueue({ key: "b:BTC:1m", side: "left", targetTs: 1000, priority: 1, generation: 0 });
		q.dequeue(0); // inflight now set
		q.enqueue({ key: "b:BTC:1m", side: "right", targetTs: 2000, priority: 1, generation: 0 });
		expect(q.dequeue(0)).toBeNull();
	});

	it("complete clear inflight, dequeue lại được", () => {
		const q = new HistoryFetchQueue();
		q.enqueue({ key: "b:BTC:1m", side: "left", targetTs: 1000, priority: 1, generation: 0 });
		const job = q.dequeue(0)!;
		q.enqueue({ key: "b:BTC:1m", side: "right", targetTs: 2000, priority: 1, generation: 0 });
		q.complete(job.id);
		expect(q.dequeue(0)).not.toBeNull();
	});

	it("clearGeneration không xóa generation khác", () => {
		const q = new HistoryFetchQueue();
		q.enqueue({ key: "b:BTC:1m", side: "left", targetTs: 1000, priority: 1, generation: 0 });
		q.enqueue({ key: "b:BTC:1m", side: "left", targetTs: 1000, priority: 1, generation: 1 });
		q.clearGeneration(0);
		expect(q.hasPending(0)).toBe(false);
		expect(q.hasPending(1)).toBe(true);
	});

	it("merge job cùng key+side+generation: left lấy min targetTs", () => {
		const q = new HistoryFetchQueue();
		q.enqueue({ key: "b:BTC:1m", side: "left", targetTs: 1000, priority: 1, generation: 0 });
		q.enqueue({ key: "b:BTC:1m", side: "left", targetTs: 500, priority: 2, generation: 0 });
		const job = q.dequeue(0)!;
		expect(job.targetTs).toBe(500);
		expect(job.priority).toBe(2);
		// Chỉ 1 job, không phải 2
		q.complete(job.id);
		expect(q.dequeue(0)).toBeNull();
	});

	it("merge job cùng key+side+generation: right lấy max targetTs", () => {
		const q = new HistoryFetchQueue();
		q.enqueue({ key: "b:BTC:1m", side: "right", targetTs: 1000, priority: 1, generation: 0 });
		q.enqueue({ key: "b:BTC:1m", side: "right", targetTs: 1500, priority: 2, generation: 0 });
		const job = q.dequeue(0)!;
		expect(job.targetTs).toBe(1500);
		expect(job.priority).toBe(2);
	});

	it("priority sort: cao hơn dequeue trước", () => {
		const q = new HistoryFetchQueue();
		q.enqueue({ key: "b:BTC:1m", side: "left", targetTs: 1000, priority: 1, generation: 0 });
		q.enqueue({ key: "b:BTC:1m", side: "right", targetTs: 2000, priority: 5, generation: 0 });
		const job = q.dequeue(0)!;
		expect(job.priority).toBe(5);
	});

	it("hasPending trả false sau khi clearAll", () => {
		const q = new HistoryFetchQueue();
		q.enqueue({ key: "b:BTC:1m", side: "left", targetTs: 1000, priority: 1, generation: 0 });
		q.clearAll();
		expect(q.hasPending()).toBe(false);
	});

	it("snapshot phản ánh trạng thái hiện tại", () => {
		const q = new HistoryFetchQueue();
		q.enqueue({ key: "b:BTC:1m", side: "left", targetTs: 1000, priority: 1, generation: 0 });
		expect(q.snapshot().pending).toBe(1);
		expect(q.snapshot().inflight).toBeNull();
		q.dequeue(0);
		expect(q.snapshot().pending).toBe(0);
		expect(q.snapshot().inflight).not.toBeNull();
	});

	it("clearGeneration clears an inflight job from the same generation", () => {
		const q = new HistoryFetchQueue();
		q.enqueue({ key: "b:BTC:1m", side: "left", targetTs: 1000, priority: 1, generation: 0 });
		const job = q.dequeue(0)!;
		q.clearGeneration(0);
		expect(q.snapshot().inflight).toBeNull();
		q.complete(job.id);
		expect(q.snapshot().inflight).toBeNull();
	});
});
