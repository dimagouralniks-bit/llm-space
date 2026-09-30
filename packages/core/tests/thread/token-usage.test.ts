import { describe, expect, test } from "bun:test";

import { formatTokens, formatCost, formatCompactUsage, formatUsageSummary, usageBreakdownRows } from "../../src/thread/token-usage";
import type { ModelUsage } from "../../src/types";

describe("formatTokens", () => {
  test("formats simple numbers correctly", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(5)).toBe("5");
    expect(formatTokens(100)).toBe("100");
  });

  test("adds thousands separators", () => {
    expect(formatTokens(1000)).toBe("1,000");
    expect(formatTokens(1000000)).toBe("1,000,000");
  });

  test("clamps negative values to 0", () => {
    expect(formatTokens(-1)).toBe("0");
    expect(formatTokens(-100)).toBe("0");
  });

  test("rounds decimal values to integer", () => {
    expect(formatTokens(1.4)).toBe("1");
    expect(formatTokens(1.5)).toBe("2");
    expect(formatTokens(1.6)).toBe("2");
  });
});

describe("formatCost", () => {
  test("returns null for 0, undefined, negative or non-finite values", () => {
    expect(formatCost(undefined)).toBeNull();
    expect(formatCost(0)).toBeNull();
    expect(formatCost(-1)).toBeNull();
    expect(formatCost(Number.NaN)).toBeNull();
    expect(formatCost(Number.POSITIVE_INFINITY)).toBeNull();
  });

  test("formats costs >= 1 with 2 decimal places", () => {
    expect(formatCost(1)).toBe("$1.00");
    expect(formatCost(1.5)).toBe("$1.50");
    expect(formatCost(10.123)).toBe("$10.12");
  });

  test("formats costs between 0.01 and 1 with 4 decimal places", () => {
    expect(formatCost(0.99)).toBe("$0.9900");
    expect(formatCost(0.01)).toBe("$0.0100");
    expect(formatCost(0.015)).toBe("$0.0150");
    expect(formatCost(0.12345)).toBe("$0.1235");
  });

  test("formats costs < 0.01 with 6 decimal places", () => {
    expect(formatCost(0.009)).toBe("$0.009000");
    expect(formatCost(0.001)).toBe("$0.001000");
    expect(formatCost(0.000123)).toBe("$0.000123");
    expect(formatCost(0.000001)).toBe("$0.000001");
  });
});

describe("formatCompactUsage", () => {
  const baseUsage: ModelUsage = {
    input: 1500,
    output: 2000,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 3500,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };

  test("formats basic usage without cost or cache", () => {
    expect(formatCompactUsage(baseUsage)).toBe("1.5K in / 2K out");
  });

  test("includes cost when total is greater than 0", () => {
    const usage: ModelUsage = {
      ...baseUsage,
      cost: { ...baseUsage.cost, total: 1.25 },
    };
    expect(formatCompactUsage(usage)).toBe("1.5K in / 2K out / $1.25");
  });

  test("includes cache read strings", () => {
    const usage: ModelUsage = {
      ...baseUsage,
      cacheRead: 1200,
    };
    expect(formatCompactUsage(usage)).toBe("1.5K in / 2K out / 1.2K cached");
  });

  test("includes cache write strings", () => {
    const usage: ModelUsage = {
      ...baseUsage,
      cacheWrite: 1100,
    };
    expect(formatCompactUsage(usage)).toBe("1.5K in / 2K out / 1.1K cache write");
  });

  test("includes all parts simultaneously", () => {
    const usage: ModelUsage = {
      ...baseUsage,
      cacheRead: 1200,
      cacheWrite: 1100,
      cost: { ...baseUsage.cost, total: 1.25 },
    };
    expect(formatCompactUsage(usage)).toBe(
      "1.5K in / 2K out / 1.2K cached / 1.1K cache write / $1.25"
    );
  });
});

