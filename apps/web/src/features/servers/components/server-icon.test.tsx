import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ServerIcon } from "./server-list";

describe("a server's tile", () => {
  it("draws the icon when there is one", () => {
    render(<ServerIcon iconUrl="/api/v1/icons/a" name="OpenCord HQ" />);

    expect(screen.getByRole("presentation")).toHaveAttribute(
      "src",
      "/api/v1/icons/a",
    );
  });

  it("draws the initials when there is none", () => {
    render(<ServerIcon iconUrl={null} name="OpenCord HQ" />);

    expect(screen.getByText("OH")).toBeInTheDocument();
  });

  it("falls back to the initials when the icon cannot be loaded", () => {
    render(<ServerIcon iconUrl="/api/v1/icons/gone" name="The Lounge" />);

    fireEvent.error(screen.getByRole("presentation"));

    expect(screen.getByText("TL")).toBeInTheDocument();
    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
  });
});
