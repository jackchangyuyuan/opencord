import { beforeEach, describe, expect, it } from "vitest";

import { statusOf, usePresence } from "./presence";

beforeEach(() => {
  usePresence.setState({ byUser: {}, self: "online" });
});

describe("the presence store", () => {
  it("treats an unknown user as offline", () => {
    expect(statusOf(usePresence.getState().byUser, "u-nobody")).toBe("offline");
  });

  it("records the aggregate the server broadcast", () => {
    usePresence.getState().setStatus("u-ada", "idle");

    expect(statusOf(usePresence.getState().byUser, "u-ada")).toBe("idle");
  });

  it("keeps the chosen status separate from everyone else's", () => {
    usePresence.getState().setSelf("dnd");
    usePresence.getState().setStatus("u-ada", "online");

    expect(usePresence.getState().self).toBe("dnd");
    expect(statusOf(usePresence.getState().byUser, "u-ada")).toBe("online");
  });

  it("does not persist anything to localStorage", () => {
    usePresence.getState().setSelf("dnd");

    expect(localStorage.length).toBe(0);
  });
});
