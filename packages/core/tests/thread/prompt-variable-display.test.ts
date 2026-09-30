import { describe, expect, test } from "bun:test";

import {
  resolvePromptVariableValueSync,
  resolvePromptVariableValue,
  resolvePromptVariableValueForPlace,
  listPromptVariableCompletions,
} from "../../src/thread/prompt-variable-display";
import type { ThreadContext } from "../../src/types";

function context(variables: any = {}, customValues: any = {}, snapshot?: any): ThreadContext {
  return {
    systemPrompt: "",
    variables,
    variableVariants: {
      active: "default",
      variants: { default: customValues },
    },
    snapshot,
  } as ThreadContext;
}

const mockLoadSkills = () =>
  Promise.resolve([
    { name: "skill1", description: "First Skill", path: "/skills/skill1" },
    { name: "skill2", description: "Second Skill", path: "/skills/skill2" },
  ]);

const mockResolvePath = (path: string) => Promise.resolve(`/resolved/${path}`);

describe("resolvePromptVariableValueSync", () => {
  test("returns invalid for invalid variable names", () => {
    expect(resolvePromptVariableValueSync("bad name!", undefined)).toEqual({
      status: "invalid",
      name: "bad name!",
    });
  });

  test("handles currentDate built-in variable", () => {
    const ctx = context({
      my_date: { type: "currentDate", format: "iso-date" },
    });
    const result = resolvePromptVariableValueSync("my_date", ctx);
    expect(result.status).toBe("ok");
    // Value will be current date, just check string type
    if (result.status === "ok") {
      expect(typeof result.value).toBe("string");
    }
  });

  test("handles workingDirectory variable", () => {
    const ctxOk = context({
      wd: { type: "workingDirectory", value: "src/main" },
    });
    expect(resolvePromptVariableValueSync("wd", ctxOk)).toEqual({
      status: "ok",
      value: "src/main",
    });

    const ctxEmpty = context({
      wd: { type: "workingDirectory", value: "   " },
    });
    expect(resolvePromptVariableValueSync("wd", ctxEmpty)).toEqual({
      status: "empty",
      name: "wd",
    });
  });

  test("handles skills variable", () => {
    const ctx = context({
      my_skills: { type: "skills", skillNames: ["skill1"], format: "markdown-list" },
    });
    expect(resolvePromptVariableValueSync("my_skills", ctx)).toEqual({
      status: "needsSkills",
      variable: { type: "skills", skillNames: ["skill1"], format: "markdown-list", indent: 0 },
    });
  });

  test("handles json variable", () => {
    const ctxOk = context({
      data: { type: "json", value: '{"foo": "bar"}' },
    });
    expect(resolvePromptVariableValueSync("data", ctxOk)).toEqual({
      status: "ok",
      value: '{\n  "foo": "bar"\n}',
    });

    const ctxBad = context({
      data: { type: "json", value: '{bad' },
    });
    expect(resolvePromptVariableValueSync("data", ctxBad)).toEqual({
      status: "ok",
      value: '{bad',
    });
  });

  test("handles file variable", () => {
    const ctxOk = context({
      doc: { type: "file", value: "README.md" },
    });
    expect(resolvePromptVariableValueSync("doc", ctxOk)).toEqual({
      status: "ok",
      value: "README.md",
    });

    const ctxEmpty = context({
      doc: { type: "file", value: "   " },
    });
    expect(resolvePromptVariableValueSync("doc", ctxEmpty)).toEqual({
      status: "empty",
      name: "doc",
    });
  });

  test("handles custom variables", () => {
    const ctxOk = context({}, { customVar: "custom value" });
    expect(resolvePromptVariableValueSync("customVar", ctxOk)).toEqual({
      status: "ok",
      value: "custom value",
    });

    const ctxEmpty = context({}, { customVar: "   " });
    expect(resolvePromptVariableValueSync("customVar", ctxEmpty)).toEqual({
      status: "empty",
      name: "customVar",
    });
  });

  test("returns unknown for missing variables", () => {
    const ctx = context();
    expect(resolvePromptVariableValueSync("missingVar", ctx)).toEqual({
      status: "unknown",
      name: "missingVar",
    });
  });
});

