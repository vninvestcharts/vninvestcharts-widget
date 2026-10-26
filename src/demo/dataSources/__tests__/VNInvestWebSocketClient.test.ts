/**
 * Tests for VNInvestWebSocketClient (Slice N)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VNInvestWebSocketClient, type TickerUpdateEvent, type WhaleAlertWSEvent } from "../VNInvestWebSocketClient";

// ---- Minimal WebSocket mock ----

interface MockWSInstance {
	url: string;
	readyState: number;
	sentMessages: string[];
	onopen: (() => void) | null;
	onmessage: ((e: { data: string }) => void) | null;
	onclose: ((e: { code: number }) => void) | null;
	onerror: (() => void) | null;
	close: (code?: number, reason?: string) => void;
	send: (data: string) => void;
	/** Test helper: simulate server sending a message */
	simulateMessage(data: string): void;
	/** Test helper: simulate connection open */
	simulateOpen(): void;
	/** Test helper: simulate connection close */
	simulateClose(code?: number): void;
}

let lastCreatedSocket: MockWSInstance | null = null;

function createMockWebSocket() {
	const MockWS = vi.fn().mockImplementation((url: string): MockWSInstance => {
		const instance: MockWSInstance = {
			url,
			readyState: 0, // CONNECTING
			sentMessages: [],
			onopen: null,
			onmessage: null,
			onclose: null,
			onerror: null,
			close(code = 1000) {
				this.readyState = 3; // CLOSED
				this.onclose?.({ code });
			},
			send(data: string) {
				this.sentMessages.push(data);
			},
			simulateOpen() {
				this.readyState = 1; // OPEN
				this.onopen?.();
			},
			simulateMessage(data: string) {
				this.onmessage?.({ data });
			},
			simulateClose(code = 1000) {
				this.readyState = 3;
				this.onclose?.({ code });
			},
		};
		lastCreatedSocket = instance;
		return instance;
	});
	(MockWS as unknown as { OPEN: number }).OPEN = 1;
	return MockWS;
}

beforeEach(() => {
	vi.useFakeTimers();
	lastCreatedSocket = null;
	vi.stubGlobal("WebSocket", createMockWebSocket());
	vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200 }));
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
	lastCreatedSocket = null;
});

// -------------------------------------------------------

