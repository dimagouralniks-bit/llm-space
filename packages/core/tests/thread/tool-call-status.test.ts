import { describe, expect, test } from "bun:test";

import {
  getToolCallOutputText,
  getToolCallStatus,
  getToolResultText,
  summarizeToolCalls,
} from "../../src/thread/tool-call-status";
import type { ToolCall } from "../../src/types";

describe("getToolResultText", () => {
  test("returns empty string when content is undefined", () => {
    expect(getToolResultText(undefined)).toBe("");
  });

  test("returns empty string when content is empty", () => {
    expect(getToolResultText([])).toBe("");
  });

  test("joins multiple text parts with newlines", () => {
    expect(
      getToolResultText([
        { type: "text", text: "Line 1" },
        { type: "text", text: "Line 2" },
      ])
    ).toBe("Line 1\nLine 2");
  });

  test("ignores non-text parts", () => {
    expect(
      getToolResultText([
        { type: "text", text: "Start" },
        { type: "image", mimeType: "image/png", data: "base64" },
        { type: "text", text: "End" },
      ])
    ).toBe("Start\nEnd");
  });
});

describe("getToolCallOutputText", () => {
  test("returns text content joined by newlines", () => {
    const toolCall: ToolCall = {
      id: "call-1",
      input: { name: "test", arguments: {} },
      output: {
        content: [
          { type: "text", text: "Hello" },
          { type: "text", text: "World" },
        ],
      },
    };
    expect(getToolCallOutputText(toolCall)).toBe("Hello\nWorld");
  });

  test("returns empty string when output is undefined", () => {
    const toolCall: ToolCall = {
      id: "call-1",
      input: { name: "test", arguments: {} },
    };
    expect(getToolCallOutputText(toolCall)).toBe("");
  });

  test("returns empty string when output content is empty", () => {
    const toolCall: ToolCall = {
      id: "call-1",
      input: { name: "test", arguments: {} },
      output: { content: [] },
    };
    expect(getToolCallOutputText(toolCall)).toBe("");
  });
});

describe("getToolCallStatus", () => {
  test("returns needsResponse when output is undefined", () => {
    const toolCall: ToolCall = {
      id: "call-1",
      input: { name: "test", arguments: {} },
    };
    expect(getToolCallStatus(toolCall)).toBe("needsResponse");
  });

  test("returns error when isError is true", () => {
    const toolCall: ToolCall = {
      id: "call-1",
      input: { name: "test", arguments: {} },
      output: {
        content: [{ type: "text", text: "Failed" }],
        isError: true,
      },
    };
    expect(getToolCallStatus(toolCall)).toBe("error");
  });

  test("returns ready when isError is false", () => {
    const toolCall: ToolCall = {
      id: "call-1",
      input: { name: "test", arguments: {} },
      output: {
        content: [{ type: "text", text: "Success" }],
        isError: false,
      },
    };
    expect(getToolCallStatus(toolCall)).toBe("ready");
  });

  test("returns ready when isError is undefined", () => {
    const toolCall: ToolCall = {
      id: "call-1",
      input: { name: "test", arguments: {} },
      output: {
        content: [{ type: "text", text: "Success" }],
      },
    };
    expect(getToolCallStatus(toolCall)).toBe("ready");
  });
});

describe("summarizeToolCalls", () => {
  test("correctly summarizes mixed statuses", () => {
    const toolCalls: ToolCall[] = [
      { id: "1", input: { name: "test", arguments: {} } }, // needsResponse
      {
        id: "2",
        input: { name: "test", arguments: {} },
        output: { content: [], isError: true },
      }, // error
      {
        id: "3",
        input: { name: "test", arguments: {} },
        output: { content: [] },
      }, // ready
      {
        id: "4",
        input: { name: "test", arguments: {} },
        output: { content: [], isError: false },
      }, // ready
    ];

    expect(summarizeToolCalls(toolCalls)).toEqual({
      totalCount: 4,
      readyCount: 2,
      errorCount: 1,
      needsResponseCount: 1,
      canContinue: false,
    });
  });

  test("returns canContinue true when all tools are ready or error", () => {
    const toolCalls: ToolCall[] = [
      {
        id: "1",
        input: { name: "test", arguments: {} },
        output: { content: [], isError: true },
      },
      {
        id: "2",
        input: { name: "test", arguments: {} },
        output: { content: [] },
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

  test("returns canContinue false when there are no tool calls", () => {
    expect(summarizeToolCalls([])).toEqual({
      totalCount: 0,
      readyCount: 0,
      errorCount: 0,
      needsResponseCount: 0,
      canContinue: false,
    });
  });
});
