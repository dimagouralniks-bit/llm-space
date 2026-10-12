import { describe, expect, test } from "bun:test";

import { z } from "zod";

import { deepCloneJSON, parseJSON, parseJsonWithSchema } from "../../src/utils/json";

const StateSchema = z.object({
  frame: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  isMaximized: z.boolean().optional(),
});

describe("parseJsonWithSchema", () => {
  test("returns strict status for valid JSON matching schema", () => {
    const result = parseJsonWithSchema(
      '{"frame":{"x":1,"y":2,"width":3,"height":4}}',
      StateSchema
    );
    expect(result).toEqual({
      status: "strict",
      value: {
        frame: { x: 1, y: 2, width: 3, height: 4 },
      },
    });
  });

  test("distinguishes strict JSON from recovered truncated JSON", () => {
    expect(
      parseJsonWithSchema(
        '{"frame":{"x":1,"y":2,"width":3,"height":4}}',
        StateSchema,
        { recovery: "best-effort" }
      ).status
    ).toBe("strict");

    const result = parseJsonWithSchema(
      '{"frame":{"x":2560,"y":1871,"width":1440,"height":1265},"isMaximized":false,"isFullScree',
      StateSchema,
      { recovery: "best-effort" }
    );
    expect(result).toEqual({
      status: "recovered",
      value: {
        frame: { x: 2560, y: 1871, width: 1440, height: 1265 },
        isMaximized: false,
      },
    });
  });

  test("rejects a strict JSON value that fails schema validation", () => {
    const result = parseJsonWithSchema(
      '{"frame":{"x":1,"y":2,"width":-10,"height":4}}',
      StateSchema
    );
    expect(result.status).toBe("invalid-shape");
    if (result.status === "invalid-shape") {
      expect(result.error).toBeInstanceOf(z.ZodError);
    }
  });

  test("returns invalid-json for broken JSON when recovery is none or default", () => {
    const defaultResult = parseJsonWithSchema(
      '{"frame":{"x":1,"y":2,"width":3',
      StateSchema
    );
    expect(defaultResult.status).toBe("invalid-json");
    if (defaultResult.status === "invalid-json") {
      expect(defaultResult.error).toBeInstanceOf(Error);
    }

    const noneResult = parseJsonWithSchema(
      '{"frame":{"x":1,"y":2,"width":3',
      StateSchema,
      { recovery: "none" }
    );
    expect(noneResult.status).toBe("invalid-json");
    if (noneResult.status === "invalid-json") {
      expect(noneResult.error).toBeInstanceOf(Error);
    }
  });

  test("uses recoverySchema when provided during recovery", () => {
    const CustomRecoverySchema = z.object({
      frame: z.object({
        x: z.number(),
        y: z.number(),
      }),
    });

    const result = parseJsonWithSchema(
      '{"frame":{"x":100,"y":200,"width":',
      CustomRecoverySchema as unknown as z.ZodType<{
        frame: { x: number; y: number };
      }>,
      {
        recovery: "best-effort",
        recoverySchema: CustomRecoverySchema,
      }
    );

    expect(result.status).toBe("recovered");
    if (result.status === "recovered") {
      expect(result.value).toEqual({
        frame: { x: 100, y: 200 },
      });
    }
  });

  test("rejects a recovered value that fails Zod validation", () => {
    const result = parseJsonWithSchema(
      '{"frame":{"x":1,"y":2,"width":0',
      StateSchema,
      { recovery: "best-effort" }
    );
    expect(result.status).toBe("invalid-shape");
    if (result.status === "invalid-shape") {
      expect(result.error).toBeInstanceOf(z.ZodError);
    }
  });
});

describe("parseJSON", () => {
  test("parses valid JSON string", () => {
    const result = parseJSON<{ a: number }>('{"a": 123}');
    expect(result).toEqual({ a: 123 });
  });

  test("parses truncated JSON string with best effort", () => {
    const result = parseJSON<{ name: string; items: number[] }>(
      '{"name": "test", "items": [1, 2,'
    );
    expect(result).toEqual({ name: "test", items: [1, 2] });
  });
});

describe("deepCloneJSON", () => {
  test("creates a deep clone of an object", () => {
    const original = { a: 1, b: { c: [1, 2, 3] } };
    const cloned = deepCloneJSON(original);

    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned.b).not.toBe(original.b);
    expect(cloned.b.c).not.toBe(original.b.c);
  });
});
