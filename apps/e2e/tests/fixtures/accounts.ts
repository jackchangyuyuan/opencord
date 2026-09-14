import { randomUUID } from "node:crypto";

import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  expect,
} from "@playwright/test";

export const TEST_PASSWORD = "correct horse battery staple";

export const BASE_URL = process.env["E2E_BASE_URL"] ?? "http://localhost:5173";

export interface Account {
  id: string;
  cookie: { name: string; value: string };
  request: APIRequestContext;
  context: BrowserContext;
}

export async function signUp(
  browser: Browser,
  prefix: string,
): Promise<Account> {
  const context = await browser.newContext({ baseURL: BASE_URL });
  const id = randomUUID();

  const created = await context.request.post("/api/auth/sign-up/email", {
    data: {
      email: `${prefix}-${id}@example.com`,
      name: prefix,
      password: TEST_PASSWORD,
      username: `${prefix}${id.slice(0, 8)}`,
    },
  });

  expect(created.status()).toBe(200);

  const { user } = (await created.json()) as { user: { id: string } };

  const session = (await context.request.storageState()).cookies.find(
    (entry) => entry.name === "better-auth.session_token",
  );

  if (session === undefined) {
    throw new Error("sign-up returned no session cookie");
  }

  return {
    id: user.id,
    cookie: { name: session.name, value: session.value },
    request: context.request,
    context,
  };
}