describe("usageBreakdownRows", () => {
  const baseUsage: ModelUsage = {
    input: 1500,
    output: 2000,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 3500,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };

  test("returns Input, Output and Total for basic usage", () => {
    expect(usageBreakdownRows(baseUsage)).toEqual([
      { label: "Input", value: "1,500 tokens" },
      { label: "Output", value: "2,000 tokens" },
      { label: "Total", value: "3,500 tokens" },
    ]);
  });

  test("includes Cache Read if present", () => {
    const usage = { ...baseUsage, cacheRead: 1200 };
    expect(usageBreakdownRows(usage)).toEqual([
      { label: "Input", value: "1,500 tokens" },
      { label: "Output", value: "2,000 tokens" },
      { label: "Cache Read", value: "1,200 tokens" },
      { label: "Total", value: "3,500 tokens" },
    ]);
  });

  test("includes Cache Write if present", () => {
    const usage = { ...baseUsage, cacheWrite: 1100 };
    expect(usageBreakdownRows(usage)).toEqual([
      { label: "Input", value: "1,500 tokens" },
      { label: "Output", value: "2,000 tokens" },
      { label: "Cache Write", value: "1,100 tokens" },
      { label: "Total", value: "3,500 tokens" },
    ]);
  });

  test("includes Reasoning if present", () => {
    const usage = { ...baseUsage, reasoning: 500 };
    expect(usageBreakdownRows(usage)).toEqual([
      { label: "Input", value: "1,500 tokens" },
      { label: "Output", value: "2,000 tokens" },
      { label: "Reasoning", value: "500 tokens" },
      { label: "Total", value: "3,500 tokens" },
    ]);
  });

  test("includes Cost if present", () => {
    const usage: ModelUsage = {
      ...baseUsage,
      cost: { ...baseUsage.cost, total: 1.25 },
    };
    expect(usageBreakdownRows(usage)).toEqual([
      { label: "Input", value: "1,500 tokens" },
      { label: "Output", value: "2,000 tokens" },
      { label: "Cost", value: "$1.25" },
      { label: "Total", value: "3,500 tokens" },
    ]);
  });

  test("includes all items correctly", () => {
    const usage: ModelUsage = {
      ...baseUsage,
      cacheRead: 1200,
      cacheWrite: 1100,
      reasoning: 500,
      totalTokens: 0,
      cost: { ...baseUsage.cost, total: 1.25 },
    };
    expect(usageBreakdownRows(usage)).toEqual([
      { label: "Input", value: "1,500 tokens" },
      { label: "Output", value: "2,000 tokens" },
      { label: "Cache Read", value: "1,200 tokens" },
      { label: "Cache Write", value: "1,100 tokens" },
      { label: "Reasoning", value: "500 tokens" },
      { label: "Cost", value: "$1.25" },
      { label: "Total", value: "5,800 tokens" },
    ]);
  });
});

describe("formatUsageSummary", () => {
  const baseUsage: ModelUsage = {
    input: 1500,
    output: 2000,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 3500,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };

  test("formats basic usage without cost, cache or reasoning", () => {
    expect(formatUsageSummary(baseUsage)).toBe("3,500 tokens / 1,500 input / 2,000 output");
  });

  test("calculates totalTokens as sum if totalTokens is 0", () => {
    const usage: ModelUsage = {
      ...baseUsage,
      totalTokens: 0,
    };
    expect(formatUsageSummary(usage)).toBe("3,500 tokens / 1,500 input / 2,000 output");
  });

  test("calculates totalTokens as sum if totalTokens is undefined", () => {
    const usage = { ...baseUsage };
    delete (usage as any).totalTokens;
    expect(formatUsageSummary(usage as ModelUsage)).toBe("3,500 tokens / 1,500 input / 2,000 output");
  });

  test("uses totalTokens property if it is greater than 0", () => {
    const usage: ModelUsage = {
      ...baseUsage,
      totalTokens: 5000,
    };
    expect(formatUsageSummary(usage)).toBe("5,000 tokens / 1,500 input / 2,000 output");
  });

  test("includes cost when total is greater than 0", () => {
    const usage: ModelUsage = {
      ...baseUsage,
      cost: { ...baseUsage.cost, total: 1.25 },
    };
    expect(formatUsageSummary(usage)).toBe("3,500 tokens / 1,500 input / 2,000 output / $1.25");
  });

  test("includes cache read strings", () => {
    const usage: ModelUsage = {
      ...baseUsage,
      cacheRead: 1200,
    };
    expect(formatUsageSummary(usage)).toBe("3,500 tokens / 1,500 input / 2,000 output / 1,200 cached");
  });

  test("includes cache write strings", () => {
    const usage: ModelUsage = {
      ...baseUsage,
      cacheWrite: 1100,
    };
    expect(formatUsageSummary(usage)).toBe("3,500 tokens / 1,500 input / 2,000 output / 1,100 cache write");
  });

  test("includes reasoning strings", () => {
    const usage: ModelUsage = {
      ...baseUsage,
      reasoning: 500,
    };
    expect(formatUsageSummary(usage)).toBe("3,500 tokens / 1,500 input / 2,000 output / 500 reasoning");
  });

  test("includes all parts simultaneously", () => {
    const usage: ModelUsage = {
      ...baseUsage,
      totalTokens: 0,
      cacheRead: 1200,
      cacheWrite: 1100,
      reasoning: 500,
      cost: { ...baseUsage.cost, total: 1.25 },
    };
    expect(formatUsageSummary(usage)).toBe(
      "5,800 tokens / 1,500 input / 2,000 output / 500 reasoning / 1,200 cached / 1,100 cache write / $1.25"
    );
  });
});
