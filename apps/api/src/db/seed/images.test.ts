import {
  MAX_ATTACHMENT_BYTES,
  UPLOAD_CONTENT_TYPES,
} from "@opencord/shared/constants";
import { describe, expect, it } from "vitest";

import { seededFaker } from "../../modules/demo/faker.js";
import { IMAGE_SEED, seedImage } from "./images.js";

const PNG_SIGNATURE = "89504e470d0a1a0a";

describe("a seeded image", () => {
  it("is a PNG whose header carries the dimensions the row records", async () => {
    const image = seedImage(await seededFaker(IMAGE_SEED));

    expect(image.bytes.subarray(0, 8).toString("hex")).toBe(PNG_SIGNATURE);
    expect(image.bytes.toString("ascii", 12, 16)).toBe("IHDR");
    expect(image.bytes.readUInt32BE(16)).toBe(image.width);
    expect(image.bytes.readUInt32BE(20)).toBe(image.height);
  });

  it("is an upload the association step would accept", async () => {
    const image = seedImage(await seededFaker(IMAGE_SEED));

    expect(UPLOAD_CONTENT_TYPES).toContain(image.contentType);
    expect(image.bytes.byteLength).toBeLessThan(MAX_ATTACHMENT_BYTES);
    expect(image.filename).toMatch(/^[a-z]+-[a-z]+\.png$/);
  });

  it("is reproducible from its seed", async () => {
    const first = seedImage(await seededFaker(IMAGE_SEED));
    const again = seedImage(await seededFaker(IMAGE_SEED));

    expect(again).toEqual(first);
  });

  it("does not repeat itself inside one run", async () => {
    const faker = await seededFaker(IMAGE_SEED);
    const first = seedImage(faker);
    const second = seedImage(faker);

    expect(second.bytes.equals(first.bytes)).toBe(false);
  });
});
