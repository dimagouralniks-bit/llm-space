import { describe, expect, test } from "bun:test";
import { validateThreadFileStem } from "../../src/thread/file-stem";

describe("validateThreadFileStem", () => {
  test("rejects empty or whitespace-only names", () => {
    expect(validateThreadFileStem("")).toMatchObject({
      valid: false,
      value: "",
      error: "File name is required.",
    });
    expect(validateThreadFileStem("   ")).toMatchObject({
      valid: false,
      value: "",
      error: "File name is required.",
    });
    expect(validateThreadFileStem("\t\n")).toMatchObject({
      valid: false,
      value: "",
      error: "File name is required.",
    });
  });

  test("rejects . and ..", () => {
    expect(validateThreadFileStem(".")).toMatchObject({
      valid: false,
      value: ".",
      error: "File name cannot be . or ..",
    });
    expect(validateThreadFileStem("..")).toMatchObject({
      valid: false,
      value: "..",
      error: "File name cannot be . or ..",
    });
  });

  test("rejects names with invalid characters", () => {
    const invalidChars = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

    for (const char of invalidChars) {
      expect(validateThreadFileStem(`file${char}name`)).toMatchObject({
        valid: false,
        value: `file${char}name`,
        error: "File name contains a reserved character.",
      });
    }

    // Control characters (ASCII < 32)
    expect(validateThreadFileStem("file\x00name")).toMatchObject({
      valid: false,
      value: "file\x00name",
      error: "File name contains a reserved character.",
    });
    expect(validateThreadFileStem("file\x1fname")).toMatchObject({
      valid: false,
      value: "file\x1fname",
      error: "File name contains a reserved character.",
    });
  });

  test("rejects reserved Windows names", () => {
    const reservedNames = [
      "CON", "PRN", "AUX", "NUL",
      "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
      "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
      "con", "prn", "aux", "nul", "com1", "lpt1"
    ];

    for (const name of reservedNames) {
      expect(validateThreadFileStem(name)).toMatchObject({
        valid: false,
        value: name,
        error: "File name is reserved by Windows.",
      });
    }
  });

  test("rejects names ending with a period", () => {
    expect(validateThreadFileStem("filename.")).toMatchObject({
      valid: false,
      value: "filename.",
      error: "File name cannot end with a period or space.",
    });
    // Note: The logic in validateThreadFileStem first trims the value,
    // so if a user inputs "filename ", it gets trimmed to "filename" and is valid.
    // If they input "filename .", it ends with "." and is invalid.
    expect(validateThreadFileStem("filename .")).toMatchObject({
        valid: false,
        value: "filename .",
        error: "File name cannot end with a period or space.",
    });
  });

  test("accepts valid filenames and trims them", () => {
    expect(validateThreadFileStem("valid_name")).toEqual({
      valid: true,
      value: "valid_name",
    });
    expect(validateThreadFileStem("  valid_name  ")).toEqual({
      valid: true,
      value: "valid_name",
    });
    expect(validateThreadFileStem("valid-name-123")).toEqual({
      valid: true,
      value: "valid-name-123",
    });
    expect(validateThreadFileStem("valid.name")).toEqual({
      valid: true,
      value: "valid.name",
    });
  });
});
