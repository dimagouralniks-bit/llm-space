import { describe, expect, test } from "bun:test";

import { ServerError, errorBody, toServerError } from "./errors";

describe("ServerError", () => {
  test("creates a ServerError with default status 400", () => {
    const err = new ServerError("bad_request", "Invalid payload");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ServerError);
    expect(err.name).toBe("ServerError");
    expect(err.code).toBe("bad_request");
    expect(err.message).toBe("Invalid payload");
    expect(err.status).toBe(400);
    expect(err.detail).toBeUndefined();
  });

  test("creates a ServerError with custom status and detail", () => {
    const detailObj = { field: "email", reason: "invalid" };
    const err = new ServerError("validation_error", "Validation failed", 422, detailObj);
    expect(err.code).toBe("validation_error");
    expect(err.message).toBe("Validation failed");
    expect(err.status).toBe(422);
    expect(err.detail).toEqual(detailObj);
  });
});

describe("errorBody", () => {
  test("generates error body without detail when detail is undefined", () => {
    const err = new ServerError("unauthorized", "Token missing", 401);
    const body = errorBody(err);
    expect(body).toEqual({
      ok: false,
      error: {
        code: "unauthorized",
        message: "Token missing",
      },
    });
    expect(Object.prototype.hasOwnProperty.call(body.error, "detail")).toBe(false);
  });

  test("generates error body including detail when detail is provided", () => {
    const errWithDetail = new ServerError("bad_request", "Invalid input", 400, { foo: "bar" });
    expect(errorBody(errWithDetail)).toEqual({
      ok: false,
      error: {
        code: "bad_request",
        message: "Invalid input",
        detail: { foo: "bar" },
      },
    });

    const errWithNullDetail = new ServerError("bad_request", "Invalid input", 400, null);
    expect(errorBody(errWithNullDetail)).toEqual({
      ok: false,
      error: {
        code: "bad_request",
        message: "Invalid input",
        detail: null,
      },
    });
  });
});

describe("toServerError", () => {
  test("returns the same instance if input is already a ServerError", () => {
    const existingErr = new ServerError("forbidden", "Access denied", 403, "extra info");
    const result = toServerError(existingErr);
    expect(result).toBe(existingErr);
  });

  test("converts standard Error into a ServerError with status 500", () => {
    const stdErr = new Error("Database connection lost");
    const result = toServerError(stdErr);
    expect(result).toBeInstanceOf(ServerError);
    expect(result.code).toBe("internal_error");
    expect(result.message).toBe("Database connection lost");
    expect(result.status).toBe(500);
    expect(result.detail).toBeUndefined();
  });

  test("converts non-Error unknown inputs into a ServerError with status 500", () => {
    const stringErr = toServerError("Something failed");
    expect(stringErr).toBeInstanceOf(ServerError);
    expect(stringErr.code).toBe("internal_error");
    expect(stringErr.message).toBe("Something failed");
    expect(stringErr.status).toBe(500);

    const objErr = toServerError({ custom: "error" });
    expect(objErr).toBeInstanceOf(ServerError);
    expect(objErr.code).toBe("internal_error");
    expect(objErr.message).toBe("[object Object]");
    expect(objErr.status).toBe(500);
  });
});
