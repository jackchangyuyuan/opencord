import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useUpload } from "./use-upload";

const GRANT = {
  objectKey: "attachments/u-ada/abc.png",
  upload: {
    url: "http://storage.test/opencord",
    fields: { key: "attachments/u-ada/abc.png", "Content-Type": "image/png" },
  },
  expiresIn: 60,
};

function urlOf(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : String(input);
}

function png(name = "shot.png", size = 1024): File {
  const file = new File([new Uint8Array(4)], name, { type: "image/png" });

  Object.defineProperty(file, "size", { value: size });

  return file;
}

function stubFetch(storage: Response) {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation((input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : input.toString();

      if (url.startsWith("/api/v1/uploads")) {
        return Promise.resolve(
          new Response(JSON.stringify(GRANT), {
            status: 201,
            headers: { "content-type": "application/json" },
          }),
        );
      }

      return Promise.resolve(storage);
    });

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

const revokeObjectURL = vi.fn();
const createObjectURL = vi.fn(() => "blob:preview");

beforeEach(() => {
  revokeObjectURL.mockClear();
  createObjectURL.mockClear();

  vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useUpload", () => {
  it("authorizes, posts every returned field, then reports the key", async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }));

    const { result } = renderHook(() => useUpload("attachment"));

    act(() => {
      result.current.add([png()]);
    });

    await waitFor(() => {
      expect(result.current.items[0]?.status).toBe("done");
    });

    expect(result.current.drafts).toEqual([
      { objectKey: GRANT.objectKey, filename: "shot.png" },
    ]);

    const post = fetchMock.mock.calls.find(
      ([input]) => input === GRANT.upload.url,
    );

    const body = post?.[1]?.body;

    expect(body).toBeInstanceOf(FormData);

    const form = body as FormData;
    const names = [...form.keys()];

    expect(names).toEqual(["key", "Content-Type", "file"]);
  });

  it("marks a file the storage service refused as failed", async () => {
    stubFetch(new Response("EntityTooLarge", { status: 400 }));

    const { result } = renderHook(() => useUpload("attachment"));

    act(() => {
      result.current.add([png("big.png")]);
    });

    await waitFor(() => {
      expect(result.current.items[0]?.status).toBe("error");
    });

    expect(result.current.drafts).toEqual([]);
    expect(result.current.items[0]?.error).toContain("400");
  });

  it("refuses an oversized file before any request", async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }));

    const { result } = renderHook(() => useUpload("attachment"));

    act(() => {
      result.current.add([png("huge.png", 6 * 1024 * 1024)]);
    });

    await waitFor(() => {
      expect(result.current.items[0]?.status).toBe("error");
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a file that is not one of the four image types", async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }));

    const { result } = renderHook(() => useUpload("attachment"));

    act(() => {
      result.current.add([
        new File(["x"], "notes.txt", { type: "text/plain" }),
      ]);
    });

    await waitFor(() => {
      expect(result.current.items[0]?.status).toBe("error");
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops accepting files at the per-message cap", async () => {
    stubFetch(new Response(null, { status: 204 }));

    const { result } = renderHook(() => useUpload("attachment"));

    act(() => {
      result.current.add([
        png("1.png"),
        png("2.png"),
        png("3.png"),
        png("4.png"),
        png("5.png"),
      ]);
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(4);
    });

    expect(result.current.isFull).toBe(true);
  });

  it("authorizes one upload per file under Strict Mode", async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }));

    const { result } = renderHook(() => useUpload("attachment"), {
      wrapper: StrictMode,
    });

    act(() => {
      result.current.add([png()]);
    });

    await waitFor(() => {
      expect(result.current.items[0]?.status).toBe("done");
    });

    expect(result.current.items).toHaveLength(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    const grants = fetchMock.mock.calls.filter(([input]) =>
      urlOf(input).startsWith("/api/v1/uploads"),
    );

    expect(grants).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("cancels the request of a file removed while it uploads", async () => {
    let settleStorage: ((response: Response) => void) | undefined;

    const storage = new Promise<Response>((resolve) => {
      settleStorage = resolve;
    });

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        if (urlOf(input).startsWith("/api/v1/uploads")) {
          return Promise.resolve(
            new Response(JSON.stringify(GRANT), {
              status: 201,
              headers: { "content-type": "application/json" },
            }),
          );
        }

        init?.signal?.addEventListener("abort", () => {
          settleStorage?.(new Response(null, { status: 499 }));
        });

        return storage;
      });

    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useUpload("attachment"));

    act(() => {
      result.current.add([png()]);
    });

    await waitFor(() => {
      expect(result.current.items[0]?.status).toBe("uploading");
    });

    const id = result.current.items[0]?.id ?? "";
    const post = fetchMock.mock.calls.find(
      ([input]) => !urlOf(input).startsWith("/api/v1/uploads"),
    );

    act(() => {
      result.current.remove(id);
    });

    expect(post?.[1]?.signal?.aborted).toBe(true);
    expect(result.current.items).toEqual([]);

    await act(async () => {
      settleStorage?.(new Response(null, { status: 500 }));
      await storage;
    });

    expect(result.current.items).toEqual([]);
  });

  it("drops a pending file and releases its preview", async () => {
    stubFetch(new Response(null, { status: 204 }));

    const { result } = renderHook(() => useUpload("attachment"));

    act(() => {
      result.current.add([png()]);
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
    });

    const id = result.current.items[0]?.id ?? "";

    act(() => {
      result.current.remove(id);
    });

    expect(result.current.items).toEqual([]);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });
});
