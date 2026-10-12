import { describe, expect, test } from "bun:test";

import {
  addModelUsage,
  aggregateMessageUsage,
  aggregateModelUsage,
  aggregateThreadUsage,
  emptyModelUsage,
  hasModelUsage,
  isModelUsage,
  usageForRun,
} from "../../src/thread/usage";
import type { Message, ModelUsage, ThreadSnapshot } from "../../src/types";

const BASE_USAGE: ModelUsage = {
  input: 10,
  output: 5,
  cacheRead: 2,
  cacheWrite: 1,
  totalTokens: 18,
  cost: {
    input: 0.1,
    output: 0.2,
    cacheRead: 0.01,
    cacheWrite: 0.02,
    total: 0.33,
  },
};

describe("emptyModelUsage", () => {
  test("returns zeroed model usage structure", () => {
    const empty = emptyModelUsage();
    expect(empty).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    });
    expect(isModelUsage(empty)).toBe(true);
  });
});

describe("isModelUsage & hasModelUsage", () => {
  test("rejects malformed persisted usage", () => {
    expect(isModelUsage(BASE_USAGE)).toBe(true);
    expect(isModelUsage(null)).toBe(false);
    expect(isModelUsage(undefined)).toBe(false);
    expect(isModelUsage("not-an-object")).toBe(false);
    expect(isModelUsage({ ...BASE_USAGE, input: -1 })).toBe(false);
    expect(isModelUsage({ ...BASE_USAGE, cost: { total: 1 } })).toBe(false);
    expect(isModelUsage({ ...BASE_USAGE, reasoning: Number.NaN })).toBe(false);
  });

  test("hasModelUsage identifies non-empty usage", () => {
    expect(hasModelUsage(null)).toBe(false);
    expect(hasModelUsage(undefined)).toBe(false);
    expect(hasModelUsage(emptyModelUsage())).toBe(false);

    expect(hasModelUsage({ ...emptyModelUsage(), totalTokens: 10 })).toBe(true);
    expect(hasModelUsage({ ...emptyModelUsage(), input: 5 })).toBe(true);
    expect(hasModelUsage({ ...emptyModelUsage(), output: 5 })).toBe(true);
    expect(hasModelUsage({ ...emptyModelUsage(), cacheRead: 2 })).toBe(true);
    expect(hasModelUsage({ ...emptyModelUsage(), cacheWrite: 1 })).toBe(true);
    expect(hasModelUsage({ ...emptyModelUsage(), reasoning: 3 })).toBe(true);
    expect(
      hasModelUsage({
        ...emptyModelUsage(),
        cost: { input: 0.01, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.01 },
      })
    ).toBe(true);
  });
});

describe("addModelUsage", () => {
  test("adds provider usage without mutating either input", () => {
    const left = structuredClone(BASE_USAGE);
    const right: ModelUsage = {
      ...BASE_USAGE,
      input: 1,
      output: 2,
      reasoning: 3,
      totalTokens: 0,
    };
    const total = addModelUsage(left, right);

    expect(total).toMatchObject({
      input: 11,
      output: 7,
      cacheRead: 4,
      cacheWrite: 2,
      reasoning: 3,
      totalTokens: 24,
      cost: { total: 0.66 },
    });
    expect(left).toEqual(BASE_USAGE);
  });

  test("handles optional reasoning combinations", () => {
    const usageA: ModelUsage = { ...emptyModelUsage(), input: 10, totalTokens: 10 };
    const usageB: ModelUsage = { ...emptyModelUsage(), input: 5, totalTokens: 5, reasoning: 15 };

    // Neither has reasoning
    expect(addModelUsage(usageA, usageA).reasoning).toBeUndefined();

    // One has reasoning
    expect(addModelUsage(usageA, usageB).reasoning).toBe(15);
    expect(addModelUsage(usageB, usageA).reasoning).toBe(15);

    // Both have reasoning
    expect(addModelUsage(usageB, usageB).reasoning).toBe(30);
  });

  test("calculates totalTokens fallback when totalTokens is 0", () => {
    const usageZeroTotal: ModelUsage = {
      input: 10,
      output: 5,
      cacheRead: 2,
      cacheWrite: 1,
      totalTokens: 0,
      cost: emptyModelUsage().cost,
    };

    const combined = addModelUsage(usageZeroTotal, usageZeroTotal);
    expect(combined.totalTokens).toBe(36); // (10+5+2+1) + (10+5+2+1)
  });
});

