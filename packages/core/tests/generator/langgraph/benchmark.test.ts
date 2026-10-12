import { describe, expect, test } from "bun:test";
import { langgraphGenerator } from "../../../src/generator/langgraph/index";
import type {
  GeneratorCapabilities,
  GeneratorRunInput,
} from "../../../src/generator/types";
import type { WorkflowContext } from "../../../src/workflow";
import type { FunctionTool, ThreadContext } from "../../../src/types";

describe("context export benchmark", () => {
  test("measures execution time for exporting context files with simulated async write latency", async () => {
    const ioDelayMs = 5;

    const createInput = (
      toolCount: number
    ): { input: GeneratorRunInput; written: string[] } => {
      const written: string[] = [];
      const tools: FunctionTool[] = Array.from(
        { length: toolCount },
        (_, i) => ({
          type: "function",
          name: `custom_tool_${i}`,
          description: `Description for custom tool ${i}`,
          parameters: { type: "object", properties: {} },
        })
      );

      const context: ThreadContext = {
        tools,
        variables: { var1: "val1", var2: "val2" },
      };

      const rendered: ThreadContext = {
        systemPrompt: "You are a helpful assistant.",
        messages: Array.from({ length: 5 }, (_, i) => ({
          role: i % 2 === 0 ? "user" : "assistant",
          content: `Message content ${i}`,
        })),
      };

      const capabilities: GeneratorCapabilities = {
        checkUv: () => Promise.resolve({ installed: false }),
        runUv: () =>
          Promise.resolve({
            code: 0,
            stdout: "",
            stderr: "",
            timedOut: false,
          }),
        writeFile: async (_rootDir, relativePath) => {
          await new Promise((resolve) => setTimeout(resolve, ioDelayMs));
          written.push(relativePath);
        },
        removeFile: () => Promise.resolve(),
      };

      return {
        written,
        input: {
          targetDir: "/test/dir",
          context,
          rendered,
          systemPromptTemplate: "You are a helpful assistant.",
          skills: [],
          renderedVariableValues: {},
          model: { provider: "openai", id: "gpt-4o" },
          modelInfo: {
            name: "GPT-4o",
            anthropic: false,
            deepseekThinking: false,
            supportsReasoning: true,
          },
          capabilities,
        },
      };
    };

    const workflow: WorkflowContext = {
      phase: () => undefined,
      log: () => undefined,
      agent: () => Promise.resolve(""),
      parallel: <T>(thunks: (() => Promise<T>)[]) =>
        Promise.all(thunks.map((thunk) => thunk())),
      signal: new AbortController().signal,
    };

    const { input, written } = createInput(20);
    const start = performance.now();
    await langgraphGenerator.run(workflow, input);
    const elapsed = performance.now() - start;

    console.log(
      `[Benchmark] Export context timing: ${elapsed.toFixed(2)} ms (${written.length} files total)`
    );
    expect(written.length).toBeGreaterThan(20);
  });
});
