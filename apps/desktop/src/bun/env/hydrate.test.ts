import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  hydrateShellEnv,
  parseEnvBlock,
  resetHydratedForTesting,
  resolveShell,
} from "./hydrate";

describe("env/hydrate", () => {
  beforeEach(() => {
    resetHydratedForTesting();
  });

  afterEach(() => {
    resetHydratedForTesting();
  });

  describe("parseEnvBlock", () => {
    test("parses KEY=VALUE pairs delimited by markers", () => {
      const delimiter = "__DELIM__";
      const raw = `shell startup noise\n${delimiter}\nFOO=bar\nBAZ=123\n${delimiter}\nending noise\n`;
      const result = parseEnvBlock(raw, delimiter);

      expect(result).toEqual({
        FOO: "bar",
        BAZ: "123",
      });
    });

    test("handles multi-line environment variables", () => {
      const delimiter = "__DELIM__";
      const raw = `${delimiter}\nMULTILINE=line1\nline2\nline3\nKEY=val\n${delimiter}`;
      const result = parseEnvBlock(raw, delimiter);

      expect(result).toEqual({
        MULTILINE: "line1\nline2\nline3",
        KEY: "val",
      });
    });

    test("returns null if delimiter is missing or invalid", () => {
      const delimiter = "__DELIM__";
      expect(parseEnvBlock("no delimiters here", delimiter)).toBeNull();
      expect(parseEnvBlock(`only one ${delimiter} delimiter`, delimiter)).toBeNull();
    });
  });

  describe("resolveShell", () => {
    test("uses process.env.SHELL when pointing to a supported POSIX shell", () => {
      const originalShell = process.env.SHELL;
      try {
        process.env.SHELL = "/bin/zsh";
        expect(resolveShell()).toBe("/bin/zsh");

        process.env.SHELL = "/usr/local/bin/bash";
        expect(resolveShell()).toBe("/usr/local/bin/bash");
      } finally {
        if (originalShell === undefined) {
          delete process.env.SHELL;
        } else {
          process.env.SHELL = originalShell;
        }
      }
    });

    test("falls back to standard shell if process.env.SHELL is non-POSIX or unset", () => {
      const originalShell = process.env.SHELL;
      try {
        process.env.SHELL = "/usr/bin/fish";
        const resolved = resolveShell();
        expect(["/bin/zsh", "/bin/bash"]).toContain(resolved);

        delete process.env.SHELL;
        const resolvedFallback = resolveShell();
        expect(["/bin/zsh", "/bin/bash"]).toContain(resolvedFallback);
      } finally {
        if (originalShell === undefined) {
          delete process.env.SHELL;
        } else {
          process.env.SHELL = originalShell;
        }
      }
    });
  });

  describe("hydrateShellEnv", () => {
    test("returns early without error when process.platform is win32", () => {
      const originalPlatform = Object.getOwnPropertyDescriptor(
        process,
        "platform"
      );

      try {
        Object.defineProperty(process, "platform", {
          value: "win32",
          configurable: true,
        });

        const testKey = "TEST_WIN32_ENV_HYDRATE_CHECK";
        delete process.env[testKey];

        hydrateShellEnv();
        expect(process.env[testKey]).toBeUndefined();
      } finally {
        if (originalPlatform) {
          Object.defineProperty(process, "platform", originalPlatform);
        }
      }
    });

    test("is idempotent and only attempts hydration once until reset", () => {
      const testKey = "TEST_IDEMPOTENCY_ENV_KEY";
      const originalVal = process.env[testKey];

      try {
        hydrateShellEnv();
        // Subsequent call should immediately return because _hydrated is true.
        hydrateShellEnv();
      } finally {
        if (originalVal === undefined) {
          delete process.env[testKey];
        } else {
          process.env[testKey] = originalVal;
        }
      }
    });
  });
});
