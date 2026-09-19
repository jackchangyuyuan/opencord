import type { MessageAttachment } from "@opencord/shared/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MessageAttachments } from "./message-attachments";

const CHANNEL_ID = "44444444-4444-4444-8444-444444444444";

function attachment(overrides: Partial<MessageAttachment> = {}) {
  return {
    id: "a-1",
    objectKey: "attachments/u-ada/stored/a-1.png",
    url: `/api/v1/channels/${CHANNEL_ID}/attachments/a-1`,
    filename: "diagram.png",
    contentType: "image/png",
    size: 2048,
    width: 800,
    height: 600,
    ...overrides,
  } satisfies MessageAttachment;
}

describe("MessageAttachments", () => {
  it("renders nothing when the message carries no files", () => {
    const { container } = render(<MessageAttachments attachments={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("points the image and its link at the attachment route", () => {
    render(<MessageAttachments attachments={[attachment()]} />);

    const image = screen.getByRole("img", { name: "diagram.png" });

    expect(image).toHaveAttribute(
      "src",
      `/api/v1/channels/${CHANNEL_ID}/attachments/a-1`,
    );
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      `/api/v1/channels/${CHANNEL_ID}/attachments/a-1`,
    );
  });

  it("reserves the stored dimensions so a late image does not move the scroll", () => {
    render(<MessageAttachments attachments={[attachment()]} />);

    const image = screen.getByRole("img", { name: "diagram.png" });

    expect(image).toHaveAttribute("width", "800");
    expect(image).toHaveAttribute("height", "600");
  });

  it("says the image is unavailable when the bytes cannot be served", () => {
    render(<MessageAttachments attachments={[attachment()]} />);

    fireEvent.error(screen.getByRole("img", { name: "diagram.png" }));

    expect(screen.getByText("Image unavailable")).toBeInTheDocument();
    expect(screen.getByText("diagram.png")).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: "diagram.png" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("fails one attachment without disturbing the others", () => {
    render(
      <MessageAttachments
        attachments={[
          attachment(),
          attachment({ id: "a-2", filename: "chart.png" }),
        ]}
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "diagram.png" }));

    expect(screen.getByText("Image unavailable")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "chart.png" })).toBeInTheDocument();
  });
});
