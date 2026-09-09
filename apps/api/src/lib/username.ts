import { randomBytes } from "node:crypto";

import {
  RESERVED_USERNAME_PREFIXES,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from "@opencord/shared/constants";
import { usernameSchema } from "@opencord/shared/schemas";
import { eq, sql } from "drizzle-orm";

import { db } from "../db/index.js";
import { users } from "../db/schema/index.js";

function seedFrom(email: unknown, name: unknown): string {
  if (typeof email === "string" && email.includes("@")) {
    return email.slice(0, email.indexOf("@"));
  }

  return typeof name === "string" ? name : "";
}

function normalize(seed: string): string {
  return seed
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "")
    .slice(0, USERNAME_MAX_LENGTH);
}

function reserved(candidate: string): boolean {
  return RESERVED_USERNAME_PREFIXES.some((prefix) =>
    candidate.startsWith(prefix),
  );
}

function suffixed(base: string): string {
  const tag = randomBytes(4).toString("hex");
  const room = USERNAME_MAX_LENGTH - tag.length - 1;

  return `${base.slice(0, room) || "user"}-${tag}`;
}

async function taken(username: string): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(sql`lower(${users.username})`, username))
    .limit(1);

  return rows.length > 0;
}

export async function deriveUsername(
  email: unknown,
  name: unknown,
): Promise<string> {
  const base = normalize(seedFrom(email, name));
  const plain = base.length >= USERNAME_MIN_LENGTH ? base : "";

  if (
    plain !== "" &&
    !reserved(plain) &&
    usernameSchema.safeParse(plain).success &&
    !(await taken(plain))
  ) {
    return plain;
  }

  return suffixed(base === "" || reserved(base) ? "user" : base);
}
