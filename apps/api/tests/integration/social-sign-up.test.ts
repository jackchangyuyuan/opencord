import { parseAdditionalUserInputFromProviderProfile } from "better-auth/db";
import { beforeAll, describe, expect, it, vi } from "vitest";

// The providers register only when both halves of a pair are present, and the
// test environment carries neither, so `auth` has to be imported after these.
vi.hoisted(() => {
  process.env["GOOGLE_CLIENT_ID"] = "google-test-client";
  process.env["GOOGLE_CLIENT_SECRET"] = "google-test-secret";
  process.env["GITHUB_CLIENT_ID"] = "github-test-client";
  process.env["GITHUB_CLIENT_SECRET"] = "github-test-secret";
});

const { auth } = await import("../../src/auth.js");
const { requireTestDatabase } = await import("../setup.js");

// What Better Auth hands to the required-field check: the provider profile
// with the columns it fills itself already removed. Neither provider carries a
// username, which is the whole reason this path needed a mapper.
const googleProfile = { email: "ada@example.com", name: "Ada Lovelace" };
const githubProfile = {
  email: "grace@example.com",
  name: "Grace Hopper",
  login: "ghopper",
};

type Mapper = (profile: {
  email?: string | null;
  name?: string | null;
}) => Promise<Record<string, unknown>>;

function mapperFor(provider: "google" | "github"): Mapper {
  const configured = auth.options.socialProviders[provider] as
    { mapProfileToUser?: Mapper } | undefined;
  const mapper = configured?.mapProfileToUser;

  // Narrowing rather than asserting: without the mapper the callback cannot
  // name a username at all, so this is the regression, not a setup detail.
  if (typeof mapper !== "function") {
    throw new Error(`${provider} does not map a username onto its profile`);
  }

  return mapper;
}

// The check the OAuth callback runs before it creates anyone. Calling it with
// "create" is what makes a required field required.
function validateAsCreate(profile: Record<string, unknown>) {
  return parseAdditionalUserInputFromProviderProfile(
    auth.options,
    profile,
    "create",
  );
}

describe("OAuth sign-up supplies the username the callback requires", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  // Guards the assertions below: if `username` ever stops being required, they
  // would pass without proving anything.
  it("rejects a bare provider profile, which is the failure this guards", () => {
    expect(() => validateAsCreate(googleProfile)).toThrow(
      /username is required/i,
    );
    expect(() => validateAsCreate(githubProfile)).toThrow(
      /username is required/i,
    );
  });

  it.each([
    ["google", googleProfile, "ada"],
    ["github", githubProfile, "grace"],
  ] as const)(
    "derives a username for %s that survives the same check",
    async (provider, profile, expected) => {
      const mapped = await mapperFor(provider)(profile);

      expect(mapped["username"]).toBe(expected);

      const parsed = validateAsCreate({ ...profile, ...mapped });

      expect(parsed["username"]).toBe(expected);
    },
  );

  it("mints a distinct username when the derived one is taken", async () => {
    const mapper = mapperFor("google");
    const first = await mapper({ email: "ada@example.com", name: "Ada" });

    expect(first["username"]).toBe("ada");

    await auth.api.signUpEmail({
      body: {
        email: "ada@example.com",
        name: "Ada",
        password: "correct horse battery staple",
        username: "ada",
      },
    });

    const second = await mapper({ email: "ada@example.com", name: "Ada" });

    expect(second["username"]).not.toBe("ada");
    expect(validateAsCreate({ ...googleProfile, ...second })).toMatchObject({
      username: second["username"],
    });
  });
});
