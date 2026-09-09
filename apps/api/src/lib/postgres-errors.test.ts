import postgres from "postgres";
import { describe, expect, it } from "vitest";

import {
  FOREIGN_KEY_VIOLATION,
  isViolation,
  UNIQUE_VIOLATION,
  violatedConstraint,
} from "./postgres-errors.js";

function driverError(code: string, constraint: string): Error {
  return new postgres.PostgresError({
    message: "duplicate key value violates unique constraint",
    code,
    constraint_name: constraint,
  } as never);
}

function wrapped(error: Error): Error {
  return new Error("Failed query", { cause: error });
}

describe("isViolation", () => {
  it("recognises a driver error thrown directly", () => {
    expect(
      isViolation(
        driverError(UNIQUE_VIOLATION, "users_email_key"),
        UNIQUE_VIOLATION,
      ),
    ).toBe(true);
  });

  it("recognises the same error wrapped by the query layer", () => {
    expect(
      isViolation(
        wrapped(driverError(FOREIGN_KEY_VIOLATION, "messages_author_id_fkey")),
        FOREIGN_KEY_VIOLATION,
      ),
    ).toBe(true);
  });

  it("does not confuse one violation for another", () => {
    expect(
      isViolation(
        driverError(UNIQUE_VIOLATION, "users_email_key"),
        FOREIGN_KEY_VIOLATION,
      ),
    ).toBe(false);
  });

  it("answers no for anything that is not a database failure", () => {
    expect(isViolation(new Error("nope"), UNIQUE_VIOLATION)).toBe(false);
    expect(isViolation(wrapped(new Error("nope")), UNIQUE_VIOLATION)).toBe(
      false,
    );
    expect(isViolation("nope", UNIQUE_VIOLATION)).toBe(false);
    expect(isViolation(undefined, UNIQUE_VIOLATION)).toBe(false);
  });
});

describe("violatedConstraint", () => {
  it("names the constraint of a direct error", () => {
    expect(
      violatedConstraint(
        driverError(UNIQUE_VIOLATION, "users_email_key"),
        UNIQUE_VIOLATION,
      ),
    ).toBe("users_email_key");
  });

  it("names the constraint of a wrapped error", () => {
    expect(
      violatedConstraint(
        wrapped(driverError(UNIQUE_VIOLATION, "users_username_key")),
        UNIQUE_VIOLATION,
      ),
    ).toBe("users_username_key");
  });

  it("answers null when the code does not match", () => {
    expect(
      violatedConstraint(
        driverError(FOREIGN_KEY_VIOLATION, "messages_author_id_fkey"),
        UNIQUE_VIOLATION,
      ),
    ).toBeNull();
  });

  it("answers null rather than undefined when nothing is named", () => {
    const bare = new postgres.PostgresError({
      message: "conflict",
      code: UNIQUE_VIOLATION,
    } as never);

    expect(violatedConstraint(bare, UNIQUE_VIOLATION)).toBeNull();
  });
});
