import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MessageEditor } from "./message-editor";

const CHANNEL_ID = "77777777-7777-4777-7777-777777777777";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify([])))),
  );
});

function setup(content = "before", allowEmpty = false) {
  const onSave = vi.fn();
  const onCancel = vi.fn();

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <MessageEditor
        allowEmpty={allowEmpty}
        channelId={CHANNEL_ID}
        content={content}
        onCancel={onCancel}
        onSave={onSave}
      />
    </QueryClientProvider>,
  );

  return {
    onSave,
    onCancel,
    field: screen.getByRole("textbox", { name: "Edit message" }),
    user: userEvent.setup(),
  };
}

describe("the message editor", () => {
  it("opens on the message with the caret at the end", () => {
    const { field } = setup();

    expect(field).toHaveFocus();
    expect(field).toHaveValue("before");
    expect((field as HTMLTextAreaElement).selectionStart).toBe(6);
  });

  it("saves on Enter and keeps a newline on Shift+Enter", async () => {
    const { user, field, onSave } = setup();

    await user.type(field, " and after");
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    expect(onSave).not.toHaveBeenCalled();

    await user.keyboard("{Enter}");

    expect(onSave).toHaveBeenCalledWith("before and after");
  });

  it("cancels on Escape without saving", async () => {
    const { user, field, onSave, onCancel } = setup();

    await user.type(field, "!");
    await user.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("closes rather than saving when nothing changed", async () => {
    const { user, onSave, onCancel } = setup();

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it("refuses to empty a message that carries no image", async () => {
    const { user, field } = setup();

    await user.clear(field);

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("lets an image-only message be emptied", async () => {
    const { user, field } = setup("a caption", true);

    await user.clear(field);

    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("leaves Enter to the input method while it is composing", async () => {
    const { user, field, onSave, onCancel } = setup();

    await user.type(field, " and after");

    fireEvent.keyDown(field, { key: "Enter", isComposing: true });

    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();

    await user.keyboard("{Enter}");

    expect(onSave).toHaveBeenCalledWith("before and after");
  });
});
