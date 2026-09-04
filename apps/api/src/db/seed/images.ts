import { deflateSync } from "node:zlib";

import type { Faker } from "@faker-js/faker";
import {
  maxUploadBytes,
  UPLOAD_EXTENSION,
  type UploadContentType,
} from "@opencord/shared/constants";
import type { MessageAttachmentInput } from "@opencord/shared/schemas";
import { desc, eq, sql } from "drizzle-orm";

import { createUploadGrant } from "../../lib/storage.js";
import {
  prepareAttachments,
  writeAttachments,
} from "../../modules/messages/attachments.js";
import { uploadObjectKey } from "../../modules/uploads/service.js";
import { db } from "../index.js";
import { messages } from "../schema/index.js";
import {
  type CommunityResult,
  repairWatermarks,
  type SeededChannel,
  type SeededUser,
} from "./community.js";
import { type Random, sentence, timeline, topicFor } from "./corpus.js";
import { seededFaker } from "./faker.js";

export const IMAGE_SEED = 486231;

const IMAGE_CONTENT_TYPE: UploadContentType = "image/png";

const IMAGE_CHANNELS = ["general", "engineering", "design", "random"];

const IMAGE_MESSAGE_MIX = [
  { images: 1, caption: true },
  { images: 1, caption: false },
  { images: 2, caption: true },
  { images: 1, caption: true },
  { images: 1, caption: false },
  { images: 1, caption: true },
] as const;

const IMAGE_SPREAD_MESSAGES = 60;

const SHAPES = [
  { width: 1024, height: 576 },
  { width: 800, height: 800 },
  { width: 720, height: 960 },
] as const;

const AXES = ["diagonal", "horizontal", "vertical"] as const;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface SeededImage {
  filename: string;
  contentType: UploadContentType;
  width: number;
  height: number;
  bytes: Buffer;
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_unused, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value;
});

function crc32(bytes: Buffer): number {
  let value = 0xffffffff;

  for (const byte of bytes) {
    value = (CRC_TABLE[(value ^ byte) & 0xff] ?? 0) ^ (value >>> 8);
  }

  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type: string, body: Buffer): Buffer {
  const header = Buffer.alloc(8);

  header.writeUInt32BE(body.length, 0);
  header.write(type, 4, "ascii");

  const crc = Buffer.alloc(4);

  crc.writeUInt32BE(crc32(Buffer.concat([header.subarray(4), body])), 0);

  return Buffer.concat([header, body, crc]);
}

function blend(from: number, to: number, at: number, lift: number): number {
  return Math.min(Math.round(from + (to - from) * at + lift), 255);
}

