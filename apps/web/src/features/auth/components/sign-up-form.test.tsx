import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignUpForm } from "./sign-up-form";

const { signUpEmail } = vi.hoisted(() => ({
  signUpEmail:
    vi.fn<(input: unknown) => Promise<{ data: unknown; error: unknown }>>(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: { signUp: { email: signUpEmail } },
}));

function renderForm() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SignUpForm />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Display name"), "Ada Lovelace");
  await user.type(screen.getByLabelText("Username"), "ada");
  await user.type(screen.getByLabelText("Email"), "ada@example.com");
  await user.type(screen.getByLabelText("Password"), "correct horse battery");
}

beforeEach(() => {
  signUpEmail.mockReset();
  signUpEmail.mockResolvedValue({ data: {}, error: null });
});

describe("SignUpForm", () => {
  it("rejects a reserved username with the shared schema's message", async () => {
    const user = userEvent.setup();

    renderForm();

    await user.type(screen.getByLabelText("Display name"), "Ada");
    await user.type(screen.getByLabelText("Username"), "guest-1234");
    await user.type(screen.getByLabelText("Email"), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "correct horse battery");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByText("That username is reserved"),
    ).toBeInTheDocument();
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("lands a taken username on the username field, not in a banner", async () => {
    const user = userEvent.setup();

    signUpEmail.mockResolvedValue({
      data: null,
      error: { code: "USERNAME_TAKEN", message: "That username is taken" },
    });

    renderForm();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByText("That username is taken"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Email")).toHaveAttribute(
      "aria-invalid",
      "false",
    );
  });

  it("lands a taken email on the email field", async () => {
    const user = userEvent.setup();

    signUpEmail.mockResolvedValue({
      data: null,
      error: {
        code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
        message: "User already exists. Use another email.",
      },
    });

    renderForm();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByText("That email is already registered"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Username")).toHaveAttribute(
      "aria-invalid",
      "false",
    );
  });
});