describe("VNInvestWebSocketClient", () => {
	async function connectAndFlush(client: VNInvestWebSocketClient) {
		client.connect();
		// connect() now performs async WS path probing before creating WebSocket.
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
	}

	it("buildWsUrl: https becomes wss with PAT in query-string", () => {
		const client = new VNInvestWebSocketClient("vni_abc123", "https://api.example.invalid");
		expect(client.buildWsUrl()).toBe("wss://api.example.invalid/ws/realtime/?token=vni_abc123");
	});

	it("buildWsUrl: http becomes ws", () => {
		const client = new VNInvestWebSocketClient("vni_tok", "http://localhost:8000");
		expect(client.buildWsUrl()).toBe("ws://localhost:8000/ws/realtime/?token=vni_tok");
	});

	it("buildWsUrl: trailing slash on apiBase is stripped", () => {
		const client = new VNInvestWebSocketClient("vni_t", "https://example.com/");
		expect(client.buildWsUrl()).toBe("wss://example.com/ws/realtime/?token=vni_t");
	});

	it("connect: opens WebSocket to the correct URL (https → wss)", async () => {
		const client = new VNInvestWebSocketClient("vni_tok", "https://host.test");
		await connectAndFlush(client);
		expect(lastCreatedSocket?.url).toBe("wss://host.test/ws/realtime/?token=vni_tok");
	});

	it("subscribe before open: queues and sends on open", async () => {
		const client = new VNInvestWebSocketClient("vni_tok", "https://host.test");
		await connectAndFlush(client);
		const socket = lastCreatedSocket!;
		client.subscribe(["VCB"]);

		// Not sent yet (not connected)
		expect(socket.sentMessages).toHaveLength(0);

		socket.simulateOpen();
		expect(socket.sentMessages).toHaveLength(1);
		expect(JSON.parse(socket.sentMessages[0])).toEqual({ action: "subscribe", symbols: ["VCB"] });
	});

	it("subscribe after open: sends immediately", async () => {
		const client = new VNInvestWebSocketClient("vni_tok", "https://host.test");
		await connectAndFlush(client);
		lastCreatedSocket!.simulateOpen();
		client.subscribe(["HPG", "VNM"]);
		expect(JSON.parse(lastCreatedSocket!.sentMessages[0])).toEqual({ action: "subscribe", symbols: ["HPG", "VNM"] });
	});

	it("unsubscribe: sends unsubscribe message", async () => {
		const client = new VNInvestWebSocketClient("vni_tok", "https://host.test");
		await connectAndFlush(client);
		const socket = lastCreatedSocket!;
		socket.simulateOpen();
		client.subscribe(["VCB"]);
		client.unsubscribe(["VCB"]);
		const msgs = socket.sentMessages.map((m) => JSON.parse(m));
		expect(msgs).toContainEqual({ action: "unsubscribe", symbols: ["VCB"] });
	});

	it("ticker_update event: fires onTickerUpdate callback with typed payload", async () => {
		const onTicker = vi.fn<[TickerUpdateEvent], void>();
		const client = new VNInvestWebSocketClient("vni_tok", "https://host.test");
		client.setOnTickerUpdate(onTicker);
		await connectAndFlush(client);
		lastCreatedSocket!.simulateOpen();

		const payload: TickerUpdateEvent = {
			event_type: "ticker_update",
			symbol: "VCB",
			price: 68500,
			current_price: 68500,
			volume: 12500,
			vwap: 68450,
			ts: "2024-01-15T09:30:00Z",
			last_date: "2024-01-15T09:30:00Z",
			stale: false,
			seq: 1,
		};
		lastCreatedSocket!.simulateMessage(JSON.stringify(payload));
		expect(onTicker).toHaveBeenCalledOnce();
		expect(onTicker.mock.calls[0][0].price).toBe(68500);
	});

	it("whale_alert event: fires onWhaleAlert callback", async () => {
		const onWhale = vi.fn<[WhaleAlertWSEvent], void>();
		const client = new VNInvestWebSocketClient("vni_tok", "https://host.test");
		client.setOnWhaleAlert(onWhale);
		await connectAndFlush(client);
		lastCreatedSocket!.simulateOpen();

		const payload: WhaleAlertWSEvent = {
			event_type: "whale_alert",
			symbol: "VCB",
			side: "buy",
			value: 5_000_000,
			price: 68500,
		};
		lastCreatedSocket!.simulateMessage(JSON.stringify(payload));
		expect(onWhale).toHaveBeenCalledOnce();
	});

	it("close code 4401: does NOT attempt reconnect", async () => {
		const client = new VNInvestWebSocketClient("vni_tok", "https://host.test");
		await connectAndFlush(client);
		const socket1 = lastCreatedSocket!;
		socket1.simulateOpen();
		socket1.simulateClose(4401);

		vi.advanceTimersByTime(10_000);
		// No new WebSocket should have been created
		expect(lastCreatedSocket).toBe(socket1);
	});

	it("normal close: schedules reconnect and reconnects", async () => {
		const client = new VNInvestWebSocketClient("vni_tok", "https://host.test");
		await connectAndFlush(client);
		const socket1 = lastCreatedSocket!;
		socket1.simulateOpen();
		socket1.simulateClose(1006); // abnormal close

		vi.advanceTimersByTime(6_000);
		await Promise.resolve();
		expect(lastCreatedSocket).not.toBe(socket1);
		expect(lastCreatedSocket).not.toBeNull();
		client.destroy();
	});

	it("destroy: closes socket and stops reconnect", async () => {
		const client = new VNInvestWebSocketClient("vni_tok", "https://host.test");
		await connectAndFlush(client);
		const socket = lastCreatedSocket!;
		socket.simulateOpen();
		client.destroy();

		expect(client.destroyed).toBe(true);
		vi.advanceTimersByTime(10_000);
		// Still same socket — no new connection after destroy
		expect(lastCreatedSocket).toBe(socket);
	});

	it("connect is idempotent: second connect while open is a no-op", async () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const MockWS = vi.mocked(globalThis.WebSocket as any);
		const client = new VNInvestWebSocketClient("vni_tok", "https://host.test");
		await connectAndFlush(client);
		lastCreatedSocket!.simulateOpen();
		client.connect(); // second call
		expect(MockWS).toHaveBeenCalledTimes(1);
		client.destroy();
	});
});
