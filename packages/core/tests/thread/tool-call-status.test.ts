import { describe, expect, test } from "bun:test";
import {
  getToolResultText,
  getToolCallOutputText,
  getToolCallStatus,
  summarizeToolCalls,
} from "../../src/thread/tool-call-status";
import type { ToolCall, ToolCallOutput } from "../../src/types";

describe("tool-call-status", () => {
  describe("getToolResultText", () => {
    test("returns empty string when content is undefined", () => {
      expect(getToolResultText(undefined)).toBe("");
    });

    test("returns empty string when content is empty array", () => {
      expect(getToolResultText([])).toBe("");
    });

    test("returns joined text parts when content has only text parts", () => {
      const content: ToolCallOutput["content"] = [
        { type: "text", text: "Hello" },
        { type: "text", text: "World" },
      ];
      expect(getToolResultText(content)).toBe("Hello\nWorld");
    });

    test("returns empty string when content has only image parts", () => {
      const content: ToolCallOutput["content"] = [
        { type: "image", image: "base64" },
        { type: "image", image: "base64" },
      ];
      expect(getToolResultText(content)).toBe("");
    });

    test("returns joined text parts when content has mixed text and image parts", () => {
      const content: ToolCallOutput["content"] = [
        { type: "text", text: "Hello" },
        { type: "image", image: "base64" },
        { type: "text", text: "World" },
      ];
      expect(getToolResultText(content)).toBe("Hello\nWorld");
    });
  });

  describe("getToolCallOutputText", () => {
    test("returns empty string when toolCall has no output", () => {
      const toolCall: ToolCall = {
        id: "call_123",
        input: { name: "test_tool", arguments: {} },
      };
      expect(getToolCallOutputText(toolCall)).toBe("");
    });

    test("returns empty string when toolCall has output but no content", () => {
      const toolCall: ToolCall = {
        id: "call_123",
        input: { name: "test_tool", arguments: {} },
        output: { content: [] },
      };
      expect(getToolCallOutputText(toolCall)).toBe("");
    });

    test("returns text when toolCall has output with content", () => {
      const toolCall: ToolCall = {
        id: "call_123",
        input: { name: "test_tool", arguments: {} },
        output: {
          content: [
            { type: "text", text: "Hello" },
            { type: "image", image: "base64" },
            { type: "text", text: "World" },
          ],
        },
      };
      expect(getToolCallOutputText(toolCall)).toBe("Hello\nWorld");
    });
  });

  describe("getToolCallStatus", () => {
    test("returns needsResponse when toolCall has no output", () => {
      const toolCall: ToolCall = {
        id: "call_123",
        input: { name: "test_tool", arguments: {} },
      };
      expect(getToolCallStatus(toolCall)).toBe("needsResponse");
    });

    test("returns ready when toolCall has output but isError is false or undefined", () => {
      const toolCall1: ToolCall = {
        id: "call_123",
        input: { name: "test_tool", arguments: {} },
        output: { content: [] }, // isError is undefined
      };
      const toolCall2: ToolCall = {
        id: "call_456",
        input: { name: "test_tool", arguments: {} },
        output: { content: [], isError: false },
      };
      expect(getToolCallStatus(toolCall1)).toBe("ready");
      expect(getToolCallStatus(toolCall2)).toBe("ready");
    });

    test("returns error when toolCall has output and isError is true", () => {
      const toolCall: ToolCall = {
        id: "call_123",
        input: { name: "test_tool", arguments: {} },
        output: { content: [], isError: true },
      };
      expect(getToolCallStatus(toolCall)).toBe("error");
    });
  });

  describe("summarizeToolCalls", () => {
    test("returns default summary when array is empty", () => {
      expect(summarizeToolCalls([])).toEqual({
        totalCount: 0,
        readyCount: 0,
        errorCount: 0,
        needsResponseCount: 0,
        canContinue: false,
      });
    });

    test("summarizes properly when array has ready tool calls", () => {
      const toolCalls: ToolCall[] = [
        {
          id: "call_1",
          input: { name: "test", arguments: {} },
          output: { content: [] },
        },
        {
          id: "call_2",
          input: { name: "test", arguments: {} },
          output: { content: [] },
        },
      ];
      expect(summarizeToolCalls(toolCalls)).toEqual({
        totalCount: 2,
        readyCount: 2,
        errorCount: 0,
        needsResponseCount: 0,
        canContinue: true,
      });
    });

    test("summarizes properly when array has error tool calls", () => {
      const toolCalls: ToolCall[] = [
        {
          id: "call_1",
          input: { name: "test", arguments: {} },
          output: { content: [], isError: true },
        },
      ];
      expect(summarizeToolCalls(toolCalls)).toEqual({
        totalCount: 1,
        readyCount: 0,
        errorCount: 1,
        needsResponseCount: 0,
        canContinue: true,
      });
    });

    test("summarizes properly when array has tool calls needing response", () => {
      const toolCalls: ToolCall[] = [
        {
          id: "call_1",
          input: { name: "test", arguments: {} },
        },
      ];
      expect(summarizeToolCalls(toolCalls)).toEqual({
        totalCount: 1,
        readyCount: 0,
        errorCount: 0,
        needsResponseCount: 1,
        canContinue: false,
      });
    });

    test("summarizes properly when array has mixed tool calls", () => {
      const toolCalls: ToolCall[] = [
        {
          id: "call_1",
          input: { name: "test", arguments: {} },
          output: { content: [] }, // ready
        },
        {
          id: "call_2",
          input: { name: "test", arguments: {} },
          output: { content: [], isError: true }, // error
        },
        {
          id: "call_3",
          input: { name: "test", arguments: {} }, // needsResponse
        },
      ];
      expect(summarizeToolCalls(toolCalls)).toEqual({
        totalCount: 3,
        readyCount: 1,
        errorCount: 1,
        needsResponseCount: 1,
        canContinue: false,
      });
    });
  });
});
