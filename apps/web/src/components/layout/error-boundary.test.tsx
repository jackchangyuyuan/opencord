import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "@/components/layout/error-boundary";
import { ApiError } from "@/lib/api-client";
import { createQueryClient } from "@/lib/query-client";

function Thrower({ error }: { error: unknown }): never {
  throw error;
}

function Query() {
  const { data } = useQuery({
    queryKey: ["boundary-probe"],
    queryFn: () =>
      Promise.reject(
        new ApiError(
          500,
          { code: "INTERNAL", message: "Internal server error" },
          null,
        ),
      ),
    retry: false,
    throwOnError: true,
  });

  return <p>{String(data)}</p>;
}

function mount(children: React.ReactNode) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ErrorBoundary>{children}</ErrorBoundary>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("renders the code's copy and a retry, not a white screen", () => {
    mount(
      <Thrower
        error={
          new ApiError(
            403,
            { code: "USER_BANNED", message: "You are banned from that server" },
            null,
          )
        }
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "You are banned from that server.",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("falls back to a sentence when the throw is not an ApiError", () => {
    mount(<Thrower error={new Error("kaboom")} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Something went wrong. Try again.",
    );
  });

  it("catches a query that throws, and its retry clears the failure", async () => {
    const user = userEvent.setup();

    mount(<Query />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Internal server error",
    );

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("alert")).toBeVisible();
  });
});
