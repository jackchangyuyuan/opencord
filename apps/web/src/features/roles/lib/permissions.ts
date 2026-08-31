import { type PermissionName, Permissions } from "@opencord/shared/permissions";

export const PERMISSION_LABELS: Record<PermissionName, string> = {
  VIEW_CHANNEL: "View channels",
  SEND_MESSAGES: "Send messages",
  ADD_REACTIONS: "Add reactions",
  MENTION_EVERYONE: "Mention @everyone",
  MANAGE_MESSAGES: "Manage messages",
  MANAGE_CHANNELS: "Manage channels",
  MANAGE_ROLES: "Manage roles",
  MANAGE_SERVER: "Manage server",
  KICK_MEMBERS: "Kick members",
  BAN_MEMBERS: "Ban members",
  CREATE_INVITE: "Create invites",
  ADMINISTRATOR: "Administrator",
};

export const PERMISSION_NAMES = Object.keys(Permissions) as PermissionName[];

export function toggleBit(mask: number, bit: number, on: boolean): number {
  return on ? mask | bit : mask & ~bit;
}
