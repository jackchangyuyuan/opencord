import { Permissions } from "@opencord/shared/permissions";

// The shape of the seeded community: which servers exist, what they are about,
// who holds which role in them, and how the message budget is divided.
//
// Shares rather than counts, so the whole corpus scales from one number and the
// balance between servers stays fixed. The landing server takes the largest
// share because it is the one anyone opening the demo sees first.

export const EVERYONE_PERMISSIONS =
  Permissions.VIEW_CHANNEL |
  Permissions.SEND_MESSAGES |
  Permissions.ADD_REACTIONS |
  Permissions.CREATE_INVITE;

export const MODERATOR_PERMISSIONS =
  EVERYONE_PERMISSIONS |
  Permissions.MANAGE_MESSAGES |
  Permissions.KICK_MEMBERS |
  Permissions.MANAGE_CHANNELS;

const ADMIN_PERMISSIONS =
  MODERATOR_PERMISSIONS |
  Permissions.MANAGE_ROLES |
  Permissions.MANAGE_SERVER |
  Permissions.BAN_MEMBERS;

export interface Holders {
  start: number;
  end: number;
  every: number;
}

export interface RolePlan {
  name: string;
  color: number | null;
  permissions: number;
  holders: Holders;
}

export interface ChannelPlan {
  name: string;
  topic: string;
  // Share of the server's own message budget.
  share: number;
  // Restricts the channel to one named role, which must exist in the plan.
  privateTo?: string;
  // How many trailing messages a visitor has not read. 0 leaves it read.
  unread?: number;
}

export interface ServerPlan {
  key: string;
  name: string;
  description: string;
  // Share of the whole corpus.
  share: number;
  // Fraction of the cast that belongs to this server.
  memberShare: number;
  // How long the server has existed, which sets member join dates and the
  // window its backlog is spread across.
  ageDays: number;
  channels: ChannelPlan[];
  roles: RolePlan[];
}

// Every server carries a Moderator role: the audit trail, the bans and the
// pinning all need someone entitled to have done them.
const MODERATOR = (color: number, end: number): RolePlan => ({
  name: "Moderator",
  color,
  permissions: MODERATOR_PERMISSIONS,
  holders: { start: 0, end, every: 1 },
});

