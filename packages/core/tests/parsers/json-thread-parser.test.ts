import { describe, expect, test } from "bun:test";

import { JsonThreadParser } from "../../src/parsers/json-thread-parser";

describe("JsonThreadParser", () => {
  test("reports recovery for a truncated native thread", async () => {
    const result = await new JsonThreadParser().parseDetailed(
      '{"title":"Recovered","context":{"messages":[]}'
    );

    expect(result).toEqual({
      status: "parsed",
      recovered: true,
      thread: {
        title: "Recovered",
        context: { messages: [] },
      },
    });
  });

  test("rejects a recovered native thread with invalid fields", async () => {
    const result = await new JsonThreadParser().parseDetailed(
      '{"context":{"messages":[{"role":"user"}]'
    );

    expect(result.status).toBe("invalid-shape");
  });

  test("does not turn an unrecognizable truncated object into an empty thread", async () => {
    const result = await new JsonThreadParser().parseDetailed('{"unfinished');

    expect(result.status).toBe("invalid-shape");
  });

  test("keeps strict foreign-chat normalization", async () => {
    const result = await new JsonThreadParser().parseDetailed(
      JSON.stringify({
        messages: [{ role: "user", content: "Hello" }],
      })
    );

    expect(result.status).toBe("parsed");
    if (result.status === "parsed") {
      expect(result.recovered).toBe(false);
      expect(result.thread.context?.messages?.[0]).toMatchObject({
        role: "user",
      });
    }
  });

  describe("OpenAI image_url base64 parsing and ReDoS safety", () => {
    test("parses valid base64 image data URLs", async () => {
      const parser = new JsonThreadParser();
      const validDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      const result = await parser.parseDetailed(
        JSON.stringify({
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: { url: validDataUrl },
                },
              ],
            },
          ],
        })
      );

      expect(result.status).toBe("parsed");
      if (result.status === "parsed") {
        const msg = result.thread.context?.messages?.[0];
        expect(msg?.role).toBe("user");
        if (msg?.role === "user") {
          expect(msg.content[0]).toEqual({
            type: "image",
            mimeType: "image/png",
            data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          });
        }
      }
    });

    test("ignores invalid or non-image data URLs", async () => {
      const parser = new JsonThreadParser();
      const result = await parser.parseDetailed(
        JSON.stringify({
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: { url: "data:application/json;base64,e30=" },
                },
                {
                  type: "image_url",
                  image_url: { url: "https://example.com/image.png" },
                },
              ],
            },
          ],
        })
      );

      // Should return invalid-shape because no usable content (text or image) was extracted for the user message
      expect(result.status).toBe("invalid-shape");
    });

    test("processes large payload without catastrophic backtracking (ReDoS test)", async () => {
      const parser = new JsonThreadParser();
      // Construct a string with 'data:image/png' and trailing garbage without ';base64,' marker
      const payload = "data:image/" + "a".repeat(100_000) + ";something_else," + "b".repeat(100_000);

      const startTime = Date.now();
      const result = await parser.parseDetailed(
        JSON.stringify({
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image_url",
                  image_url: { url: payload },
                },
              ],
            },
          ],
        })
      );
      const duration = Date.now() - startTime;

      expect(result.status).toBe("invalid-shape");
      expect(duration).toBeLessThan(100); // Should execute almost instantaneously (< 100ms)
    });
  });
});
