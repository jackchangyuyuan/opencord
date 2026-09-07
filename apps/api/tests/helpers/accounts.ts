import request from "supertest";
import { expect } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";

export const TEST_PASSWORD = "correct horse battery staple";

const signUpBody = z.object({ user: z.object({ id: z.string() }) });

export interface Account {
  id: string;
  cookies: string[];
}

export function cookieHeader(cookies: string[]): string {
  return cookies.flatMap((entry) => entry.split(";", 1)).join("; ");
}

export async function signUp(
  username: string,
  name = username,
): Promise<Account> {
  const res = await request(app)
    .post("/api/auth/sign-up/email")
    .send({
      email: `${username}@example.com`,
      name,
      password: TEST_PASSWORD,
      username,
    });

  expect(res.status).toBe(200);

  return {
    id: signUpBody.parse(res.body).user.id,
    cookies: res.get("Set-Cookie") ?? [],
  };
}
