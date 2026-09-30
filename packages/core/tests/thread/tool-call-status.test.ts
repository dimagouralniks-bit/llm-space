import { expect, test, describe } from "bun:test";
import {
  getToolResultText,
  getToolCallOutputText,
  getToolCallStatus,
  summarizeToolCalls,
} from "../../src/thread/tool-call-status";
import type { ToolCall } from "../../src/types";

describe("tool-call-status", () => {
  describe("getToolResultText", () => {
    test("returns empty string when content is undefined", () => {
      expect(getToolResultText(undefined)).toBe("");
    });

    test("filters text contents and joins them", () => {
      const content = [
        { type: "text" as const, text: "Hello" },
        { type: "image" as const, mimeType: "image/png", data: "base64..." },
        { type: "text" as const, text: "World" },
      ];
      expect(getToolResultText(content)).toBe("Hello\nWorld");
    });
  });

  describe("getToolCallOutputText", () => {
    test("returns text from tool call output", () => {
      const toolCall: ToolCall = {
        id: "call_123",
        input: { name: "test", arguments: {} },
        output: {
          content: [
            { type: "text", text: "Output result" }
          ]
        }
      };
      expect(getToolCallOutputText(toolCall)).toBe("Output result");
    });

    test("returns empty string when tool call output is missing", () => {
      const toolCall: ToolCall = {
        id: "call_123",
        input: { name: "test", arguments: {} },
      };
      expect(getToolCallOutputText(toolCall)).toBe("");
    });
  });

  describe("getToolCallStatus", () => {
    test("returns 'error' when output has isError true", () => {
      const toolCall: ToolCall = {
        id: "call_123",
        input: { name: "test", arguments: {} },
        output: {
          content: [],
          isError: true
        }
      };
      expect(getToolCallStatus(toolCall)).toBe("error");
    });

    test("returns 'ready' when output has isError false", () => {
      const toolCall: ToolCall = {
        id: "call_123",
        input: { name: "test", arguments: {} },
        output: {
          content: [],
          isError: false
        }
      };
      expect(getToolCallStatus(toolCall)).toBe("ready");
    });

    test("returns 'ready' when output has no isError flag", () => {
      const toolCall: ToolCall = {
        id: "call_123",
        input: { name: "test", arguments: {} },
        output: {
          content: [],
        }
      };
      expect(getToolCallStatus(toolCall)).toBe("ready");
    });

    test("returns 'needsResponse' when output is undefined", () => {
      const toolCall: ToolCall = {
        id: "call_123",
        input: { name: "test", arguments: {} },
      };
      expect(getToolCallStatus(toolCall)).toBe("needsResponse");
    });
  });

  describe("summarizeToolCalls", () => {
    test("summarizes empty array correctly", () => {
      const summary = summarizeToolCalls([]);
      expect(summary).toEqual({
        totalCount: 0,
        readyCount: 0,
        errorCount: 0,
        needsResponseCount: 0,
        canContinue: false,
      });
    });

    test("summarizes mixed tool calls correctly", () => {
      const toolCalls: ToolCall[] = [
        { id: "1", input: { name: "1", arguments: {} }, output: { content: [], isError: false } }, // ready
        { id: "2", input: { name: "2", arguments: {} }, output: { content: [], isError: true } },  // error
        { id: "3", input: { name: "3", arguments: {} } }, // needsResponse
      ];
      const summary = summarizeToolCalls(toolCalls);
      expect(summary).toEqual({
        totalCount: 3,
        readyCount: 1,
        errorCount: 1,
        needsResponseCount: 1,
        canContinue: false,
      });
    });

    test("canContinue is true only when there are tool calls and no needsResponse", () => {
      const toolCalls: ToolCall[] = [
        { id: "1", input: { name: "1", arguments: {} }, output: { content: [], isError: false } }, // ready
      ];
      const summary = summarizeToolCalls(toolCalls);
      expect(summary.canContinue).toBe(true);
    });
  });
});
