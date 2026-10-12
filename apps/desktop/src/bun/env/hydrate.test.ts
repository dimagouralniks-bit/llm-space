import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  _getShellSpawnSpec,
  _parseEnvBlock,
  _resolveShell,
  hydrateShellEnv,
} from "./hydrate";

describe("hydrate environment", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("_resolveShell", () => {
    test("resolves POSIX shell when $SHELL is set to zsh or bash", () => {
      process.env.SHELL = "/bin/zsh";
      expect(_resolveShell()).toBe("/bin/zsh");

      process.env.SHELL = "/usr/local/bin/bash";
      expect(_resolveShell()).toBe("/usr/local/bin/bash");
    });

    test("resolves fish shell when $SHELL is set to fish", () => {
      process.env.SHELL = "/usr/bin/fish";
      expect(_resolveShell()).toBe("/usr/bin/fish");

      process.env.SHELL = "/opt/homebrew/bin/fish";
      expect(_resolveShell()).toBe("/opt/homebrew/bin/fish");
    });

    test("resolves nushell when $SHELL is set to nu", () => {
      process.env.SHELL = "/usr/bin/nu";
      expect(_resolveShell()).toBe("/usr/bin/nu");

      process.env.SHELL = "/usr/local/bin/nu";
      expect(_resolveShell()).toBe("/usr/local/bin/nu");
    });

    test("falls back to /bin/zsh or /bin/bash for unknown or unset shell", () => {
      delete process.env.SHELL;
      const fallback = _resolveShell();
      expect(["/bin/zsh", "/bin/bash"]).toContain(fallback);

      process.env.SHELL = "/usr/bin/unknown_shell";
      const fallback2 = _resolveShell();
      expect(["/bin/zsh", "/bin/bash"]).toContain(fallback2);
    });
  });

  describe("_getShellSpawnSpec", () => {
    test("builds spec for POSIX shells", () => {
      const spec = _getShellSpawnSpec("/bin/zsh", "DELIM123");
      expect(spec.command).toBe("/bin/zsh");
      expect(spec.args).toEqual([
        "-ilc",
        "echo DELIM123; command env; echo DELIM123",
      ]);
    });

    test("builds spec for fish shell", () => {
      const spec = _getShellSpawnSpec("/usr/bin/fish", "DELIM123");
      expect(spec.command).toBe("/usr/bin/fish");
      expect(spec.args).toEqual([
        "-ilc",
        "echo DELIM123; command env; echo DELIM123",
      ]);
    });

    test("builds spec for nushell", () => {
      const spec = _getShellSpawnSpec("/usr/bin/nu", "DELIM123");
      expect(spec.command).toBe("/usr/bin/nu");
      expect(spec.args).toEqual([
        "-l",
        "-c",
        'print "DELIM123"; ^env; print "DELIM123"',
      ]);
    });
  });

  describe("_parseEnvBlock", () => {
    test("parses single-line key=value pairs between delimiters", () => {
      const delim = "__BOUND__";
      const output = `${delim}\nFOO=bar\nBAZ=qux\n${delim}\n`;
      const parsed = _parseEnvBlock(output, delim);

      expect(parsed).toEqual({
        FOO: "bar",
        BAZ: "qux",
      });
    });

    test("parses multi-line environment variables", () => {
      const delim = "__BOUND__";
      const output = `${delim}\nFOO=line1\nline2\nBAZ=qux\n${delim}\n`;
      const parsed = _parseEnvBlock(output, delim);

      expect(parsed).toEqual({
        FOO: "line1\nline2",
        BAZ: "qux",
      });
    });

    test("returns null if delimiters are missing or invalid", () => {
      expect(_parseEnvBlock("no delim output", "DELIM")).toBeNull();
      expect(_parseEnvBlock("DELIM only one", "DELIM")).toBeNull();
    });
  });

  describe("hydrateShellEnv", () => {
    test("hydrates environment variables without crashing", () => {
      // In non-Windows environment, calling hydrateShellEnv should run once
      hydrateShellEnv();
      expect(process.env.PATH).toBeDefined();
    });
  });
});
