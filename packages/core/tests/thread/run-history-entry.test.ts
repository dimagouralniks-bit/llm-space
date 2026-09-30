import { describe, expect, test } from "bun:test";
import { isRunSnapshot } from "../../src/thread/run-history-entry";
import type { RunSnapshot } from "../../src/thread/run-history-entry";
import type { ThreadRunReference, ThreadSnapshot } from "../../src/types";

describe("isRunSnapshot", () => {
  test("returns true for a run snapshot which contains a thread property", () => {
    const runSnapshot: RunSnapshot = {
      id: "snapshot-1",
      thread: {
        model: { provider: "test", id: "model-1" },
        context: { messages: [] },
      } as ThreadSnapshot,
    };
    expect(isRunSnapshot(runSnapshot)).toBe(true);
  });

  test("returns false for a run reference which lacks a thread property", () => {
    const runReference: ThreadRunReference = {
      id: "ref-1",
      timestamp: 1234567890,
      snapshotRef: "run-snapshot.json",
      preview: {
        summary: "Test summary",
        modelLabel: "test/model-1",
        messageCountLabel: "0 messages",
      },
    };
    expect(isRunSnapshot(runReference)).toBe(false);
  });
});
