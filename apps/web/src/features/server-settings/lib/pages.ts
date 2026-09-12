import { Permissions } from "@opencord/shared/permissions";
import {
  Gavel,
  Hash,
  type LucideIcon,
  ScrollText,
  Shield,
  SlidersHorizontal,
  Users,
} from "lucide-react";

export type SettingsPageId =
  "overview" | "roles" | "members" | "invites" | "bans" | "audit-log";

export interface SettingsPageDefinition {
  id: SettingsPageId;
  label: string;
  icon: LucideIcon;
  requires: number | null;
}

export interface SettingsGroup {
  label: string;
  pages: SettingsPageDefinition[];
}

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    label: "Server",
    pages: [
      {
        id: "overview",
        label: "Overview",
        icon: SlidersHorizontal,
        requires: null,
      },
      { id: "roles", label: "Roles", icon: Shield, requires: null },
      { id: "members", label: "Members", icon: Users, requires: null },
      {
        id: "invites",
        label: "Invites",
        icon: Hash,
        requires: Permissions.CREATE_INVITE,
      },
    ],
  },
  {
    label: "Moderation",
    pages: [
      { id: "bans", label: "Bans", icon: Gavel, requires: null },
      {
        id: "audit-log",
        label: "Audit log",
        icon: ScrollText,
        requires: Permissions.MANAGE_SERVER,
      },
    ],
  },
];

export function visibleGroups(permissions: number): SettingsGroup[] {
  return SETTINGS_GROUPS.map((group) => ({
    ...group,
    pages: group.pages.filter(
      (page) =>
        page.requires === null ||
        (permissions & page.requires) === page.requires,
    ),
  })).filter((group) => group.pages.length > 0);
}

export function resolvePage(
  requested: SettingsPageId,
  groups: SettingsGroup[],
): SettingsPageId | null {
  const pages = groups.flatMap((group) => group.pages);

  if (pages.some((page) => page.id === requested)) {
    return requested;
  }

  return pages[0]?.id ?? null;
}
