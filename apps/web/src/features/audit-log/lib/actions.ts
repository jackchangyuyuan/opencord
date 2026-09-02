import type { AuditAction } from "@/features/audit-log/api/queries";

export const ACTION_COPY: Record<AuditAction, string> = {
  member_kick: "kicked a member",
  member_ban: "banned a member",
  member_unban: "lifted a ban",
  invite_create: "created an invite",
  invite_redeem: "joined with an invite",
  role_create: "created a role",
  role_update: "changed a role",
  role_delete: "deleted a role",
  role_assign: "gave someone a role",
  role_unassign: "took a role away",
  overwrite_update: "changed channel access",
  overwrite_delete: "cleared a channel access rule",
  channel_create: "created a channel",
  channel_update: "changed a channel",
  channel_delete: "deleted a channel",
  server_update: "changed the server",
  server_transfer: "handed the server over",
  message_delete: "deleted a message",
  message_pin: "pinned a message",
  message_unpin: "unpinned a message",
};
