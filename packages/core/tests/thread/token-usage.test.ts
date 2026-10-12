import { describe, expect, test } from "bun:test";

import {
  formatCompactUsage,
  formatCost,
  formatTokens,
  formatUsageSummary,
  usageBreakdownRows,
} from "../../src/thread/token-usage";
import type { ModelUsage } from "../../src/types";

describe("token usage string formatting", () => {
  describe("formatTokens", () => {
    test("formats integers with thousands separators", () => {
      expect(formatTokens(0)).toBe("0");
      expect(formatTokens(500)).toBe("500");
      expect(formatTokens(1234)).toBe("1,234");
      expect(formatTokens(1234567)).toBe("1,234,567");
    });

    test("rounds floating point token numbers", () => {
      expect(formatTokens(1234.4)).toBe("1,234");
      expect(formatTokens(1234.6)).toBe("1,235");
    });

    test("clamps negative token numbers to 0", () => {
      expect(formatTokens(-10)).toBe("0");
      expect(formatTokens(-0.5)).toBe("0");
    });
  });

  describe("formatCost", () => {
    test("returns null for zero, negative, undefined, NaN, or non-finite costs", () => {
      expect(formatCost(undefined)).toBeNull();
      expect(formatCost(0)).toBeNull();
      expect(formatCost(-0.05)).toBeNull();
      expect(formatCost(Number.NaN)).toBeNull();
      expect(formatCost(Number.POSITIVE_INFINITY)).toBeNull();
    });

    test("formats costs >= $1.00 with 2 decimal places", () => {
      expect(formatCost(1)).toBe("$1.00");
      expect(formatCost(1.2)).toBe("$1.20");
      expect(formatCost(12.3456)).toBe("$12.35");
    });

    test("formats costs >= $0.01 and < $1.00 with 4 decimal places", () => {
      expect(formatCost(0.01)).toBe("$0.0100");
      expect(formatCost(0.5)).toBe("$0.5000");
      expect(formatCost(0.12345)).toBe("$0.1235");
    });

    test("formats small costs < $0.01 with 6 decimal places", () => {
      expect(formatCost(0.001)).toBe("$0.001000");
      expect(formatCost(0.00001234)).toBe("$0.000012");
    });
  });

  describe("formatCompactUsage", () => {
    test("formats basic input and output without cost or cache", () => {
      const usage: ModelUsage = {
        input: 1200,
        output: 300,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 1500,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      };
      expect(formatCompactUsage(usage)).toBe("1.2K in / 300 out");
    });

    test("includes cache read/write parts and formatted cost when present", () => {
      const usage: ModelUsage = {
        input: 1500000,
        output: 25000,
        cacheRead: 500000,
        cacheWrite: 100000,
        totalTokens: 2125000,
        cost: {
          input: 1.5,
          output: 0.5,
          cacheRead: 0.1,
          cacheWrite: 0.1,
          total: 2.2,
        },
      };
      expect(formatCompactUsage(usage)).toBe(
        "1.5M in / 25K out / 500K cached / 100K cache write / $2.20"
      );
    });
  });

  describe("formatUsageSummary", () => {
    test("formats summary without optional parts", () => {
      const usage: ModelUsage = {
        input: 1000,
        output: 500,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 1500,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      };
      expect(formatUsageSummary(usage)).toBe(
        "1,500 tokens / 1,000 input / 500 output"
      );
    });

    test("formats summary with reasoning, cache, and cost", () => {
      const usage: ModelUsage = {
        input: 1000,
        output: 500,
        cacheRead: 200,
        cacheWrite: 100,
        reasoning: 300,
        totalTokens: 0, // Fallback calculation: 1000 + 500 + 200 + 100 = 1800
        cost: {
          input: 0.005,
          output: 0.01,
          cacheRead: 0,
          cacheWrite: 0,
          total: 0.015,
        },
      };
      expect(formatUsageSummary(usage)).toBe(
        "1,800 tokens / 1,000 input / 500 output / 300 reasoning / 200 cached / 100 cache write / $0.0150"
      );
    });

    test("uses provider totalTokens when non-zero", () => {
      const usage: ModelUsage = {
        input: 1000,
        output: 500,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 2000, // Explicit totalTokens overrides simple component sum
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      };
      expect(formatUsageSummary(usage)).toBe(
        "2,000 tokens / 1,000 input / 500 output"
      );
    });
  });

  describe("usageBreakdownRows", () => {
    test("returns basic breakdown rows for standard usage without cost/cache/reasoning", () => {
      const usage: ModelUsage = {
        input: 100,
        output: 50,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 150,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      };
      expect(usageBreakdownRows(usage)).toEqual([
        { label: "Input", value: "100 tokens" },
        { label: "Output", value: "50 tokens" },
        { label: "Total", value: "150 tokens" },
      ]);
    });

    test("includes cache read, cache write, reasoning, and cost rows when present", () => {
      const usage: ModelUsage = {
        input: 1000,
        output: 500,
        cacheRead: 200,
        cacheWrite: 100,
        reasoning: 300,
        totalTokens: 2100,
        cost: {
          input: 1.0,
          output: 0.5,
          cacheRead: 0.1,
          cacheWrite: 0.05,
          total: 1.65,
        },
      };
      expect(usageBreakdownRows(usage)).toEqual([
        { label: "Input", value: "1,000 tokens" },
        { label: "Output", value: "500 tokens" },
        { label: "Cache Read", value: "200 tokens" },
        { label: "Cache Write", value: "100 tokens" },
        { label: "Reasoning", value: "300 tokens" },
        { label: "Cost", value: "$1.65" },
        { label: "Total", value: "2,100 tokens" },
      ]);
    });
  });
});
