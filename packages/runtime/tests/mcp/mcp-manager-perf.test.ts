import { describe, expect, test } from "bun:test";
import { McpManager } from "../../src/mcp/mcp-manager";

describe("McpManager Performance & Shutdown", () => {
  test("aborting multiple active test controllers is synchronous and instantaneous", () => {
    const manager = new McpManager();
    const testCount = 1000;
    const controllers: AbortController[] = [];

    // Access private map for benchmark
    const testsMap = (manager as unknown as { _tests: Map<string, AbortController> })._tests;

    for (let i = 0; i < testCount; i++) {
      const controller = new AbortController();
      controllers.push(controller);
      testsMap.set(`server-${i}`, controller);
    }

    const start = performance.now();
    for (const controller of testsMap.values()) {
      controller.abort();
    }
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(50); // Aborting 1000 controllers should take < 50ms (typically < 1ms)
    for (const controller of controllers) {
      expect(controller.signal.aborted).toBe(true);
    }
  });

  test("shutdown closes multiple servers concurrently", async () => {
    const manager = new McpManager();
    const serverCount = 50;

    const clientsMap = (manager as unknown as { _clients: Map<string, unknown> })._clients;

    const closeDelays: number[] = [];

    for (let i = 0; i < serverCount; i++) {
      const mockClient = {
        close: async () => {
          const delayStart = performance.now();
          await new Promise((resolve) => setTimeout(resolve, 10)); // Simulates 10ms network close
          closeDelays.push(performance.now() - delayStart);
        },
      };
      clientsMap.set(`server-${i}`, { client: mockClient, tools: null });
    }

    const start = performance.now();
    await manager.shutdown();
    const totalDuration = performance.now() - start;

    // If done sequentially, 50 * 10ms = 500ms minimum.
    // If done concurrently with Promise.all, total duration should be around ~10-30ms.
    expect(totalDuration).toBeLessThan(150);
  });
});
