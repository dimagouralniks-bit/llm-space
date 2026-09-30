import { describe, expect, test } from "bun:test";

import {
  listPromptVariableCompletions,
  resolvePromptVariableValue,
  resolvePromptVariableValueForPlace,
  resolvePromptVariableValueSync,
} from "../../src/thread/prompt-variable-display";
import type { ThreadContext } from "../../src/types";

function createContext(extra?: Partial<ThreadContext>): ThreadContext {
  return {
    systemPrompt: "",
    ...extra,
  } as ThreadContext;
}

describe("resolvePromptVariableValueSync", () => {
  test("returns invalid for invalid variable names", () => {
    expect(resolvePromptVariableValueSync("bad name!", createContext())).toEqual({
      status: "invalid",
      name: "bad name!",
    });
  });

  test("returns unknown for an unknown custom variable", () => {
    expect(resolvePromptVariableValueSync("missing", createContext())).toEqual({
      status: "unknown",
      name: "missing",
    });
  });

  test("returns empty for a custom variable that is whitespace only", () => {
    const ctx = createContext({
      variableVariants: {
        active: "default",
        variants: { default: { blank: "   " } },
      },
    });
    expect(resolvePromptVariableValueSync("blank", ctx)).toEqual({
      status: "empty",
      name: "blank",
    });
  });

  test("returns ok for a valid custom variable", () => {
    const ctx = createContext({
      variableVariants: {
        active: "default",
        variants: { default: { foo: "bar" } },
      },
    });
    expect(resolvePromptVariableValueSync("foo", ctx)).toEqual({
      status: "ok",
      value: "bar",
    });
  });

  test("handles built-in currentDate", () => {
    const ctx = createContext({
      variables: {
        now: { type: "currentDate", format: "iso-date" },
      },
    });
    const result = resolvePromptVariableValueSync("now", ctx);
    expect(result.status).toBe("ok");
  });

  test("handles built-in workingDirectory", () => {
    const ctx = createContext({
      variables: {
        dir: { type: "workingDirectory", value: "/my/dir" },
      },
    });
    expect(resolvePromptVariableValueSync("dir", ctx)).toEqual({
      status: "ok",
      value: "/my/dir",
    });
  });

  test("returns empty for workingDirectory with blank value", () => {
    const ctx = createContext({
      variables: {
        dir: { type: "workingDirectory", value: "   " },
      },
    });
    expect(resolvePromptVariableValueSync("dir", ctx)).toEqual({
      status: "empty",
      name: "dir",
    });
  });

  test("returns needsSkills for skills variable", () => {
    const ctx = createContext({
      variables: {
        my_skills: {
          type: "skills",
          skillNames: [],
          format: "markdown-list",
          indent: 0,
        },
      },
    });
    const res = resolvePromptVariableValueSync("my_skills", ctx);
    expect(res).toEqual({
      status: "needsSkills",
      variable: {
        type: "skills",
        skillNames: [],
        format: "markdown-list",
        indent: 0,
      },
    });
  });

  test("handles built-in json", () => {
    const ctx = createContext({
      variables: {
        data: { type: "json", value: '{"key": "value"}' },
      },
    });
    expect(resolvePromptVariableValueSync("data", ctx)).toEqual({
      status: "ok",
      value: '{\n  "key": "value"\n}',
    });
  });

  test("returns empty for invalid built-in json", () => {
    const ctx = createContext({
      variables: {
        data: { type: "json", value: '{key: "value"' }, // invalid json
      },
    });
    // In formatJsonVariable: invalid json returns the original trimmed string, so not empty
    expect(resolvePromptVariableValueSync("data", ctx)).toEqual({
      status: "ok",
      value: '{key: "value"',
    });
  });

  test("handles built-in file", () => {
    const ctx = createContext({
      variables: {
        doc: { type: "file", value: "/path/to/file.txt" },
      },
    });
    expect(resolvePromptVariableValueSync("doc", ctx)).toEqual({
      status: "ok",
      value: "/path/to/file.txt",
    });
  });

  test("returns empty for built-in file with blank path", () => {
    const ctx = createContext({
      variables: {
        doc: { type: "file", value: "   " },
      },
    });
    expect(resolvePromptVariableValueSync("doc", ctx)).toEqual({
      status: "empty",
      name: "doc",
    });
  });
});

