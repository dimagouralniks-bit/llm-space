import { describe, expect, test } from "bun:test";
import {
  formatTokens,
  formatCost,
  formatCompactUsage,
  formatUsageSummary,
  usageBreakdownRows,
} from "../../src/thread/token-usage";
import type { ModelUsage } from "../../src/types";

const BASE_USAGE: ModelUsage = {
  input: 1000,
  output: 500,
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
};

describe("token-usage", () => {
  describe("formatTokens", () => {
    test("formats tokens with thousand separators and rounds correctly", () => {
      expect(formatTokens(0)).toBe("0");
      expect(formatTokens(1000)).toBe("1,000");
      expect(formatTokens(1234567)).toBe("1,234,567");
      expect(formatTokens(12.6)).toBe("13");
      expect(formatTokens(-5)).toBe("0");
    });
  });

  describe("formatCost", () => {
    test("handles undefined, zero, and negative values", () => {
      expect(formatCost(undefined)).toBeNull();
      expect(formatCost(0)).toBeNull();
      expect(formatCost(-0.5)).toBeNull();
      expect(formatCost(NaN)).toBeNull();
      expect(formatCost(Infinity)).toBeNull();
    });

    test("formats values >= 1 with 2 decimal places", () => {
      expect(formatCost(1)).toBe("$1.00");
      expect(formatCost(1.5)).toBe("$1.50");
      expect(formatCost(1234.56)).toBe("$1234.56");
      expect(formatCost(1.234)).toBe("$1.23");
      expect(formatCost(1.236)).toBe("$1.24");
    });

    test("formats values >= 0.01 with 4 decimal places", () => {
      expect(formatCost(0.01)).toBe("$0.0100");
      expect(formatCost(0.015)).toBe("$0.0150");
      expect(formatCost(0.12345)).toBe("$0.1235");
    });

    test("formats values < 0.01 with 6 decimal places", () => {
      expect(formatCost(0.001)).toBe("$0.001000");
      expect(formatCost(0.000123)).toBe("$0.000123");
      expect(formatCost(0.0001236)).toBe("$0.000124");
    });
  });

  describe("formatCompactUsage", () => {
    test("formats basic usage without cost and cache", () => {
      const usage = { ...BASE_USAGE, input: 1200, output: 500 };
      expect(formatCompactUsage(usage)).toBe("1.2K in / 500 out");
    });

    test("formats usage with large numbers", () => {
      const usage = { ...BASE_USAGE, input: 1500000, output: 2500000 };
      expect(formatCompactUsage(usage)).toBe("1.5M in / 2.5M out");
    });

    test("includes cache read and write parts", () => {
      const usage = { ...BASE_USAGE, input: 1200, output: 500, cacheRead: 3000, cacheWrite: 4000 };
      expect(formatCompactUsage(usage)).toBe("1.2K in / 500 out / 3K cached / 4K cache write");
    });

    test("includes cost if available", () => {
      const usage = { ...BASE_USAGE, input: 1200, output: 500, cost: { ...BASE_USAGE.cost, total: 1.5 } };
      expect(formatCompactUsage(usage)).toBe("1.2K in / 500 out / $1.50");
    });
  });

  describe("formatUsageSummary", () => {
    test("formats basic usage", () => {
      const usage = { ...BASE_USAGE, input: 1000, output: 500, totalTokens: 1500 };
      expect(formatUsageSummary(usage)).toBe("1,500 tokens / 1,000 input / 500 output");
    });

    test("infers total tokens if not provided", () => {
      const usage = { ...BASE_USAGE, input: 1000, output: 500, cacheRead: 200, cacheWrite: 300, totalTokens: 0 };
      expect(formatUsageSummary(usage)).toBe("2,000 tokens / 1,000 input / 500 output / 200 cached / 300 cache write");
    });

    test("includes reasoning and cache parts", () => {
      const usage = { ...BASE_USAGE, input: 1000, output: 500, reasoning: 100, cacheRead: 200, cacheWrite: 300, totalTokens: 2100 };
      expect(formatUsageSummary(usage)).toBe("2,100 tokens / 1,000 input / 500 output / 100 reasoning / 200 cached / 300 cache write");
    });

    test("includes cost if available", () => {
      const usage = { ...BASE_USAGE, input: 1000, output: 500, totalTokens: 1500, cost: { ...BASE_USAGE.cost, total: 2.5 } };
      expect(formatUsageSummary(usage)).toBe("1,500 tokens / 1,000 input / 500 output / $2.50");
    });
  });

  describe("usageBreakdownRows", () => {
    test("returns basic breakdown", () => {
      const usage = { ...BASE_USAGE, input: 1000, output: 500, totalTokens: 1500 };
      expect(usageBreakdownRows(usage)).toEqual([
        { label: "Input", value: "1,000 tokens" },
        { label: "Output", value: "500 tokens" },
        { label: "Total", value: "1,500 tokens" },
      ]);
    });

    test("infers total tokens if missing", () => {
      const usage = { ...BASE_USAGE, input: 1000, output: 500, cacheRead: 100, cacheWrite: 200, totalTokens: 0 };
      expect(usageBreakdownRows(usage)).toEqual([
        { label: "Input", value: "1,000 tokens" },
        { label: "Output", value: "500 tokens" },
        { label: "Cache Read", value: "100 tokens" },
        { label: "Cache Write", value: "200 tokens" },
        { label: "Total", value: "1,800 tokens" },
      ]);
    });

    test("includes optional rows (cache, reasoning, cost)", () => {
      const usage = {
        ...BASE_USAGE,
        input: 1000,
        output: 500,
        cacheRead: 100,
        cacheWrite: 200,
        reasoning: 50,
        totalTokens: 1850,
        cost: { ...BASE_USAGE.cost, total: 1.25 }
      };
      expect(usageBreakdownRows(usage)).toEqual([
        { label: "Input", value: "1,000 tokens" },
        { label: "Output", value: "500 tokens" },
        { label: "Cache Read", value: "100 tokens" },
        { label: "Cache Write", value: "200 tokens" },
        { label: "Reasoning", value: "50 tokens" },
        { label: "Cost", value: "$1.25" },
        { label: "Total", value: "1,850 tokens" },
      ]);
    });
  });
});
