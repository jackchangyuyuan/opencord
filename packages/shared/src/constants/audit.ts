export const AUDIT_ACTIONS = [
  "member_kick",
  "member_ban",
  "member_unban",
  "invite_create",
  "invite_delete",
  "invite_redeem",
  "role_create",
  "role_update",
  "role_delete",
  "role_assign",
  "role_unassign",
  "overwrite_update",
  "overwrite_delete",
  "channel_create",
  "channel_update",
  "channel_delete",
  "server_update",
  "server_transfer",
  "message_delete",
  "message_pin",
  "message_unpin",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_TARGET_TYPES = [
  "member",
  "user",
  "role",
  "channel",
  "invite",
  "message",
  "server",
] as const;

export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

export const AUDIT_TARGET_GROUPS = {
  member: ["member", "user"],
  role: ["role"],
  channel: ["channel"],
  invite: ["invite"],
  message: ["message"],
  server: ["server"],
} as const satisfies Record<string, readonly AuditTargetType[]>;

export type AuditTargetGroup = keyof typeof AUDIT_TARGET_GROUPS;
