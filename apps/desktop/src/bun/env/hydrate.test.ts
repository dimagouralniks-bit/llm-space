import { describe, expect, test } from "bun:test";
import {
  _getShellArgs,
  _parseEnvBlock,
  _resolveShell,
  hydrateShellEnv,
} from "./hydrate";

describe("hydrate environment", () => {
  describe("_resolveShell", () => {
    test("resolves POSIX shells", () => {
      expect(_resolveShell("/bin/bash")).toBe("/bin/bash");
      expect(_resolveShell("/usr/bin/zsh")).toBe("/usr/bin/zsh");
      expect(_resolveShell("/bin/sh")).toBe("/bin/sh");
      expect(_resolveShell("/bin/dash")).toBe("/bin/dash");
      expect(_resolveShell("/bin/ksh")).toBe("/bin/ksh");
    });

    test("resolves fish and nushell natively", () => {
      expect(_resolveShell("/usr/local/bin/fish")).toBe("/usr/local/bin/fish");
      expect(_resolveShell("/usr/bin/nu")).toBe("/usr/bin/nu");
      expect(_resolveShell("/opt/homebrew/bin/nushell")).toBe(
        "/opt/homebrew/bin/nushell"
      );
    });

    test("falls back to /bin/zsh or /bin/bash for unknown shells or undefined", () => {
      const fallback = _resolveShell("/usr/bin/unknown_shell");
      expect(["/bin/zsh", "/bin/bash"]).toContain(fallback);

      const fallbackEmpty = _resolveShell(undefined);
      expect(["/bin/zsh", "/bin/bash"]).toContain(fallbackEmpty);
    });
  });

  describe("_getShellArgs", () => {
    test("returns correct args for POSIX shells", () => {
      const args = _getShellArgs("/bin/zsh", "DELIM123");
      expect(args).toEqual([
        "/bin/zsh",
        "-ilc",
        "echo DELIM123; command env; echo DELIM123",
      ]);
    });

    test("returns correct args for fish shell", () => {
      const args = _getShellArgs("/usr/local/bin/fish", "DELIM123");
      expect(args).toEqual([
        "/usr/local/bin/fish",
        "-ilc",
        "echo DELIM123; command env; echo DELIM123",
      ]);
    });

    test("returns correct args for nu / nushell", () => {
      const argsNu = _getShellArgs("/usr/bin/nu", "DELIM123");
      expect(argsNu).toEqual([
        "/usr/bin/nu",
        "-l",
        "-i",
        "-c",
        "echo DELIM123; ^env; echo DELIM123",
      ]);

      const argsNushell = _getShellArgs("/usr/bin/nushell", "DELIM123");
      expect(argsNushell).toEqual([
        "/usr/bin/nushell",
        "-l",
        "-i",
        "-c",
        "echo DELIM123; ^env; echo DELIM123",
      ]);
    });
  });

  describe("_parseEnvBlock", () => {
    test("parses single-line and multiline env vars between delimiters", () => {
      const output = [
        "Noise before delimiter",
        "DELIM_START",
        "FOO=bar",
        "MULTI=line1",
        "line2",
        "BAR=baz=qux",
        "DELIM_START",
        "Noise after delimiter",
      ].join("\n");

      const parsed = _parseEnvBlock(output, "DELIM_START");
      expect(parsed).toEqual({
        FOO: "bar",
        MULTI: "line1\nline2",
        BAR: "baz=qux",
      });
    });

    test("parses distinct variables between delimiters", () => {
      const output = [
        "Noise before delimiter",
        "DELIM_START",
        "FOO=bar",
        "BAR=baz=qux",
        "DELIM_START",
        "Noise after delimiter",
      ].join("\n");

      const parsed = _parseEnvBlock(output, "DELIM_START");
      expect(parsed).toEqual({
        FOO: "bar",
        BAR: "baz=qux",
      });
    });

    test("returns null if delimiters are missing or invalid", () => {
      expect(_parseEnvBlock("no delimiters", "DELIM")).toBeNull();
      expect(_parseEnvBlock("DELIM only one", "DELIM")).toBeNull();
    });
  });

  describe("hydrateShellEnv", () => {
    test("runs without throwing error and updates env if shell is available", () => {
      // Just ensure hydrateShellEnv runs cleanly and doesn't crash
      expect(() => hydrateShellEnv()).not.toThrow();
    });
  });
});