describe("resolvePromptVariableValue", () => {
  test("defers to sync resolution for non-skills", async () => {
    const ctx = context({}, { customVar: "async value" });
    const result = await resolvePromptVariableValue(
      "customVar",
      ctx,
      mockLoadSkills,
      mockResolvePath
    );
    expect(result).toEqual({ status: "ok", value: "async value" });
  });

  test("resolves path for workingDirectory if resolvePath is provided", async () => {
    const ctx = context({
      wd: { type: "workingDirectory", value: "src/main" },
    });
    const result = await resolvePromptVariableValue(
      "wd",
      ctx,
      mockLoadSkills,
      mockResolvePath
    );
    expect(result).toEqual({ status: "ok", value: "/resolved/src/main" });
  });

  test("does not resolve path for workingDirectory if resolvePath is not provided", async () => {
    const ctx = context({
      wd: { type: "workingDirectory", value: "src/main" },
    });
    const result = await resolvePromptVariableValue(
      "wd",
      ctx,
      mockLoadSkills
    );
    expect(result).toEqual({ status: "ok", value: "src/main" });
  });

  test("resolves skills variable correctly", async () => {
    const ctxSubset = context({
      my_skills: { type: "skills", skillNames: ["skill2"], format: "markdown-list", indent: 0 },
    });
    const resultSubset = await resolvePromptVariableValue(
      "my_skills",
      ctxSubset,
      mockLoadSkills
    );
    expect(resultSubset).toEqual({
      status: "ok",
      value: "- **skill2**: Second Skill",
    });

    const ctxAll = context({
      my_skills: { type: "skills", skillNames: [], includeAll: true, format: "markdown-list", indent: 0 },
    });
    const resultAll = await resolvePromptVariableValue(
      "my_skills",
      ctxAll,
      mockLoadSkills
    );
    expect(resultAll).toEqual({
      status: "ok",
      value: "- **skill1**: First Skill\n\n- **skill2**: Second Skill",
    });
  });

  test("handles loadSkills error gracefully", async () => {
    const ctx = context({
      my_skills: { type: "skills", skillNames: ["skill1"], format: "markdown-list" },
    });
    const result = await resolvePromptVariableValue(
      "my_skills",
      ctx,
      () => Promise.reject(new Error("Failed to load skills"))
    );
    expect(result).toEqual({ status: "unknown", name: "my_skills" });
  });
});

describe("resolvePromptVariableValueForPlace", () => {
  test("returns invalid for invalid names", async () => {
    const result = await resolvePromptVariableValueForPlace(
      "bad name!",
      undefined,
      "systemPrompt",
      mockLoadSkills
    );
    expect(result).toEqual({ status: "invalid", name: "bad name!" });
  });

  test("returns frozen value if snapshot exists for placeKey and name", async () => {
    const ctx = context(
      {},
      {},
      { variables: { systemPrompt: { frozenVar: "frozen value" } } }
    );
    const result = await resolvePromptVariableValueForPlace(
      "frozenVar",
      ctx,
      "systemPrompt",
      mockLoadSkills
    );
    expect(result).toEqual({ status: "ok", value: "frozen value" });
  });

  test("resolves path for frozen workingDirectory value", async () => {
    const ctx = context(
      { wd: { type: "workingDirectory", value: "src/main" } },
      {},
      { variables: { systemPrompt: { wd: "frozen/src/main" } } }
    );
    const result = await resolvePromptVariableValueForPlace(
      "wd",
      ctx,
      "systemPrompt",
      mockLoadSkills,
      mockResolvePath
    );
    expect(result).toEqual({ status: "ok", value: "/resolved/frozen/src/main" });
  });

  test("falls back to standard resolution if no snapshot exists", async () => {
    const ctx = context({}, { customVar: "fallback value" }, {});
    const result = await resolvePromptVariableValueForPlace(
      "customVar",
      ctx,
      "systemPrompt",
      mockLoadSkills
    );
    expect(result).toEqual({ status: "ok", value: "fallback value" });
  });
});

describe("listPromptVariableCompletions", () => {
  test("lists correctly formatted completions sorted by name", () => {
    const ctx = context(
      {
        z_date: { type: "currentDate", format: "iso-date" },
        y_wd: { type: "workingDirectory", value: "  /my/path \n " },
        x_wd_empty: { type: "workingDirectory", value: "   " },
        w_json: { type: "json", value: '{"a": 1}' },
        v_json_bad: { type: "json", value: '{bad' },
        u_file: { type: "file", value: "file.md" },
        t_file_empty: { type: "file", value: "  " },
        s_skills_all: { type: "skills", skillNames: [], includeAll: true },
        r_skills_none: { type: "skills", skillNames: [], includeAll: false },
        q_skills_some: { type: "skills", skillNames: ["skill1", "skill2"], includeAll: false },
        p_skills_one: { type: "skills", skillNames: ["skill1"], includeAll: false },
      },
      {
        b_custom: "  custom string \n value ",
        a_custom_empty: "   ",
      }
    );

    const completions = listPromptVariableCompletions(ctx);

    expect(completions).toEqual([
      { name: "a_custom_empty", hint: "(empty)" },
      { name: "b_custom", hint: "custom string value" },
      { name: "p_skills_one", hint: "1 selected skill" },
      { name: "q_skills_some", hint: "2 selected skills" },
      { name: "r_skills_none", hint: "No skills selected" },
      { name: "s_skills_all", hint: "All enabled skills" },
      { name: "t_file_empty", hint: "(no file)" },
      { name: "u_file", hint: "file.md" },
      { name: "v_json_bad", hint: "{bad" },
      { name: "w_json", hint: '{ "a": 1 }' },
      { name: "x_wd_empty", hint: "(empty)" },
      { name: "y_wd", hint: "/my/path" },
      { name: "z_date", hint: expect.any(String) },
    ]);
  });
});
