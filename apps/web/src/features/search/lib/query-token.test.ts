import { describe, expect, it } from "vitest";

import { alreadyFiltered, replaceToken, tokenAt } from "./query-token";

describe("tokenAt", () => {
  it("finds the word the caret is inside", () => {
    const token = tokenAt("hello world", 3);

    expect(token.text).toBe("hello");
    expect(token.start).toBe(0);
    expect(token.end).toBe(5);
    expect(token.key).toBeNull();
  });

  it("finds an empty token at the end of a finished word", () => {
    expect(tokenAt("hello ", 6).text).toBe("");
  });

  it("splits a filter into its key and value, sigil removed", () => {
    const token = tokenAt("from:@ada", 9);

    expect(token.key).toBe("from");
    expect(token.value).toBe("ada");
  });

  it("reads a channel filter the same way", () => {
    expect(tokenAt("in:#general", 11).value).toBe("general");
  });

  it("leaves an unknown key as free text", () => {
    const token = tokenAt("note:something", 5);

    expect(token.key).toBeNull();
    expect(token.value).toBe("note:something");
  });

  it("stays inside the token the caret is in, not the last one", () => {
    const token = tokenAt("from:@ada rollback", 4);

    expect(token.key).toBe("from");
  });
});

describe("replaceToken", () => {
  it("rewrites only the token the caret was in", () => {
    const raw = "from:@a rollback";
    const token = tokenAt(raw, 6);

    expect(replaceToken(raw, token, "from:@ada").value).toBe(
      "from:@ada rollback",
    );
  });

  it("puts the caret after the inserted token", () => {
    const raw = "";
    const token = tokenAt(raw, 0);
    const { value, caret } = replaceToken(raw, token, "on:2026-03-14");

    expect(value).toBe("on:2026-03-14 ");
    expect(caret).toBe(value.length);
  });

  it("adds no trailing space when the filter is not finished", () => {
    const { value, caret } = replaceToken("", tokenAt("", 0), "from:", {
      trailingSpace: false,
    });

    expect(value).toBe("from:");
    expect(caret).toBe(5);
  });

  it("keeps the rest of the query, with one space between", () => {
    const raw = "deploy in:x rollback";
    const token = tokenAt(raw, 8);

    expect(replaceToken(raw, token, "in:abc").value).toBe(
      "deploy in:abc rollback",
    );
  });
});

describe("alreadyFiltered", () => {
  it("sees a filter that is already there, whatever the sigil", () => {
    expect(alreadyFiltered("from:@ada", "from", "ada")).toBe(true);
    expect(alreadyFiltered("from:ada", "from", "ada")).toBe(true);
    expect(alreadyFiltered("in:#general", "in", "general")).toBe(true);
  });

  it("does not confuse one person for another", () => {
    expect(alreadyFiltered("from:@ada", "from", "adam")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(alreadyFiltered("from:@Ada", "from", "ada")).toBe(true);
  });
});
