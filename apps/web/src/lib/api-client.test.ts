import { afterEach, describe, expect, it, vi } from "vitest";

import { api, ApiError } from "./api-client";

function respond(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function respondRaw(status: number, body: string, type: string): Response {
  return new Response(body, { status, headers: { "content-type": type } });
}

function stubFetch(response: Response) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api", () => {
  it("sends same-origin credentials to the versioned base path", async () => {
    const fetchMock = stubFetch(respond(200, { id: "u1" }));

    await expect(api("/users/@me")).resolves.toEqual({ id: "u1" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/users/@me",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
      }),
    );
  });

  it("serialises a body and declares its content type", async () => {
    const fetchMock = stubFetch(respond(201, { id: "s1" }));

    await api("/servers", { method: "POST", body: { name: "Engine" } });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/servers",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Engine" }),
        headers: { "content-type": "application/json" },
      }),
    );
  });

  it("turns the error envelope into an ApiError carrying the code", async () => {
    stubFetch(
      respond(
        403,
        { error: { code: "FORBIDDEN", message: "Forbidden" } },
        { "x-request-id": "req-1" },
      ),
    );

    const failure = await api("/servers").catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({
      status: 403,
      code: "FORBIDDEN",
      message: "Forbidden",
      requestId: "req-1",
    });
  });

  it("keeps the field errors a validation failure reports", async () => {
    stubFetch(
      respond(409, {
        error: {
          code: "USERNAME_TAKEN",
          message: "That username is taken",
          details: { username: ["taken"] },
        },
      }),
    );

    const failure: unknown = await api("/users/@me").catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).details).toEqual({ username: ["taken"] });
    expect((failure as ApiError).requestId).toBeNull();
  });

  it("falls back to a generic code when the body is not an envelope", async () => {
    stubFetch(respond(502, { detail: "bad gateway" }));

    const failure = await api("/servers").catch((error: unknown) => error);

    expect(failure).toMatchObject({ status: 502, code: "UNKNOWN" });
  });

  it("turns a proxy's HTML error page into an ApiError, not a parse failure", async () => {
    stubFetch(
      respondRaw(
        502,
        "<html><body><h1>502 Bad Gateway</h1></body></html>",
        "text/html",
      ),
    );

    const failure = await api("/servers").catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({
      status: 502,
      code: "UNKNOWN",
      message: "The request failed",
    });
  });

  it("reports a success body it cannot read rather than throwing a SyntaxError", async () => {
    stubFetch(respondRaw(200, "<html>not json</html>", "text/html"));

    const failure = await api("/servers").catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ status: 200, code: "MALFORMED_RESPONSE" });
  });

  it("returns nothing for a 204", async () => {
    stubFetch(respond(204, null));

    await expect(api("/servers/s1")).resolves.toBeUndefined();
  });
});
