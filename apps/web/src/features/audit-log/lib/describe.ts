import type {
  AuditAction,
  AuditLogEntry,
} from "@/features/audit-log/api/queries";
import { colorName } from "@/features/roles/lib/color-name";

export interface Part {
  kind: "name" | "text";
  text: string;
}

export interface AuditStory {
  parts: Part[];
  reason: string | null;
  detail: string | null;
}

export interface AuditNames {
  actor: string;
  target: string | null;
  author: string | null;
  channel: string | null;
  role: string | null;
}

const name = (text: string): Part => ({ kind: "name", text });
const text = (value: string): Part => ({ kind: "text", text: value });

function rolePhrase(role: string | null): Part[] {
  return role === null
    ? [text("a role that no longer exists")]
    : [text("the "), name(role), text(" role")];
}

function channelPhrase(channel: string | null): Part[] {
  return channel === null
    ? [text("a channel that no longer exists")]
    : [name(`#${channel}`)];
}

function field(metadata: unknown, key: string): unknown {
  return typeof metadata === "object" && metadata !== null
    ? (metadata as Record<string, unknown>)[key]
    : undefined;
}

function str(metadata: unknown, key: string): string | null {
  const value = field(metadata, key);

  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function has(metadata: unknown, key: string): boolean {
  return field(metadata, key) !== undefined;
}

function changeDetail(action: AuditAction, metadata: unknown): string | null {
  if (action === "role_update" || action === "channel_update") {
    const renamed = str(metadata, "name");

    if (renamed !== null) {
      return `Renamed to ${renamed}`;
    }
  }

  if (action === "role_update") {
    const colour = field(metadata, "color");

    if (typeof colour === "number") {
      return `Colour set to ${colorName(colour)}`;
    }

    if (colour === null) {
      return "Colour removed";
    }

    if (has(metadata, "permissions")) {
      return "Permissions changed";
    }
  }

  if (action === "channel_update") {
    const topic = field(metadata, "topic");

    if (typeof topic === "string" && topic.trim() !== "") {
      return `Topic set to ${topic}`;
    }

    if (topic === null || topic === "") {
      return "Topic cleared";
    }
  }

  if (action === "server_update") {
    const renamed = str(metadata, "name");

    if (renamed !== null) {
      return `Renamed to ${renamed}`;
    }

    if (has(metadata, "description")) {
      return field(metadata, "description") === null
        ? "Description cleared"
        : "Description changed";
    }

    if (has(metadata, "iconObjectKey")) {
      return "Icon changed";
    }
  }

  return null;
}

export function describeAudit(
  entry: AuditLogEntry,
  names: AuditNames,
): AuditStory {
  const actor = names.actor;
  const target = names.target;
  const channel = names.channel;
  const role = names.role;
  const reason = str(entry.metadata, "reason");
  const detail = changeDetail(entry.action, entry.metadata);
  const inChannel: Part[] =
    channel === null ? [] : [text(" in "), ...channelPhrase(channel)];

  const story = (parts: Part[]): AuditStory => ({ detail, parts, reason });

  switch (entry.action) {
    case "member_ban":
      return story(
        target === null
          ? [name(actor), text(" banned somebody")]
          : [name(target), text(" was banned by "), name(actor)],
      );

    case "member_kick":
      return story(
        target === null
          ? [name(actor), text(" removed somebody")]
          : [name(target), text(" was removed by "), name(actor)],
      );

    case "member_unban":
      return story(
        target === null
          ? [name(actor), text(" lifted a ban")]
          : [name(target), text("'s ban was lifted by "), name(actor)],
      );

    case "role_assign":
      return story([
        name(actor),
        text(" gave "),
        name(target ?? "somebody"),
        text(" "),
        ...rolePhrase(role),
      ]);

    case "role_unassign":
      return story([
        name(actor),
        text(" took "),
        ...rolePhrase(role),
        text(" from "),
        name(target ?? "somebody"),
      ]);

    case "role_create":
      return story([name(actor), text(" created "), ...rolePhrase(role)]);

    case "role_delete":
      return story([name(actor), text(" deleted "), ...rolePhrase(role)]);

    case "role_update":
      return has(entry.metadata, "reordered")
        ? story([name(actor), text(" reordered the roles")])
        : story([name(actor), text(" changed "), ...rolePhrase(role)]);

    case "channel_create":
      return story([name(actor), text(" created "), ...channelPhrase(channel)]);

    case "channel_delete":
      return story([name(actor), text(" deleted "), ...channelPhrase(channel)]);

    case "channel_update":
      return has(entry.metadata, "reordered")
        ? story([name(actor), text(" reordered the channels")])
        : story([name(actor), text(" changed "), ...channelPhrase(channel)]);

    case "overwrite_update":
      return story([
        name(actor),
        text(" changed what "),
        ...(entry.targetType === "role"
          ? rolePhrase(role)
          : [name(target ?? "somebody")]),
        text(" may do"),
        ...inChannel,
      ]);

    case "overwrite_delete":
      return story([
        name(actor),
        text(" cleared the override for "),
        ...(entry.targetType === "role"
          ? rolePhrase(role)
          : [name(target ?? "somebody")]),
        ...inChannel,
      ]);

    case "message_delete":
      return story([
        name(actor),
        text(" deleted a message"),
        ...(names.author === null ? [] : [text(" from "), name(names.author)]),
        ...inChannel,
      ]);

    case "message_pin":
      return story([name(actor), text(" pinned a message"), ...inChannel]);

    case "message_unpin":
      return story([name(actor), text(" unpinned a message"), ...inChannel]);

    case "server_transfer":
      return story([
        name(actor),
        text(" handed the server to "),
        name(target ?? "somebody"),
      ]);

    case "server_update":
      return story([name(actor), text(" changed the server")]);

    case "invite_create":
      return story([name(actor), text(" created an invite")]);

    case "invite_delete":
      return story([
        name(actor),
        text(" revoked the invite "),
        ...(entry.targetId === null ? [text("link")] : [name(entry.targetId)]),
      ]);

    case "invite_redeem":
      return story([name(actor), text(" joined with an invite")]);

    default:
      return story([name(actor), text(" acted on this server")]);
  }
}

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
  ["week", 4.348],
  ["month", 12],
];

