import { useQuery } from "@tanstack/react-query";
import {
  LogOut,
  Moon,
  Pencil,
  Settings,
  Sun,
  UserRoundCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSession, useSignOut } from "@/features/auth/hooks/use-session";
import { useActiveServerId } from "@/features/channels/api/queries";
import { currentUserQuery } from "@/features/users/api/queries";
import { UserAvatar } from "@/features/users/components/user-avatar";
import { UserProfilePopover } from "@/features/users/components/user-profile-popover";
import { useUserPresence } from "@/features/users/hooks/use-user-presence";
import { type Theme, usePrefs } from "@/stores/prefs";
import { PRESENCE_LABEL } from "@/stores/presence";
import { useUi } from "@/stores/ui";

function EditProfileButton() {
  const openModal = useUi((state) => state.openModal);

  return (
    <Tooltip>
      <TooltipTrigger
        aria-label="Edit profile"
        render={
          <Button
            className="text-muted-foreground hover:text-foreground"
            onClick={() => {
              openModal("profile");
            }}
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <Pencil />
      </TooltipTrigger>
      <TooltipContent side="top">Edit profile</TooltipContent>
    </Tooltip>
  );
}

function SettingsMenu() {
  const theme = usePrefs((state) => state.theme);
  const setTheme = usePrefs((state) => state.setTheme);
  const { user } = useSession();
  const openModal = useUi((state) => state.openModal);
  const signOut = useSignOut();

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              aria-label="Settings"
              render={
                <Button
                  className="text-muted-foreground hover:text-foreground"
                  size="icon-sm"
                  variant="ghost"
                />
              }
            />
          }
        >
          <Settings />
        </TooltipTrigger>
        <TooltipContent side="top">Settings</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-48" side="top">
        <DropdownMenuRadioGroup
          onValueChange={(value) => {
            setTheme(value as Theme);
          }}
          value={theme}
        >
          <DropdownMenuLabel>Appearance</DropdownMenuLabel>
          <DropdownMenuRadioItem value="light">
            <Sun />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon />
            Dark
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {user?.isAnonymous === true ? (
          <DropdownMenuItem
            onClick={() => {
              openModal("claim-account");
            }}
          >
            <UserRoundCheck />
            Save my account
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          disabled={signOut.isPending}
          onClick={() => {
            signOut.mutate();
          }}
          variant="destructive"
        >
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserBar() {
  const { data: me } = useQuery(currentUserQuery);
  const status = useUserPresence(me?.id);
  const serverId = useActiveServerId();

  const name = me?.name ?? "\u2026";
  const customStatus = me?.customStatus ?? null;
  const customStatusEmoji = me?.customStatusEmoji ?? null;
  const announcing = customStatus !== null || customStatusEmoji !== null;

  const identity = (
    <>
      <UserAvatar
        avatarUrl={me?.avatarUrl ?? null}
        name={name}
        size="md"
        userId={me?.id}
      />
      <span className="flex min-w-0 flex-1 flex-col items-start">
        <span className="w-full truncate text-body leading-tight font-semibold">
          {name}
        </span>
        <span className="w-full truncate text-meta leading-tight text-muted-foreground">
          {announcing ? (
            <>
              {customStatusEmoji === null ? null : (
                <span className="mr-1">{customStatusEmoji}</span>
              )}
              {customStatus}
            </>
          ) : (
            PRESENCE_LABEL[status]
          )}
        </span>
      </span>
    </>
  );

  return (
    <div
      className="flex h-footer shrink-0 items-center gap-1 border-t bg-sidebar px-2"
      data-slot="user-bar"
    >
      {me === undefined ? (
        <div className="flex min-h-footer-control min-w-0 flex-1 items-center gap-2.5 px-1">
          {identity}
        </div>
      ) : (
        <UserProfilePopover
          className="flex min-h-footer-control min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-1 text-left transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          label="Your profile"
          serverId={serverId}
          side="top"
          userId={me.id}
        >
          {identity}
        </UserProfilePopover>
      )}

      <div className="flex shrink-0 items-center gap-0.5">
        <EditProfileButton />
        <SettingsMenu />
      </div>
    </div>
  );
}