describe("aggregateMessageUsage & aggregateThreadUsage", () => {
  test("returns null for empty or invalid message arrays / threads", () => {
    expect(aggregateThreadUsage({})).toBeNull();
    expect(aggregateThreadUsage({ context: {} })).toBeNull();
    expect(aggregateThreadUsage({ context: { messages: [] } })).toBeNull();
    expect(aggregateMessageUsage([])).toBeNull();
  });

  test("filters out non-assistant messages or messages with empty usage", () => {
    const messages: Message[] = [
      {
        id: "user-1",
        role: "user",
        content: [{ type: "text", text: "Hello" }],
        usage: BASE_USAGE, // Non-assistant message should be ignored
      },
      {
        id: "assistant-1",
        role: "assistant",
        content: [{ type: "text", text: "Hi" }],
        usage: emptyModelUsage(), // Empty usage should be ignored
      },
    ];

    expect(aggregateMessageUsage(messages)).toBeNull();
  });

  test("aggregates usage across multiple assistant messages", () => {
    const usage1: ModelUsage = {
      ...BASE_USAGE,
      input: 10,
      output: 20,
      totalTokens: 30,
    };
    const usage2: ModelUsage = {
      ...BASE_USAGE,
      input: 5,
      output: 15,
      totalTokens: 20,
    };

    const thread: ThreadSnapshot = {
      context: {
        messages: [
          {
            id: "user-1",
            role: "user",
            content: [{ type: "text", text: "Hi" }],
          },
          {
            id: "assistant-1",
            role: "assistant",
            content: [{ type: "text", text: "Response 1" }],
            usage: usage1,
          },
          {
            id: "assistant-2",
            role: "assistant",
            content: [{ type: "text", text: "Response 2" }],
            usage: usage2,
          },
        ],
      },
    };

    const aggregated = aggregateThreadUsage(thread);
    expect(aggregated).not.toBeNull();
    expect(aggregated?.input).toBe(15);
    expect(aggregated?.output).toBe(35);
    expect(aggregated?.totalTokens).toBe(50);
  });
});

describe("aggregateModelUsage", () => {
  test("returns null for empty array or array with only invalid usages", () => {
    expect(aggregateModelUsage([])).toBeNull();
    expect(
      aggregateModelUsage([
        null as unknown as ModelUsage,
        { invalid: true } as unknown as ModelUsage,
      ])
    ).toBeNull();
  });

  test("aggregates valid usages while skipping invalid ones", () => {
    const usage1: ModelUsage = {
      ...BASE_USAGE,
      input: 100,
      output: 50,
      totalTokens: 150,
    };
    const usage2: ModelUsage = {
      ...BASE_USAGE,
      input: 200,
      output: 100,
      totalTokens: 300,
    };

    const aggregated = aggregateModelUsage([
      usage1,
      { invalid: true } as unknown as ModelUsage,
      usage2,
    ]);

    expect(aggregated).not.toBeNull();
    expect(aggregated?.input).toBe(300);
    expect(aggregated?.output).toBe(150);
    expect(aggregated?.totalTokens).toBe(450);
  });
});

describe("usageForRun", () => {
  test("falls back only for legacy runs without a usage field", () => {
    const thread: ThreadSnapshot = {
      context: {
        messages: [
          {
            id: "assistant-1",
            role: "assistant",
            content: [{ type: "text", text: "Done" }],
            usage: BASE_USAGE,
          },
        ],
      },
    };

    expect(usageForRun({ thread })).toEqual(BASE_USAGE);
    expect(usageForRun({ thread, usage: emptyModelUsage() })).toBeNull();
  });
});
