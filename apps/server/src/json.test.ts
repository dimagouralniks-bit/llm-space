import { describe, expect, test } from "bun:test";
import { ServerError } from "./errors";
import { errorResponse, jsonResponse, readJson } from "./json";

describe("jsonResponse", () => {
  test("serializes body to JSON string with a trailing newline and content-type header", async () => {
    const data = { hello: "world", count: 42 };
    const response = jsonResponse(data);

    expect(response.headers.get("Content-Type")).toBe(
      "application/json; charset=utf-8"
    );
    expect(response.status).toBe(200);

    const text = await response.text();
    expect(text).toBe(`${JSON.stringify(data)}\n`);
    expect(JSON.parse(text)).toEqual(data);
  });

  test("preserves custom ResponseInit options", async () => {
    const data = { ok: true };
    const response = jsonResponse(data, {
      status: 201,
      statusText: "Created",
      headers: {
        "X-Custom-Header": "custom-value",
      },
    });

    expect(response.status).toBe(201);
    expect(response.statusText).toBe("Created");
    expect(response.headers.get("X-Custom-Header")).toBe("custom-value");
    expect(response.headers.get("Content-Type")).toBe(
      "application/json; charset=utf-8"
    );
  });
});

describe("errorResponse", () => {
  test("formats ServerError with appropriate status code and error body", async () => {
    const serverError = new ServerError("unauthorized", "Access denied", 401, {
      reason: "invalid_token",
    });
    const response = errorResponse(serverError);

    expect(response.status).toBe(401);
    expect(response.headers.get("Content-Type")).toBe(
      "application/json; charset=utf-8"
    );

    const body = await response.json();
    expect(body).toEqual({
      ok: false,
      error: {
        code: "unauthorized",
        message: "Access denied",
        detail: {
          reason: "invalid_token",
        },
      },
    });
  });

  test("converts standard Error or unknown error to internal_error with 500 status", async () => {
    const genericError = new Error("Something broke");
    const response = errorResponse(genericError);

    expect(response.status).toBe(500);

    const body = await response.json();
    expect(body).toEqual({
      ok: false,
      error: {
        code: "internal_error",
        message: "Something broke",
      },
    });
  });
});

describe("readJson", () => {
  test("parses valid JSON request body", async () => {
    const payload = { key: "value", numbers: [1, 2, 3] };
    const request = new Request("http://localhost/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await readJson(request);
    expect(result).toEqual(payload);
  });

  test("throws ServerError with code invalid_json on malformed JSON", async () => {
    const request = new Request("http://localhost/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ invalid json ",
    });

    try {
      await readJson(request);
      expect.unreachable("readJson should have thrown an error");
    } catch (err) {
      expect(err).toBeInstanceOf(ServerError);
      const serverErr = err as ServerError;
      expect(serverErr.code).toBe("invalid_json");
      expect(serverErr.status).toBe(400);
      expect(serverErr.message).toBe("Request body must be valid JSON.");
      expect(serverErr.detail).toBeDefined();
    }
  });
});
