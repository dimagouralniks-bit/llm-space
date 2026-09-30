import { describe, expect, test } from "bun:test";

import {
  getToolCallOutputText,
  getToolCallStatus,
  getToolResultText,
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

    test("returns text for text content", () => {
      const content: ToolCallOutput["content"] = [
        { type: "text", text: "Hello" },
      ];
      expect(getToolResultText(content)).toBe("Hello");
    });

    test("ignores image content", () => {
      const content: ToolCallOutput["content"] = [
        { type: "image", mimeType: "image/png", data: "base64data" },
      ];
      expect(getToolResultText(content)).toBe("");
    });

    test("joins multiple text parts with newlines", () => {
      const content: ToolCallOutput["content"] = [
        { type: "text", text: "Line 1" },
        { type: "image", mimeType: "image/png", data: "base64data" },
        { type: "text", text: "Line 2" },
      ];
      expect(getToolResultText(content)).toBe("Line 1\nLine 2");
    });
  });

  describe("getToolCallOutputText", () => {
    test("returns empty string when output is undefined", () => {
      const toolCall: ToolCall = {
        id: "call_1",
        input: { name: "test", arguments: {} },
      };
      expect(getToolCallOutputText(toolCall)).toBe("");
    });

    test("returns empty string when output content is undefined", () => {
      const toolCall: ToolCall = {
        id: "call_1",
        input: { name: "test", arguments: {} },
        output: { content: [] },
      };
      expect(getToolCallOutputText(toolCall)).toBe("");
    });

    test("returns joined text when output has text content", () => {
      const toolCall: ToolCall = {
        id: "call_1",
        input: { name: "test", arguments: {} },
        output: {
          content: [
            { type: "text", text: "Result 1" },
            { type: "text", text: "Result 2" },
          ],
        },
      };
      expect(getToolCallOutputText(toolCall)).toBe("Result 1\nResult 2");
    });
  });

  describe("getToolCallStatus", () => {
    test("returns 'needsResponse' when output is undefined", () => {
      const toolCall: ToolCall = {
        id: "call_1",
        input: { name: "test", arguments: {} },
      };
      expect(getToolCallStatus(toolCall)).toBe("needsResponse");
    });

    test("returns 'error' when output isError is true", () => {
      const toolCall: ToolCall = {
        id: "call_1",
        input: { name: "test", arguments: {} },
        output: { content: [], isError: true },
      };
      expect(getToolCallStatus(toolCall)).toBe("error");
    });

    test("returns 'ready' when output isError is false or undefined", () => {
      const toolCall: ToolCall = {
        id: "call_1",
        input: { name: "test", arguments: {} },
        output: { content: [] },
      };
      expect(getToolCallStatus(toolCall)).toBe("ready");

      const toolCall2: ToolCall = {
        id: "call_2",
        input: { name: "test", arguments: {} },
        output: { content: [], isError: false },
      };
      expect(getToolCallStatus(toolCall2)).toBe("ready");
    });
  });

  describe("summarizeToolCalls", () => {
    test("returns 0 counts and canContinue: false for empty array", () => {
      expect(summarizeToolCalls([])).toEqual({
        totalCount: 0,
        readyCount: 0,
        errorCount: 0,
        needsResponseCount: 0,
        canContinue: false,
      });
    });

    test("counts correctly and sets canContinue: true when all ready", () => {
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

    test("counts correctly and sets canContinue: true when there are errors but no needsResponse", () => {
      const toolCalls: ToolCall[] = [
        {
          id: "call_1",
          input: { name: "test", arguments: {} },
          output: { content: [] },
        },
        {
          id: "call_2",
          input: { name: "test", arguments: {} },
          output: { content: [], isError: true },
        },
      ];
      expect(summarizeToolCalls(toolCalls)).toEqual({
        totalCount: 2,
        readyCount: 1,
        errorCount: 1,
        needsResponseCount: 0,
        canContinue: true,
      });
    });

    test("counts correctly and sets canContinue: false when needs response", () => {
      const toolCalls: ToolCall[] = [
        {
          id: "call_1",
          input: { name: "test", arguments: {} },
          output: { content: [] }, // ready
        },
        {
          id: "call_2",
          input: { name: "test", arguments: {} }, // needsResponse
        },
        {
          id: "call_3",
          input: { name: "test", arguments: {} },
          output: { content: [], isError: true }, // error
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