function render(
  shape: (typeof SHAPES)[number],
  axis: (typeof AXES)[number],
  from: Rgb,
  to: Rgb,
  bar: Rgb,
): Buffer {
  const stride = shape.width * 3 + 1;
  const raw = Buffer.alloc(stride * shape.height);
  const barHeight = Math.round(shape.height * 0.12);

  for (let y = 0; y < shape.height; y += 1) {
    const row = y * stride + 1;

    for (let x = 0; x < shape.width; x += 1) {
      const at = row + x * 3;
      const lift = x % 48 === 0 || y % 48 === 0 ? 18 : 0;
      const across = x / shape.width;
      const down = y / shape.height;

      const depth =
        axis === "horizontal"
          ? across
          : axis === "vertical"
            ? down
            : (across + down) / 2;

      if (y < barHeight) {
        raw[at] = Math.min(bar.r + lift, 255);
        raw[at + 1] = Math.min(bar.g + lift, 255);
        raw[at + 2] = Math.min(bar.b + lift, 255);
      } else {
        raw[at] = blend(from.r, to.r, depth, lift);
        raw[at + 1] = blend(from.g, to.g, depth, lift);
        raw[at + 2] = blend(from.b, to.b, depth, lift);
      }
    }
  }

  const header = Buffer.alloc(13);

  header.writeUInt32BE(shape.width, 0);
  header.writeUInt32BE(shape.height, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(2, 9);

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function rgb(faker: Faker): Rgb {
  const [r = 0, g = 0, b = 0] = faker.color.rgb({ format: "decimal" });

  return { r, g, b };
}

export function seedImage(faker: Faker): SeededImage {
  const shape = faker.helpers.arrayElement(SHAPES);

  return {
    filename: `${faker.word.adjective()}-${faker.word.noun()}.${UPLOAD_EXTENSION[IMAGE_CONTENT_TYPE]}`,
    contentType: IMAGE_CONTENT_TYPE,
    width: shape.width,
    height: shape.height,
    bytes: render(
      shape,
      faker.helpers.arrayElement(AXES),
      rgb(faker),
      rgb(faker),
      rgb(faker),
    ),
  };
}

async function upload(image: SeededImage, objectKey: string): Promise<void> {
  const grant = await createUploadGrant({
    objectKey,
    contentType: image.contentType,
    maxBytes: maxUploadBytes("attachment"),
  });

  const form = new FormData();

  for (const [name, value] of Object.entries(grant.fields)) {
    form.append(name, value);
  }

  form.append(
    "file",
    new Blob([new Uint8Array(image.bytes)], { type: image.contentType }),
    image.filename,
  );

  const response = await fetch(grant.url, { method: "POST", body: form });

  if (!response.ok) {
    throw new Error(
      `storage refused ${objectKey}: ${String(response.status)} ${await response.text()}`,
    );
  }
}

async function newestStretchFrom(
  channelId: string,
  newestAt: Date,
): Promise<number> {
  const [anchor] = await db
    .select({ createdAt: messages.createdAt })
    .from(messages)
    .where(eq(messages.channelId, channelId))
    .orderBy(desc(messages.id))
    .limit(1)
    .offset(IMAGE_SPREAD_MESSAGES);

  return (
    anchor?.createdAt ?? new Date(newestAt.getTime() - 60 * 60 * 1000)
  ).getTime();
}

interface ImageMessage {
  channel: SeededChannel;
  author: SeededUser;
  content: string;
  createdAt: Date;
  images: SeededImage[];
}

async function post(row: ImageMessage): Promise<void> {
  const inputs: MessageAttachmentInput[] = [];

  for (const image of row.images) {
    const objectKey = uploadObjectKey(row.author.id, {
      kind: "attachment",
      contentType: image.contentType,
    });

    await upload(image, objectKey);

    inputs.push({
      objectKey,
      filename: image.filename,
      width: image.width,
      height: image.height,
    });
  }

  const prepared = await prepareAttachments(row.author.id, inputs);

  await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(messages)
      .values({
        id: sql<string>`uuidv7(${row.createdAt.toISOString()}::timestamptz - clock_timestamp())`,
        channelId: row.channel.channelId,
        authorId: row.author.id,
        content: row.content,
        createdAt: row.createdAt,
      })
      .returning({ id: messages.id });

    if (inserted === undefined) {
      throw new Error(`could not post an image to ${row.channel.name}`);
    }

    await writeAttachments(tx, inserted.id, prepared);
  });
}

export interface ImageResult {
  messages: number;
  attachments: number;
}

export async function seedImageAttachments(
  community: CommunityResult,
): Promise<ImageResult> {
  const faker = await seededFaker(IMAGE_SEED);

  const random: Random = {
    next: () => faker.number.float(),
    pick: (values) => faker.helpers.arrayElement(values),
    int: (max) => faker.number.int({ min: 0, max: Math.max(max - 1, 0) }),
  };

  const targets = community.channels.filter((channel) =>
    IMAGE_CHANNELS.includes(channel.name),
  );

  const result: ImageResult = { messages: 0, attachments: 0 };

  for (const channel of targets) {
    const topic = topicFor(channel.name);

    const stamps = timeline(
      IMAGE_MESSAGE_MIX.length,
      await newestStretchFrom(channel.channelId, community.newestAt),
      community.newestAt.getTime(),
      random,
    );

    for (const [index, at] of stamps.entries()) {
      const plan = IMAGE_MESSAGE_MIX[index];

      if (plan === undefined) {
        continue;
      }

      const row: ImageMessage = {
        channel,
        author: random.pick(community.people),
        content: plan.caption ? sentence(random, topic) : "",
        createdAt: new Date(at),
        images: Array.from({ length: plan.images }, () => seedImage(faker)),
      };

      await post(row);

      result.messages += 1;
      result.attachments += row.images.length;
    }
  }

  await repairWatermarks();

  return result;
}