describe("resolvePromptVariableValue", () => {
  const loadSkills = async () => [
    { name: "skillA", description: "descA", path: "/path/A" },
    { name: "skillB", description: "descB", path: "/path/B" },
  ];
  const resolvePath = async (p: string) => `/resolved${p}`;

  test("resolves skills variable", async () => {
    const ctx = createContext({
      variables: {
        my_skills: {
          type: "skills",
          skillNames: ["skillA"],
          format: "markdown-list",
          indent: 0,
        },
      },
    });
    const res = await resolvePromptVariableValue("my_skills", ctx, loadSkills);
    expect(res).toEqual({
      status: "ok",
      value: "- **skillA**: descA",
    });
  });

  test("resolves workingDirectory with resolvePath", async () => {
    const ctx = createContext({
      variables: {
        dir: { type: "workingDirectory", value: "/dir" },
      },
    });
    const res = await resolvePromptVariableValue(
      "dir",
      ctx,
      loadSkills,
      resolvePath
    );
    expect(res).toEqual({
      status: "ok",
      value: "/resolved/dir",
    });
  });

  test("resolves custom variable fast path", async () => {
    const ctx = createContext({
      variableVariants: {
        active: "default",
        variants: { default: { foo: "bar" } },
      },
    });
    const res = await resolvePromptVariableValue("foo", ctx, loadSkills);
    expect(res).toEqual({
      status: "ok",
      value: "bar",
    });
  });

  test("returns ok even if loaded skills are empty formatted when includeAll is true (or empty)", async () => {
    const ctx = createContext({
      variables: {
        my_skills: {
          type: "skills",
          skillNames: [],
          format: "markdown-list",
          indent: 0,
        },
      },
    });
    const res = await resolvePromptVariableValue("my_skills", ctx, loadSkills);
    // includesAllSkills is true because skillNames.length === 0, so it includes all skills
    expect(res).toEqual({
      status: "ok",
      value: "- **skillA**: descA\n\n- **skillB**: descB",
    });
  });

  test("returns unknown if loadSkills throws", async () => {
    const ctx = createContext({
      variables: {
        my_skills: {
          type: "skills",
          skillNames: ["skillA"],
          format: "markdown-list",
          indent: 0,
        },
      },
    });
    const failSkills = async () => {
      throw new Error("fail");
    };
    const res = await resolvePromptVariableValue(
      "my_skills",
      ctx,
      failSkills as any
    );
    expect(res).toEqual({
      status: "unknown",
      name: "my_skills",
    });
  });
});

describe("resolvePromptVariableValueForPlace", () => {
  const loadSkills = async () => [];
  const resolvePath = async (p: string) => `/resolved${p}`;

  test("returns invalid for invalid variable name", async () => {
    const res = await resolvePromptVariableValueForPlace(
      "bad name",
      createContext(),
      "place1",
      loadSkills
    );
    expect(res).toEqual({ status: "invalid", name: "bad name" });
  });

  test("returns frozen value if present in snapshot", async () => {
    const ctx = createContext({
      snapshot: {
        variables: {
          place1: {
            foo: "frozenValue",
          },
        },
      },
    });
    const res = await resolvePromptVariableValueForPlace(
      "foo",
      ctx,
      "place1",
      loadSkills
    );
    expect(res).toEqual({ status: "ok", value: "frozenValue" });
  });

  test("resolves workingDirectory frozen value with resolvePath", async () => {
    const ctx = createContext({
      variables: {
        dir: { type: "workingDirectory", value: "/new/dir" },
      },
      snapshot: {
        variables: {
          place1: {
            dir: "/old/dir",
          },
        },
      },
    });
    const res = await resolvePromptVariableValueForPlace(
      "dir",
      ctx,
      "place1",
      loadSkills,
      resolvePath
    );
    expect(res).toEqual({ status: "ok", value: "/resolved/old/dir" });
  });

  test("falls back to resolvePromptVariableValue if not frozen", async () => {
    const ctx = createContext({
      variableVariants: {
        active: "default",
        variants: { default: { foo: "liveValue" } },
      },
    });
    const res = await resolvePromptVariableValueForPlace(
      "foo",
      ctx,
      "place1",
      loadSkills
    );
    expect(res).toEqual({ status: "ok", value: "liveValue" });
  });

  test("falls back to resolvePromptVariableValue if placeKey is undefined", async () => {
    const ctx = createContext({
      variableVariants: {
        active: "default",
        variants: { default: { foo: "liveValue" } },
      },
      snapshot: {
        variables: {
          place1: {
            foo: "frozenValue",
          },
        },
      },
    });
    const res = await resolvePromptVariableValueForPlace(
      "foo",
      ctx,
      undefined,
      loadSkills
    );
    expect(res).toEqual({ status: "ok", value: "liveValue" });
  });
});

