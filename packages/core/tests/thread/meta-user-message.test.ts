import { describe, expect, test } from "bun:test";

import {
  isMetaUserMessage,
  scoreMetaUserMessage,
} from "../../src/thread/meta-user-message";
import type { ThreadContext } from "../../src/types";

describe("scoreMetaUserMessage", () => {
  test("returns score 0 and isMeta false when context is undefined", () => {
    expect(scoreMetaUserMessage(undefined)).toEqual({
      score: 0,
      isMeta: false,
    });
  });

  test("returns score 0 and isMeta false when the first message is not a user message", () => {
    const context: ThreadContext = {
      messages: [{ id: "1", role: "assistant", content: [] }],
    };
    expect(scoreMetaUserMessage(context)).toEqual({
      score: 0,
      isMeta: false,
    });
  });

  test("increases score by 2 if the second message is also a user message", () => {
    const context: ThreadContext = {
      messages: [
        {
          id: "1",
          role: "user",
          content: [{ type: "text", text: "first message" }],
        },
        {
          id: "2",
          role: "user",
          content: [{ type: "text", text: "second message" }],
        },
      ],
    };
    expect(scoreMetaUserMessage(context)).toEqual({
      score: 2,
      isMeta: false,
    });
  });

  test("increases score by 2 if the text starts with <system-reminder>", () => {
    const context: ThreadContext = {
      messages: [
        {
          id: "1",
          role: "user",
          content: [{ type: "text", text: "<system-reminder> reminder text" }],
        },
      ],
    };
    expect(scoreMetaUserMessage(context)).toEqual({
      score: 2,
      isMeta: false,
    });
  });

  test("increases score by 3 (2+1) if the text starts with <system-reminder> and ends with </system-reminder>", () => {
    const context: ThreadContext = {
      messages: [
        {
          id: "1",
          role: "user",
          content: [
            {
              type: "text",
              text: "<system-reminder> reminder text </system-reminder>",
            },
          ],
        },
      ],
    };
    expect(scoreMetaUserMessage(context)).toEqual({
      score: 3,
      isMeta: true,
    });
  });

  test("increases score by 1 if a known variable from context.variables is referenced", () => {
    const context: ThreadContext = {
      messages: [
        {
          id: "1",
          role: "user",
          content: [{ type: "text", text: "Hello {{ my_var }}" }],
        },
      ],
      variables: {
        my_var: { type: "json", value: "{}" },
      },
    };
    expect(scoreMetaUserMessage(context)).toEqual({
      score: 1,
      isMeta: false,
    });
  });

  test("increases score by 2 (1+1) if a known variable is referenced and is of type skills", () => {
    const context: ThreadContext = {
      messages: [
        {
          id: "1",
          role: "user",
          content: [{ type: "text", text: "Hello {{ my_skill }}" }],
        },
      ],
      variables: {
        my_skill: { type: "skills" },
      },
    };
    expect(scoreMetaUserMessage(context)).toEqual({
      score: 2,
      isMeta: false,
    });
  });

  test("increases score by 2 (1+1) if a known variable is referenced and is of type currentDate", () => {
    const context: ThreadContext = {
      messages: [
        {
          id: "1",
          role: "user",
          content: [{ type: "text", text: "Hello {{ today }}" }],
        },
      ],
      variables: {
        today: { type: "currentDate" },
      },
    };
    expect(scoreMetaUserMessage(context)).toEqual({
      score: 2,
      isMeta: false,
    });
  });

  test("collects known variables from context.variableVariants.variants and scores references", () => {
    const context: ThreadContext = {
      messages: [
        {
          id: "1",
          role: "user",
          content: [{ type: "text", text: "Using {{ variant_var }}" }],
        },
      ],
      variableVariants: {
        active: "default",
        variants: {
          default: {
            variant_var: "some value",
          },
        },
      },
    };
    expect(scoreMetaUserMessage(context)).toEqual({
      score: 1,
      isMeta: false,
    });
  });

  test("combines multiple scoring factors correctly", () => {
    const context: ThreadContext = {
      messages: [
        {
          id: "1",
          role: "user",
          content: [
            {
              type: "text",
              text: "<system-reminder> date: {{ today }} skills: {{ my_skill }} </system-reminder>",
            },
          ],
        },
        {
          id: "2",
          role: "user",
          content: [{ type: "text", text: "second user message" }],
        },
      ],
      variables: {
        today: { type: "currentDate" },
        my_skill: { type: "skills" },
      },
    };
    // Expected score:
    // +2 for second user message
    // +2 for startsWith <system-reminder>
    // +1 for endsWith </system-reminder>
    // +1 for referencing known variables
    // +1 for skills variable
    // +1 for currentDate variable
    // Total = 8
    expect(scoreMetaUserMessage(context)).toEqual({
      score: 8,
      isMeta: true,
    });
  });
});

describe("isMetaUserMessage", () => {
  test("returns true when score is >= 3", () => {
    const context: ThreadContext = {
      messages: [
        {
          id: "1",
          role: "user",
          content: [
            {
              type: "text",
              text: "<system-reminder> reminder text </system-reminder>",
            },
          ],
        },
      ],
    };
    expect(isMetaUserMessage(context)).toBe(true);
  });

  test("returns false when score is < 3", () => {
    const context: ThreadContext = {
      messages: [
        {
          id: "1",
          role: "user",
          content: [{ type: "text", text: "<system-reminder> reminder text" }],
        },
      ],
    };
    expect(isMetaUserMessage(context)).toBe(false);
  });
});
