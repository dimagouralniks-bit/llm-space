import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LangfuseClient } from "../../src/traces/langfuse-client";
import { TraceManager } from "../../src/traces/trace-manager";

describe("TraceManager", () => {
  let tmpHome: string;
  let traceManager: TraceManager;

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "trace-mgr-test-"));
    traceManager = new TraceManager({ homePath: tmpHome });
  });

  afterEach(async () => {
    await fs.rm(tmpHome, { recursive: true, force: true });
  });

  test("creates manual project and imports langfuse json", async () => {
    const project = await traceManager.createProject("Test Manual Project");
    expect(project.name).toBe("Test Manual Project");
    expect(project.source.mode).toBe("manual");

    const sampleJson = JSON.stringify([
      {
        id: "obs_1",
        traceId: "trace_1",
        name: "test observation",
        type: "GENERATION",
        startTime: "2025-01-01T00:00:00Z",
      },
    ]);

    const importResult = await traceManager.importLangfuseJson(project.id, [
      { name: "export.json", text: sampleJson },
    ]);

    expect(importResult.imported.length).toBe(1);
    expect(importResult.imported[0].id).toBe("trace_1");
    expect(importResult.warnings).toEqual([]);

    const traces = await traceManager.listTraces(project.id);
    expect(traces.length).toBe(1);
    expect(traces[0].id).toBe("trace_1");
  });

  test("syncs connected project traces with simulated latency", async () => {
    // Mock getProject to avoid network calls during connected project setup
    const originalGetProject = LangfuseClient.prototype.getProject;
    LangfuseClient.prototype.getProject = async function () {
      return { projectId: "lf_proj_1", projectName: "Langfuse Proj" };
    };

    const project = await traceManager.createConnectedProject({
      name: "Connected Project",
      baseUrl: "https://cloud.langfuse.com",
      publicKey: "pk-lf-1234567890",
      secretKey: "sk-lf-1234567890",
    });

    const originalGetObservations =
      LangfuseClient.prototype.getObservationsForTrace;

    const delayMs = 50;
    const traceCount = 5;
    const traceIds = Array.from({ length: traceCount }, (_, i) => `trace_id_${i}`);

    LangfuseClient.prototype.getObservationsForTrace = async function (traceId: string) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return {
        rows: [
          {
            id: `obs_${traceId}`,
            traceId,
            type: "GENERATION",
            startTime: "2025-01-01T00:00:00Z",
          },
        ],
        truncated: false,
        pageCount: 1,
        maxPages: 5,
      };
    };

    try {
      const startTime = performance.now();
      const syncResult = await traceManager.syncLangfuseTraces({
        projectId: project.id,
        traceIds,
      });
      const durationMs = performance.now() - startTime;

      expect(syncResult.imported.length).toBe(traceCount);
      expect(syncResult.skipped).toBe(0);
      expect(syncResult.warnings).toEqual([]);

      console.log(
        `Benchmark syncLangfuseTraces with ${traceCount} traces x ${delayMs}ms delay: ${durationMs.toFixed(2)}ms`
      );
    } finally {
      LangfuseClient.prototype.getProject = originalGetProject;
      LangfuseClient.prototype.getObservationsForTrace = originalGetObservations;
    }
  });
});
