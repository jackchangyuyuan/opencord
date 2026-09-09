import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { pino } from "pino";
import { pinoHttp } from "pino-http";
import { afterEach, describe, expect, it } from "vitest";

import { REDACT, REDACTED } from "../lib/logger.js";
import { redactQuery, serializeRequest } from "./http-logger.js";

describe("redactQuery", () => {
  it("leaves a url with no query alone", () => {
    expect(redactQuery("/api/v1/servers")).toBe("/api/v1/servers");
  });

  it("keeps this API's own parameters", () => {
    expect(redactQuery("/api/v1/search?q=hello&limit=10")).toBe(
      "/api/v1/search?q=hello&limit=10",
    );
  });

  it("censors the credentials an oauth redirect carries", () => {
    expect(
      redactQuery("/api/auth/callback/github?code=abc&state=xyz&next=%2Fapp"),
    ).toBe(
      `/api/auth/callback/github?code=${REDACTED}&state=${REDACTED}&next=%2Fapp`,
    );
  });

  it("censors a verification token", () => {
    expect(redactQuery("/api/auth/verify-email?token=abc")).toBe(
      `/api/auth/verify-email?token=${REDACTED}`,
    );
  });
});

describe("the access log", () => {
  let server: Server | undefined;

  afterEach(() => {
    server?.close();
    server = undefined;
  });

  async function loggedRequest(path: string, headers: Record<string, string>) {
    const lines: string[] = [];
    const logger = pino({ level: "info", redact: REDACT }, {
      write: (line: string) => lines.push(line),
    } as never);

    const middleware = pinoHttp({
      logger,
      quietReqLogger: true,
      serializers: { req: serializeRequest },
    });

    server = createServer((req, res) => {
      middleware(req, res);
      res.setHeader(
        "set-cookie",
        "better-auth.session_token=set-cookie-secret",
      );
      res.end("ok");
    });

    await new Promise<void>((resolve) => {
      server?.listen(0, "127.0.0.1", resolve);
    });

    const { port } = server.address() as AddressInfo;

    await fetch(`http://127.0.0.1:${String(port)}${path}`, { headers });

    await expect.poll(() => lines.length).toBeGreaterThan(0);

    return lines.join("");
  }

  it("names no session token, bearer token or oauth code", async () => {
    const logged = await loggedRequest(
      "/api/auth/callback/github?code=code-secret&state=state-secret",
      {
        cookie: "better-auth.session_token=cookie-secret",
        authorization: "Bearer bearer-secret",
      },
    );

    expect(logged).not.toContain("cookie-secret");
    expect(logged).not.toContain("bearer-secret");
    expect(logged).not.toContain("set-cookie-secret");
    expect(logged).not.toContain("code-secret");
    expect(logged).not.toContain("state-secret");
    expect(logged).toContain(REDACTED);
  });

  it("still records the method, path and status", async () => {
    const logged = await loggedRequest("/api/v1/search?q=hello", {});

    expect(logged).toContain('"method":"GET"');
    expect(logged).toContain("/api/v1/search?q=hello");
    expect(logged).toContain('"statusCode":200');
  });
});
