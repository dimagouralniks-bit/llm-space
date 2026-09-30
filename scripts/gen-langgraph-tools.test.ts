import { expect, test, describe } from "bun:test";
import { renderManifest, readBuiltinToolSources, readVariablesSource } from "./gen-langgraph-tools";

describe("gen-langgraph-tools", () => {
  describe("renderManifest", () => {
    test("renders correctly with empty sources", () => {
      const output = renderManifest({}, "test-vars");
      expect(output).toContain("export const BUILTIN_TOOL_SOURCES: Record<string, string> = {\n\n};");
      expect(output).toContain('export const VARIABLES_PY_SOURCE = "test-vars";');
    });

    test("renders correctly with multiple sources", () => {
      const sources = {
        "tool-a": "source a",
        "tool-b": "source b",
      };
      const output = renderManifest(sources, "test-vars");
      expect(output).toContain('  "tool-a": "source a",\n  "tool-b": "source b",');
      expect(output).toContain('export const VARIABLES_PY_SOURCE = "test-vars";');
    });

    test("properly escapes strings", () => {
      const sources = {
        "tool-a": "source with \"quotes\" and \n newlines",
      };
      const output = renderManifest(sources, "vars with \"quotes\"");
      expect(output).toContain('"tool-a": "source with \\"quotes\\" and \\n newlines",');
      expect(output).toContain('export const VARIABLES_PY_SOURCE = "vars with \\"quotes\\"";');
    });
  });

  describe("readBuiltinToolSources", () => {
    test("reads tool sources from directory", async () => {
      const sources = await readBuiltinToolSources();
      expect(typeof sources).toBe("object");
      expect(Object.keys(sources).length).toBeGreaterThan(0);

      for (const [name, source] of Object.entries(sources)) {
        expect(typeof name).toBe("string");
        expect(typeof source).toBe("string");
        expect(source.length).toBeGreaterThan(0);
      }
    });
  });

  describe("readVariablesSource", () => {
    test("reads variables.py successfully", async () => {
      const source = await readVariablesSource();
      expect(typeof source).toBe("string");
      expect(source.length).toBeGreaterThan(0);
    });
  });
});