export function relativeTime(iso: string, now: number = Date.now()): string {
  let value = (new Date(iso).getTime() - now) / 1000;

  for (const [unit, span] of STEPS) {
    if (Math.abs(value) < span) {
      return RELATIVE.format(Math.round(value), unit);
    }

    value /= span;
  }

  return RELATIVE.format(Math.round(value), "year");
}

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  member_kick: "Member kicked",
  member_ban: "Member banned",
  member_unban: "Ban lifted",
  invite_create: "Invite created",
  invite_delete: "Invite revoked",
  invite_redeem: "Invite used",
  role_create: "Role created",
  role_update: "Role changed",
  role_delete: "Role deleted",
  role_assign: "Role given",
  role_unassign: "Role taken",
  overwrite_update: "Channel override changed",
  overwrite_delete: "Channel override cleared",
  channel_create: "Channel created",
  channel_update: "Channel changed",
  channel_delete: "Channel deleted",
  server_update: "Server changed",
  server_transfer: "Ownership transferred",
  message_delete: "Message deleted",
  message_pin: "Message pinned",
  message_unpin: "Message unpinned",
};

export const AUDIT_ACTION_GROUPS: {
  label: string;
  actions: AuditAction[];
}[] = [
  {
    label: "Members",
    actions: ["member_kick", "member_ban", "member_unban"],
  },
  {
    label: "Roles",
    actions: [
      "role_create",
      "role_update",
      "role_delete",
      "role_assign",
      "role_unassign",
    ],
  },
  {
    label: "Channels",
    actions: [
      "channel_create",
      "channel_update",
      "channel_delete",
      "overwrite_update",
      "overwrite_delete",
    ],
  },
  {
    label: "Invites",
    actions: ["invite_create", "invite_delete", "invite_redeem"],
  },
  {
    label: "Messages",
    actions: ["message_delete", "message_pin", "message_unpin"],
  },
  { label: "Server", actions: ["server_update", "server_transfer"] },
];
