import * as crypto from "node:crypto";
import { ServerError } from "./errors";

export function verifyBearerToken(request: Request, token: string): boolean {
  const header = request.headers.get("authorization");
  if (!header) {
    return false;
  }

  const expected = `Bearer ${token}`;

  const headerBuf = Buffer.from(header);
  const expectedBuf = Buffer.from(expected);

  if (headerBuf.length !== expectedBuf.length) {
    crypto.timingSafeEqual(expectedBuf, expectedBuf);
    return false;
  }

  return crypto.timingSafeEqual(headerBuf, expectedBuf);
}

export function assertAuthorized(request: Request, token: string): void {
  if (!verifyBearerToken(request, token)) {
    throw new ServerError(
      "unauthorized",
      "Missing or invalid bearer token.",
      401
    );
  }
}
