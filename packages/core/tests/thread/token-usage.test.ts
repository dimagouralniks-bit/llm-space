import { describe, expect, test } from "bun:test";

import {
  formatCompactUsage,
  formatUsageSummary,
  formatTokens,
  formatCost,
  usageBreakdownRows,
} from "../../src/thread/token-usage";
import type { ModelUsage } from "../../src/types";

const BASE_USAGE: ModelUsage = {
  input: 1000,
  output: 500,
  cacheRead: 200,
  cacheWrite: 100,
  reasoning: 0,
  totalTokens: 1800,
  cost: {
    input: 0.01,
    output: 0.02,
    cacheRead: 0.001,
    cacheWrite: 0.002,
    total: 0.033,
  },
};

describe("token-usage formatting", () => {
  describe("formatCompactUsage", () => {
    test("formats basic usage without cost or cache", () => {
      const usage: ModelUsage = {
        input: 1200,
        output: 300,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 1500,
        cost: { total: 0 },
      };
      expect(formatCompactUsage(usage)).toBe("1.2K in / 300 out");
    });

    test("formats usage with cache", () => {
      const usage: ModelUsage = {
        ...BASE_USAGE,
        cost: { total: 0 }, // Ignore cost for this test
      };
      expect(formatCompactUsage(usage)).toBe(
        "1K in / 500 out / 200 cached / 100 cache write"
      );
    });

    test("formats usage with cost", () => {
      const usage: ModelUsage = {
        input: 1200,
        output: 300,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 1500,
        cost: { total: 1.5 },
      };
      expect(formatCompactUsage(usage)).toBe("1.2K in / 300 out / $1.50");
    });

    test("formats usage with both cache and cost", () => {
      expect(formatCompactUsage(BASE_USAGE)).toBe(
        "1K in / 500 out / 200 cached / 100 cache write / $0.0330"
      );
    });
  });

  describe("formatUsageSummary", () => {
    test("formats basic usage", () => {
      const usage: ModelUsage = {
        input: 1200,
        output: 300,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 1500,
        cost: { total: 0 },
      };
      expect(formatUsageSummary(usage)).toBe(
        "1,500 tokens / 1,200 input / 300 output"
      );
    });

    test("formats usage with reasoning and cache", () => {
      const usage: ModelUsage = {
        ...BASE_USAGE,
        reasoning: 50,
        cost: { total: 0 },
      };
      expect(formatUsageSummary(usage)).toBe(
        "1,800 tokens / 1,000 input / 500 output / 50 reasoning / 200 cached / 100 cache write"
      );
    });

    test("formats usage with full details including cost", () => {
      const usage: ModelUsage = {
        ...BASE_USAGE,
        reasoning: 50,
      };
      expect(formatUsageSummary(usage)).toBe(
        "1,800 tokens / 1,000 input / 500 output / 50 reasoning / 200 cached / 100 cache write / $0.0330"
      );
    });

    test("calculates totalTokens correctly when missing", () => {
      const usage: ModelUsage = {
        input: 1000,
        output: 500,
        cacheRead: 200,
        cacheWrite: 100,
        cost: { total: 0 },
      };
      // totalTokens isn't passed, so it should be input + output + cacheRead + cacheWrite = 1800
      expect(formatUsageSummary(usage)).toBe(
        "1,800 tokens / 1,000 input / 500 output / 200 cached / 100 cache write"
      );
    });
  });

  describe("formatTokens", () => {
    test("formats positive integers with commas", () => {
      expect(formatTokens(1000)).toBe("1,000");
      expect(formatTokens(1234567)).toBe("1,234,567");
    });

    test("formats zero correctly", () => {
      expect(formatTokens(0)).toBe("0");
    });

    test("clamps negative numbers to zero", () => {
      expect(formatTokens(-50)).toBe("0");
    });

    test("rounds floating point numbers", () => {
      expect(formatTokens(10.4)).toBe("10");
      expect(formatTokens(10.5)).toBe("11");
    });
  });

  describe("formatCost", () => {
    test("returns null for empty or invalid costs", () => {
      expect(formatCost(undefined)).toBeNull();
      expect(formatCost(0)).toBeNull();
      expect(formatCost(-0.5)).toBeNull();
      expect(formatCost(Number.NaN)).toBeNull();
      expect(formatCost(Number.POSITIVE_INFINITY)).toBeNull();
    });

    test("formats costs >= $1 with 2 decimal places", () => {
      expect(formatCost(1)).toBe("$1.00");
      expect(formatCost(1.5)).toBe("$1.50");
      expect(formatCost(12.345)).toBe("$12.35");
    });

    test("formats costs >= $0.01 with 4 decimal places", () => {
      expect(formatCost(0.01)).toBe("$0.0100");
      expect(formatCost(0.12345)).toBe("$0.1235");
      expect(formatCost(0.99)).toBe("$0.9900");
    });

    test("formats costs < $0.01 with 6 decimal places", () => {
      expect(formatCost(0.001)).toBe("$0.001000");
      expect(formatCost(0.0001234)).toBe("$0.000123");
      expect(formatCost(0.0099)).toBe("$0.009900");
    });
  });

  describe("usageBreakdownRows", () => {
    test("returns basic breakdown without cache or cost", () => {
      const usage: ModelUsage = {
        input: 1200,
        output: 300,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 1500,
        cost: { total: 0 },
      };

      expect(usageBreakdownRows(usage)).toEqual([
        { label: "Input", value: "1,200 tokens" },
        { label: "Output", value: "300 tokens" },
        { label: "Total", value: "1,500 tokens" },
      ]);
    });

    test("includes cache and reasoning rows when present", () => {
      const usage: ModelUsage = {
        ...BASE_USAGE,
        reasoning: 50,
        cost: { total: 0 },
      };

      expect(usageBreakdownRows(usage)).toEqual([
        { label: "Input", value: "1,000 tokens" },
        { label: "Output", value: "500 tokens" },
        { label: "Cache Read", value: "200 tokens" },
        { label: "Cache Write", value: "100 tokens" },
        { label: "Reasoning", value: "50 tokens" },
        { label: "Total", value: "1,800 tokens" },
      ]);
    });

    test("includes cost row when present and > 0", () => {
      const usage: ModelUsage = {
        ...BASE_USAGE,
      };

      expect(usageBreakdownRows(usage)).toEqual([
        { label: "Input", value: "1,000 tokens" },
        { label: "Output", value: "500 tokens" },
        { label: "Cache Read", value: "200 tokens" },
        { label: "Cache Write", value: "100 tokens" },
        { label: "Cost", value: "$0.0330" },
        { label: "Total", value: "1,800 tokens" },
      ]);
    });

    test("calculates totalTokens correctly when totalTokens is not provided", () => {
      const usage: ModelUsage = {
        input: 1000,
        output: 500,
        cacheRead: 200,
        cacheWrite: 100,
        cost: { total: 0 },
      };

      const rows = usageBreakdownRows(usage);
      expect(rows[rows.length - 1]).toEqual({
        label: "Total",
        value: "1,800 tokens",
      });
    });
  });
});
