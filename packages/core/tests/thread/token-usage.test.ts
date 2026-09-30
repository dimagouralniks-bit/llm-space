import { describe, expect, test } from "bun:test";
import {
  formatCompactUsage,
  formatCost,
  formatTokens,
  formatUsageSummary,
  usageBreakdownRows,
} from "../../src/thread/token-usage";
import type { ModelUsage } from "../../src/types";

describe("token-usage formatting", () => {
  describe("formatCost", () => {
    test("returns null for missing or invalid costs", () => {
      expect(formatCost(undefined)).toBeNull();
      expect(formatCost(0)).toBeNull();
      expect(formatCost(-1)).toBeNull();
      expect(formatCost(Number.NaN)).toBeNull();
      expect(formatCost(Number.POSITIVE_INFINITY)).toBeNull();
    });

    test("formats costs >= 1 with 2 decimal places", () => {
      expect(formatCost(1)).toBe("$1.00");
      expect(formatCost(1.234)).toBe("$1.23");
      expect(formatCost(1.235)).toBe("$1.24"); // rounded
      expect(formatCost(10.5)).toBe("$10.50");
    });

    test("formats costs >= 0.01 with 4 decimal places", () => {
      expect(formatCost(0.01)).toBe("$0.0100");
      expect(formatCost(0.999)).toBe("$0.9990");
      expect(formatCost(0.01234)).toBe("$0.0123");
      expect(formatCost(0.05)).toBe("$0.0500");
    });

    test("formats costs < 0.01 with 6 decimal places", () => {
      expect(formatCost(0.009)).toBe("$0.009000");
      expect(formatCost(0.00004)).toBe("$0.000040");
      expect(formatCost(0.000001)).toBe("$0.000001");
      expect(formatCost(0.0012345)).toBe("$0.001234");
      expect(formatCost(0.0012346)).toBe("$0.001235"); // rounded
    });
  });

  describe("formatTokens", () => {
    test("formats integers with thousands separators", () => {
      expect(formatTokens(0)).toBe("0");
      expect(formatTokens(1)).toBe("1");
      expect(formatTokens(1000)).toBe("1,000");
      expect(formatTokens(1234567)).toBe("1,234,567");
    });

    test("handles floats by rounding", () => {
      expect(formatTokens(1.4)).toBe("1");
      expect(formatTokens(1.5)).toBe("2");
      expect(formatTokens(1000.9)).toBe("1,001");
    });

    test("handles negative numbers by rounding to 0", () => {
      expect(formatTokens(-1)).toBe("0");
      expect(formatTokens(-1000)).toBe("0");
      expect(formatTokens(-0.5)).toBe("0");
    });
  });

  describe("formatCompactUsage", () => {
    test("formats basic usage without cost", () => {
      const usage: ModelUsage = {
        input: 1500,
        output: 500,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 2000,
        cost: { total: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      };
      expect(formatCompactUsage(usage)).toBe("1.5K in / 500 out");
    });

    test("formats usage with caching", () => {
      const usage: ModelUsage = {
        input: 1500,
        output: 500,
        cacheRead: 10000,
        cacheWrite: 2500,
        totalTokens: 14000,
        cost: { total: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      };
      expect(formatCompactUsage(usage)).toBe("1.5K in / 500 out / 10K cached / 2.5K cache write");
    });

    test("formats usage with cost", () => {
      const usage: ModelUsage = {
        input: 1000,
        output: 500,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 1500,
        cost: { total: 0.15, input: 0.1, output: 0.05, cacheRead: 0, cacheWrite: 0 },
      };
      expect(formatCompactUsage(usage)).toBe("1K in / 500 out / $0.1500");
    });
  });

  describe("formatUsageSummary", () => {
    test("formats full summary without cost", () => {
      const usage: ModelUsage = {
        input: 1500,
        output: 500,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 2000,
        cost: { total: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      };
      expect(formatUsageSummary(usage)).toBe("2,000 tokens / 1,500 input / 500 output");
    });

    test("formats full summary with all fields", () => {
      const usage: ModelUsage = {
        input: 1500,
        output: 500,
        reasoning: 100,
        cacheRead: 10000,
        cacheWrite: 2500,
        totalTokens: 14500,
        cost: { total: 1.5, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      };
      expect(formatUsageSummary(usage)).toBe("14,500 tokens / 1,500 input / 500 output / 100 reasoning / 10,000 cached / 2,500 cache write / $1.50");
    });

    test("computes total if totalTokens is missing or 0", () => {
      const usage: ModelUsage = {
        input: 1500,
        output: 500,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { total: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      };
      expect(formatUsageSummary(usage)).toBe("2,000 tokens / 1,500 input / 500 output");
    });
  });

  describe("usageBreakdownRows", () => {
    test("returns basic rows for input and output", () => {
      const usage: ModelUsage = {
        input: 1500,
        output: 500,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 2000,
        cost: { total: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      };
      expect(usageBreakdownRows(usage)).toEqual([
        { label: "Input", value: "1,500 tokens" },
        { label: "Output", value: "500 tokens" },
        { label: "Total", value: "2,000 tokens" },
      ]);
    });

    test("includes cache, reasoning, and cost when present", () => {
      const usage: ModelUsage = {
        input: 1500,
        output: 500,
        reasoning: 200,
        cacheRead: 1000,
        cacheWrite: 500,
        totalTokens: 3500,
        cost: { total: 0.05, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      };
      expect(usageBreakdownRows(usage)).toEqual([
        { label: "Input", value: "1,500 tokens" },
        { label: "Output", value: "500 tokens" },
        { label: "Cache Read", value: "1,000 tokens" },
        { label: "Cache Write", value: "500 tokens" },
        { label: "Reasoning", value: "200 tokens" },
        { label: "Cost", value: "$0.0500" },
        { label: "Total", value: "3,500 tokens" },
      ]);
    });

    test("computes total if totalTokens is 0", () => {
      const usage: ModelUsage = {
        input: 10,
        output: 20,
        cacheRead: 30,
        cacheWrite: 40,
        totalTokens: 0,
        cost: { total: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      };
      expect(usageBreakdownRows(usage)).toEqual([
        { label: "Input", value: "10 tokens" },
        { label: "Output", value: "20 tokens" },
        { label: "Cache Read", value: "30 tokens" },
        { label: "Cache Write", value: "40 tokens" },
        { label: "Total", value: "100 tokens" },
      ]);
    });
  });
});
