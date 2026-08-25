import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignInForm } from "./sign-in-form";

const { signInEmail } = vi.hoisted(() => ({
  signInEmail:
    vi.fn<(input: unknown) => Promise<{ data: unknown; error: unknown }>>(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { email: signInEmail } },
}));

function renderForm() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SignInForm />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  signInEmail.mockReset();
  signInEmail.mockResolvedValue({ data: {}, error: null });
});

describe("SignInForm", () => {
  it("reports the shared schema's password rule before any request", async () => {
    const user = userEvent.setup();

    renderForm();

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("Use at least 8 characters"),
    ).toBeInTheDocument();
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it("reports an invalid address before any request", async () => {
    const user = userEvent.setup();

    renderForm();

    await user.type(screen.getByLabelText("Email"), "not-an-address");
    await user.type(screen.getByLabelText("Password"), "correct horse battery");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it("submits the validated values once the schema is satisfied", async () => {
    const user = userEvent.setup();

    renderForm();

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "correct horse battery");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(signInEmail).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "correct horse battery",
    });
  });

  it("surfaces a rejected credential pair without blaming one field", async () => {
    const user = userEvent.setup();

    signInEmail.mockResolvedValue({
      data: null,
      error: {
        code: "INVALID_EMAIL_OR_PASSWORD",
        message: "Invalid email or password",
      },
    });

    renderForm();

    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "correct horse battery");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("Invalid email or password"),
    ).toBeInTheDocument();
  });
});