export const SERVERS: ServerPlan[] = [
  {
    key: "hq",
    name: "OpenCord HQ",
    description:
      "The team building OpenCord. Releases, incidents, design review, and the occasional argument about kettles.",
    share: 0.4,
    memberShare: 1,
    ageDays: 640,
    channels: [
      {
        name: "announcements",
        topic: "Rarely, but read it",
        share: 0.02,
        unread: 1,
      },
      {
        name: "general",
        topic: "Everything and nothing",
        share: 0.22,
        unread: 7,
      },
      { name: "engineering", topic: "How it is built", share: 0.3, unread: 14 },
      { name: "design", topic: "How it looks", share: 0.12, unread: 3 },
      { name: "releases", topic: "What shipped, and when", share: 0.09 },
      {
        name: "incidents",
        topic: "While it is on fire",
        share: 0.07,
        unread: 5,
      },
      {
        name: "support",
        topic: "When it breaks for someone else",
        share: 0.08,
      },
      {
        name: "tooling",
        topic: "The things that build the thing",
        share: 0.05,
      },
      { name: "random", topic: "Off topic on purpose", share: 0.05, unread: 2 },
      {
        name: "core-team",
        topic: "Not for everyone",
        share: 0.0,
        privateTo: "Core",
      },
    ],
    roles: [
      {
        name: "Contributor",
        color: null,
        permissions: EVERYONE_PERMISSIONS,
        holders: { start: 20, end: 120, every: 4 },
      },
      {
        name: "Designer",
        color: 0xec4899,
        permissions: EVERYONE_PERMISSIONS,
        holders: { start: 10, end: 70, every: 5 },
      },
      {
        name: "Developer",
        color: 0x3b82f6,
        permissions: EVERYONE_PERMISSIONS | Permissions.MENTION_EVERYONE,
        holders: { start: 8, end: 80, every: 3 },
      },
      {
        name: "Release Crew",
        color: 0xf59e0b,
        permissions: EVERYONE_PERMISSIONS | Permissions.MANAGE_MESSAGES,
        holders: { start: 2, end: 14, every: 3 },
      },
      {
        name: "Core",
        color: 0xe67e22,
        permissions: ADMIN_PERMISSIONS,
        holders: { start: 0, end: 8, every: 1 },
      },
      MODERATOR(0x5865f2, 4),
    ],
  },
  {
    key: "lounge",
    name: "The Lounge",
    description:
      "No agenda. Music, food, pets, and whatever happened to you on the way in.",
    share: 0.14,
    memberShare: 0.75,
    ageDays: 500,
    channels: [
      { name: "general", topic: "Say hello", share: 0.3, unread: 4 },
      { name: "random", topic: "The usual nonsense", share: 0.32, unread: 9 },
      { name: "music", topic: "What is on", share: 0.16 },
      { name: "food", topic: "Strong opinions, weakly held", share: 0.13 },
      {
        name: "pets",
        topic: "The real reason anyone is here",
        share: 0.09,
        unread: 3,
      },
    ],
    roles: [
      {
        name: "Regular",
        color: null,
        permissions: EVERYONE_PERMISSIONS,
        holders: { start: 0, end: 120, every: 6 },
      },
      {
        name: "Event Host",
        color: 0x14b8a6,
        permissions: EVERYONE_PERMISSIONS | Permissions.MENTION_EVERYONE,
        holders: { start: 4, end: 12, every: 2 },
      },
      MODERATOR(0x8b5cf6, 2),
    ],
  },
  {
    key: "campus",
    name: "Waterloo CS",
    description:
      "Course chat, co-op war stories, and people asking about the same assignment every term.",
    share: 0.2,
    memberShare: 0.6,
    ageDays: 430,
    channels: [
      { name: "introductions", topic: "Start here", share: 0.1, unread: 2 },
      { name: "general", topic: "Campus and everything else", share: 0.2 },
      {
        name: "courses",
        topic: "Assignments and lectures",
        share: 0.26,
        unread: 11,
      },
      { name: "help", topic: "Stuck? Ask here", share: 0.22, unread: 6 },
      { name: "internships", topic: "Co-op, interviews, offers", share: 0.14 },
      { name: "projects", topic: "Things people are building", share: 0.08 },
      {
        name: "ta-only",
        topic: "Marking and moderation",
        share: 0.0,
        privateTo: "TA",
      },
    ],
    roles: [
      {
        name: "Student",
        color: null,
        permissions: EVERYONE_PERMISSIONS,
        holders: { start: 0, end: 120, every: 2 },
      },
      {
        name: "Alum",
        color: 0x0ea5e9,
        permissions: EVERYONE_PERMISSIONS,
        holders: { start: 5, end: 45, every: 7 },
      },
      {
        name: "TA",
        color: 0xf97316,
        permissions: EVERYONE_PERMISSIONS | Permissions.MANAGE_MESSAGES,
        holders: { start: 1, end: 16, every: 5 },
      },
      MODERATOR(0x22c55e, 3),
    ],
  },
  {
    key: "homelab",
    name: "Homelab",
    description:
      "Racks in spare rooms. Hardware, networking, self-hosting, and restores that were never tested.",
    share: 0.16,
    memberShare: 0.45,
    ageDays: 380,
    channels: [
      { name: "general", topic: "Anything with a power supply", share: 0.22 },
      {
        name: "hardware",
        topic: "What you bought and why",
        share: 0.26,
        unread: 8,
      },
      { name: "networking", topic: "VLANs and regret", share: 0.2 },
      {
        name: "self-hosting",
        topic: "Run it yourself",
        share: 0.24,
        unread: 4,
      },
      { name: "deals", topic: "Refurbished and dangerous", share: 0.08 },
    ],
    roles: [
      {
        name: "Tinkerer",
        color: null,
        permissions: EVERYONE_PERMISSIONS,
        holders: { start: 0, end: 120, every: 3 },
      },
      {
        name: "Rack Owner",
        color: 0xa855f7,
        permissions: EVERYONE_PERMISSIONS,
        holders: { start: 3, end: 30, every: 4 },
      },
      MODERATOR(0x64748b, 2),
    ],
  },
  {
    key: "ops",
    name: "Deploy Friday",
    description:
      "On-call rotations, postmortems, and the strongly held belief that Friday deploys are fine actually.",
    share: 0.1,
    memberShare: 0.35,
    ageDays: 300,
    channels: [
      { name: "general", topic: "Operational chatter", share: 0.24 },
      { name: "incidents", topic: "Live, and loud", share: 0.3, unread: 6 },
      { name: "postmortems", topic: "What we learned", share: 0.2 },
      { name: "oncall", topic: "Who has the pager", share: 0.16, unread: 2 },
      { name: "tooling", topic: "Dashboards and duct tape", share: 0.1 },
      {
        name: "incident-command",
        topic: "Declared incidents only",
        share: 0.0,
        privateTo: "Incident Commander",
      },
    ],
    roles: [
      {
        name: "Responder",
        color: null,
        permissions: EVERYONE_PERMISSIONS,
        holders: { start: 0, end: 120, every: 3 },
      },
      {
        name: "Incident Commander",
        color: 0xef4444,
        permissions: EVERYONE_PERMISSIONS | Permissions.MENTION_EVERYONE,
        holders: { start: 0, end: 12, every: 3 },
      },
      MODERATOR(0x0891b2, 2),
    ],
  },
];

export const LANDING_SERVER_KEY = "hq";

export const LANDING_SERVER_NAME =
  SERVERS.find((server) => server.key === LANDING_SERVER_KEY)?.name ?? "";
export const LANDING_CHANNEL_NAME = "engineering";

// A non-empty tuple rather than string[]: callers index the first name, and an
// empty catalogue is a programming error worth failing on at load.
function catalogueNames(
  plans: readonly ServerPlan[],
): readonly [string, ...string[]] {
  const [first, ...rest] = plans.map((plan) => plan.name);

  if (first === undefined) {
    throw new Error("the server catalogue is empty");
  }

  return [first, ...rest];
}

export const COMMUNITY_SERVER_NAMES = catalogueNames(SERVERS);

// The unread depth a visitor arrives with, looked up by channel name. Names
// repeat across servers, so the first plan that carries the name wins -- the
// point is a spread of badge sizes, not a per-server rule.
const UNREAD_BY_NAME = new Map<string, number>(
  SERVERS.flatMap((server) =>
    server.channels.map(
      (channel) => [channel.name, channel.unread ?? 0] as const,
    ),
  ).reverse(),
);

export function unreadDepthsFor(names: readonly (string | null)[]): number[] {
  return names.map((name) =>
    name === null ? 0 : (UNREAD_BY_NAME.get(name) ?? 0),
  );
}
