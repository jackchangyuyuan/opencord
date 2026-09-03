import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AvatarPicker } from "./avatar-picker";

const GRANT = {
  objectKey: "avatars/u-ada/abc.png",
  upload: { url: "http://storage.test/opencord", fields: { key: "k" } },
  expiresIn: 60,
};

function png(name: string, size: number): File {
  const file = new File([new Uint8Array(4)], name, { type: "image/png" });

  Object.defineProperty(file, "size", { value: size });

  return file;
}

function stubFetch() {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
    const url = input instanceof Request ? input.url : input.toString();

    return Promise.resolve(
      url.startsWith("/api/v1/uploads")
        ? new Response(JSON.stringify(GRANT), {
            status: 201,
            headers: { "content-type": "application/json" },
          })
        : new Response(null, { status: 204 }),
    );
  });

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

beforeEach(() => {
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:preview"),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPicker() {
  const onPicked = vi.fn();

  render(
    <AvatarPicker
      currentUrl={null}
      fallback="AD"
      kind="avatar"
      label="Choose a picture"
      onPicked={onPicked}
    />,
  );

  return { onPicked };
}

describe("AvatarPicker", () => {
  it("names the ceiling the storage policy enforces", () => {
    renderPicker();

    expect(screen.getByText(/up to 1 MB/)).toBeVisible();
  });

  it("hands back the object key once the bytes have landed", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch();
    const { onPicked } = renderPicker();

    await user.upload(
      screen.getByLabelText("Choose a picture", { selector: "input" }),
      png("me.png", 1024),
    );

    const save = screen.getByRole("button", { name: "Save image" });

    await waitFor(() => {
      expect(save).toBeEnabled();
    });

    await user.click(save);

    expect(onPicked).toHaveBeenCalledExactlyOnceWith(GRANT.objectKey);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses an oversized picture before any request", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch();

    renderPicker();

    await user.upload(
      screen.getByLabelText("Choose a picture", { selector: "input" }),
      png("huge.png", 2 * 1024 * 1024),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That file is too large",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save image" })).toBeDisabled();
  });
});