describe("listPromptVariableCompletions", () => {
  test("returns expected completions sorted by name", () => {
    const ctx = createContext({
      variables: {
        now: { type: "currentDate", format: "iso-date" },
        dir: { type: "workingDirectory", value: " /my/dir " },
        data: { type: "json", value: '{"k": "v"}' },
        doc: { type: "file", value: " path/to/file " },
        my_skills: {
          type: "skills",
          skillNames: ["skillA", "skillB"],
          format: "markdown-list",
          indent: 0,
        },
        all_skills: {
          type: "skills",
          skillNames: [],
          includeAll: true,
          format: "markdown-list",
          indent: 0,
        },
        no_skills: {
          type: "skills",
          skillNames: [],
          format: "markdown-list",
          indent: 0,
        },
        one_skill: {
          type: "skills",
          skillNames: ["skillA"],
          format: "markdown-list",
          indent: 0,
        },
      },
      variableVariants: {
        active: "default",
        variants: {
          default: {
            foo: " bar ",
            blank: "  ",
          },
        },
      },
    });

    const completions = listPromptVariableCompletions(ctx);

    // now hint varies depending on actual date, but we can check the others
    expect(completions).toContainEqual({ name: "all_skills", hint: "All enabled skills" });
    expect(completions).toContainEqual({ name: "blank", hint: "(empty)" });
    expect(completions).toContainEqual({ name: "data", hint: '{ "k": "v" }' });
    expect(completions).toContainEqual({ name: "dir", hint: "/my/dir" });
    expect(completions).toContainEqual({ name: "doc", hint: "path/to/file" });
    expect(completions).toContainEqual({ name: "foo", hint: "bar" });
    expect(completions).toContainEqual({ name: "my_skills", hint: "2 selected skills" });
    expect(completions).toContainEqual({ name: "no_skills", hint: "All enabled skills" });
    expect(completions).toContainEqual({ name: "one_skill", hint: "1 selected skill" });

    // length is 10
    expect(completions.length).toBe(10);

    // sorted correctly
    expect(completions.map(c => c.name)).toEqual([
      "all_skills", "blank", "data", "dir", "doc", "foo", "my_skills", "no_skills", "now", "one_skill"
    ]);
  });

  test("handles empty values in built-in variables for completions", () => {
    const ctx = createContext({
      variables: {
        dir_empty: { type: "workingDirectory", value: "  " },
        data_empty: { type: "json", value: "invalid" },
        doc_empty: { type: "file", value: "  " },
      },
    });

    const completions = listPromptVariableCompletions(ctx);
    // note that by default when passing variables without overriding them, the builtins might be added?
    // actually they might be added by normalizePromptVariableState, but `variables` provided will be mixed with default ones.
    expect(completions).toContainEqual({ name: "data_empty", hint: "invalid" });
    expect(completions).toContainEqual({ name: "dir_empty", hint: "(empty)" });
    expect(completions).toContainEqual({ name: "doc_empty", hint: "(no file)" });
  });
});
