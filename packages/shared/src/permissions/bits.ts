export const Permissions = {
  VIEW_CHANNEL: 1 << 0,
  SEND_MESSAGES: 1 << 1,
  ADD_REACTIONS: 1 << 2,
  MENTION_EVERYONE: 1 << 3,
  MANAGE_MESSAGES: 1 << 4,
  MANAGE_CHANNELS: 1 << 5,
  MANAGE_ROLES: 1 << 6,
  MANAGE_SERVER: 1 << 7,
  KICK_MEMBERS: 1 << 8,
  BAN_MEMBERS: 1 << 9,
  CREATE_INVITE: 1 << 10,
  ADMINISTRATOR: 1 << 11,
} as const;

export type PermissionName = keyof typeof Permissions;

export const ALL_PERMISSIONS: number = Object.values(Permissions).reduce(
  (mask, bit) => mask | bit,
  0,
);

export const DM_PERMISSIONS: number =
  Permissions.VIEW_CHANNEL |
  Permissions.SEND_MESSAGES |
  Permissions.ADD_REACTIONS |
  Permissions.MANAGE_MESSAGES;
