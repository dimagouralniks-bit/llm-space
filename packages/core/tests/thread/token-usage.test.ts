import { describe, expect, test } from "bun:test";
import {
  formatCompactUsage,
  formatCost,
  formatTokens,
  formatUsageSummary,
  usageBreakdownRows,
} from "../../src/thread/token-usage";
import type { ModelUsage } from "../../src/types";

const BASE_USAGE: ModelUsage = {
  input: 1250,
  output: 500,
  cacheRead: 0,
  cacheWrite: 0,
  reasoning: 0,
  totalTokens: 1750,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  },
};

describe("formatTokens", () => {
  test("formats numbers with comma separation and rounding", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(1234)).toBe("1,234");
    expect(formatTokens(1234.4)).toBe("1,234");
    expect(formatTokens(1234.5)).toBe("1,235");
    expect(formatTokens(1000000)).toBe("1,000,000");
  });

  test("maps negative numbers to 0", () => {
    expect(formatTokens(-10)).toBe("0");
    expect(formatTokens(-10.5)).toBe("0");
  });
});

describe("formatCost", () => {
  test("returns null for invalid or zero costs", () => {
    expect(formatCost(undefined)).toBeNull();
    expect(formatCost(0)).toBeNull();
    expect(formatCost(-1)).toBeNull();
    expect(formatCost(Number.NaN)).toBeNull();
    expect(formatCost(Number.POSITIVE_INFINITY)).toBeNull();
  });

  test("formats values >= 1 with 2 decimal places", () => {
    expect(formatCost(1)).toBe("$1.00");
    expect(formatCost(1.23)).toBe("$1.23");
    expect(formatCost(1.234)).toBe("$1.23");
    expect(formatCost(10.5)).toBe("$10.50");
  });

  test("formats values >= 0.01 with 4 decimal places", () => {
    expect(formatCost(0.01)).toBe("$0.0100");
    expect(formatCost(0.015)).toBe("$0.0150");
    expect(formatCost(0.99)).toBe("$0.9900");
  });

  test("formats values < 0.01 with 6 decimal places", () => {
    expect(formatCost(0.009)).toBe("$0.009000");
    expect(formatCost(0.001)).toBe("$0.001000");
    expect(formatCost(0.000123)).toBe("$0.000123");
  });
});

describe("formatCompactUsage", () => {
  test("formats basic usage", () => {
    expect(formatCompactUsage(BASE_USAGE)).toBe("1.3K in / 500 out");
  });

  test("includes cost if present and > 0", () => {
    const usage: ModelUsage = {
      ...BASE_USAGE,
      cost: { ...BASE_USAGE.cost, total: 1.5 },
    };
    expect(formatCompactUsage(usage)).toBe("1.3K in / 500 out / $1.50");
  });

  test("includes cache read and write if > 0", () => {
    const usage: ModelUsage = {
      ...BASE_USAGE,
      cacheRead: 2500,
      cacheWrite: 1200,
    };
    expect(formatCompactUsage(usage)).toBe(
      "1.3K in / 500 out / 2.5K cached / 1.2K cache write"
    );
  });
});

describe("formatUsageSummary", () => {
  test("formats basic usage summary", () => {
    expect(formatUsageSummary(BASE_USAGE)).toBe(
      "1,750 tokens / 1,250 input / 500 output"
    );
  });

  test("calculates total tokens if totalTokens is 0", () => {
    const usage: ModelUsage = { ...BASE_USAGE, totalTokens: 0 };
    expect(formatUsageSummary(usage)).toBe(
      "1,750 tokens / 1,250 input / 500 output"
    );
  });

  test("includes reasoning, cache, and cost when present", () => {
    const usage: ModelUsage = {
      ...BASE_USAGE,
      reasoning: 100,
      cacheRead: 500,
      cacheWrite: 250,
      cost: { ...BASE_USAGE.cost, total: 0.05 },
    };
    expect(formatUsageSummary(usage)).toBe(
      "1,750 tokens / 1,250 input / 500 output / 100 reasoning / 500 cached / 250 cache write / $0.0500"
    );
  });
});

describe("usageBreakdownRows", () => {
  test("returns basic rows for input, output, and total", () => {
    const rows = usageBreakdownRows(BASE_USAGE);
    expect(rows).toEqual([
      { label: "Input", value: "1,250 tokens" },
      { label: "Output", value: "500 tokens" },
      { label: "Total", value: "1,750 tokens" },
    ]);
  });

  test("includes conditional rows when > 0", () => {
    const usage: ModelUsage = {
      ...BASE_USAGE,
      cacheRead: 1500,
      cacheWrite: 300,
      reasoning: 50,
      cost: { ...BASE_USAGE.cost, total: 1.23 },
    };
    const rows = usageBreakdownRows(usage);
    expect(rows).toEqual([
      { label: "Input", value: "1,250 tokens" },
      { label: "Output", value: "500 tokens" },
      { label: "Cache Read", value: "1,500 tokens" },
      { label: "Cache Write", value: "300 tokens" },
      { label: "Reasoning", value: "50 tokens" },
      { label: "Cost", value: "$1.23" },
      { label: "Total", value: "1,750 tokens" },
    ]);
  });

  test("calculates total tokens if missing using components", () => {
    const usage: ModelUsage = {
      ...BASE_USAGE,
      totalTokens: 0,
      cacheRead: 10,
      cacheWrite: 20,
    };
    const rows = usageBreakdownRows(usage);
    expect(rows).toContainEqual({ label: "Total", value: "1,780 tokens" });
  });
});
