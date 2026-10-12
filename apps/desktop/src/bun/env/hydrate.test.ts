import { describe, expect, test } from "bun:test";
import {
  _expandWinEnvVars,
  _mergePathStrings,
  _parseRegOutput,
} from "./hydrate";

describe("Windows Registry Env Parsing & Variable Expansion", () => {
  test("parses REG_SZ registry output correctly", () => {
    const regOutput = `
HKEY_CURRENT_USER\\Environment
    MY_API_KEY    REG_SZ    sk-test-123456
    CUSTOM_SETTING    REG_SZ    enabled
`;
    const parsed = _parseRegOutput(regOutput, {});
    expect(parsed).toEqual({
      MY_API_KEY: "sk-test-123456",
      CUSTOM_SETTING: "enabled",
    });
  });

  test("expands REG_EXPAND_SZ variables using current env and parsed env", () => {
    const regOutput = `
HKEY_CURRENT_USER\\Environment
    USERPROFILE    REG_SZ    C:\\Users\\TestUser
    MY_DOCS    REG_EXPAND_SZ    %USERPROFILE%\\Documents
    TEMP_DIR    REG_EXPAND_SZ    %SYSTEM_DRIVE%\\Temp
`;
    const currentEnv = { SYSTEM_DRIVE: "C:" };
    const parsed = _parseRegOutput(regOutput, currentEnv);

    expect(parsed.MY_DOCS).toBe("C:\\Users\\TestUser\\Documents");
    expect(parsed.TEMP_DIR).toBe("C:\\Temp");
  });

  test("expands variables case-insensitively", () => {
    const result = _expandWinEnvVars(
      "%Path%\\bin;%userprofile%\\appdata",
      { PATH: "C:\\Windows", UserProfile: "C:\\Users\\Bob" }
    );
    expect(result).toBe("C:\\Windows\\bin;C:\\Users\\Bob\\appdata");
  });

  test("leaves unresolvable %VAR% variables intact", () => {
    const result = _expandWinEnvVars("%UNKNOWN_VAR%\\bin", {});
    expect(result).toBe("%UNKNOWN_VAR%\\bin");
  });

  test("merges PATH strings preserving existing order and preventing duplicates", () => {
    const existingPath = "C:\\Windows;C:\\Windows\\System32;C:\\Program Files\\NodeJS";
    const newPath = "C:\\Windows\\System32;C:\\Users\\Bob\\AppData\\Local\\Programs\\Python;c:\\program files\\nodejs";

    const merged = _mergePathStrings(existingPath, newPath);
    expect(merged).toBe(
      "C:\\Windows;C:\\Windows\\System32;C:\\Program Files\\NodeJS;C:\\Users\\Bob\\AppData\\Local\\Programs\\Python"
    );
  });
});
