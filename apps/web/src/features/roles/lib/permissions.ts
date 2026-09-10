import {
  CHANNEL_PERMISSIONS,
  isChannelPermission,
  type PermissionName,
  Permissions,
} from "@opencord/shared/permissions";

interface PermissionInfo {
  label: string;
  channelLabel?: string;
  blurb?: string;
}

const CATALOG: Record<PermissionName, PermissionInfo> = {
  VIEW_CHANNEL: { label: "View channels", channelLabel: "View channel" },
  SEND_MESSAGES: { label: "Send messages" },
  ADD_REACTIONS: { label: "Add reactions" },
  MENTION_EVERYONE: { label: "Mention @everyone" },
  MANAGE_MESSAGES: { label: "Manage messages" },
  MANAGE_CHANNELS: {
    label: "Manage channels",
    channelLabel: "Manage channel",
  },
  MANAGE_ROLES: {
    label: "Manage roles",
    channelLabel: "Manage permissions",
  },
  MANAGE_SERVER: { label: "Manage server" },
  KICK_MEMBERS: { label: "Kick members" },
  BAN_MEMBERS: { label: "Ban members" },
  CREATE_INVITE: { label: "Create invites" },
  ADMINISTRATOR: {
    label: "Administrator",
    blurb: "Grants every permission and ignores channel overrides.",
  },
};

export const PERMISSION_LABELS: Record<PermissionName, string> =
  Object.fromEntries(
    Object.entries(CATALOG).map(([name, info]) => [name, info.label]),
  ) as Record<PermissionName, string>;

export function channelPermissionLabel(name: PermissionName): string {
  return CATALOG[name].channelLabel ?? CATALOG[name].label;
}

export function permissionBlurb(name: PermissionName): string | undefined {
  return CATALOG[name].blurb;
}

export const PERMISSION_NAMES = Object.keys(Permissions) as PermissionName[];

export const CHANNEL_PERMISSION_NAMES: PermissionName[] =
  PERMISSION_NAMES.filter((name) => isChannelPermission(Permissions[name]));

export interface PermissionGroup {
  title: string;
  description?: string;
  names: PermissionName[];
}

export const ROLE_PERMISSION_GROUPS: PermissionGroup[] = [
  {
    title: "Server",
    names: [
      "VIEW_CHANNEL",
      "MANAGE_CHANNELS",
      "MANAGE_ROLES",
      "MANAGE_SERVER",
      "CREATE_INVITE",
    ],
  },
  { title: "Members", names: ["KICK_MEMBERS", "BAN_MEMBERS"] },
  {
    title: "Channels",
    description: "Defaults for every channel; each channel can override them.",
    names: [
      "SEND_MESSAGES",
      "ADD_REACTIONS",
      "MENTION_EVERYONE",
      "MANAGE_MESSAGES",
    ],
  },
  { title: "Advanced", names: ["ADMINISTRATOR"] },
];

export const UNGROUPED_PERMISSIONS: PermissionName[] = PERMISSION_NAMES.filter(
  (name) => !ROLE_PERMISSION_GROUPS.some((group) => group.names.includes(name)),
);

export { CHANNEL_PERMISSIONS };

export function toggleBit(mask: number, bit: number, on: boolean): number {
  return on ? mask | bit : mask & ~bit;
}
