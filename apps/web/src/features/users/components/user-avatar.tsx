import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PresenceDot } from "@/features/members/components/presence-dot";
import { useUserPresence } from "@/features/users/hooks/use-user-presence";
import { cn } from "@/lib/cn";

export type UserAvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const AVATAR: Record<UserAvatarSize, string> = {
  xs: "size-5",
  sm: "size-9",
  md: "size-10",
  lg: "size-11",
  xl: "size-20",
};

const INITIALS: Record<UserAvatarSize, string> = {
  xs: "text-[0.5rem] font-semibold",
  sm: "text-micro font-semibold",
  md: "text-meta font-semibold",
  lg: "text-meta font-semibold",
  xl: "text-xl font-semibold",
};

const DOT: Record<UserAvatarSize, string> = {
  xs: "size-2",
  sm: "size-2.5",
  md: "size-3",
  lg: "size-3",
  xl: "size-5",
};

const OFFSET: Record<UserAvatarSize, string> = {
  xs: "-right-0.5 -bottom-0.5",
  sm: "-right-0.5 -bottom-0.5",
  md: "-right-0.5 -bottom-0.5",
  lg: "-right-0.5 -bottom-0.5",
  xl: "right-1 bottom-1",
};

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export function UserAvatar({
  userId,
  name,
  avatarUrl = null,
  size = "md",
  ring = "ring-sidebar",
  showPresence = true,
  className,
}: {
  userId: string | undefined;
  name: string;
  avatarUrl?: string | null;
  size?: UserAvatarSize;
  ring?: string;
  showPresence?: boolean;
  className?: string;
}) {
  const status = useUserPresence(userId);

  return (
    <span className={cn("relative flex w-fit shrink-0", className)}>
      <Avatar aria-hidden className={AVATAR[size]}>
        <AvatarImage alt="" src={avatarUrl ?? undefined} />
        <AvatarFallback className={INITIALS[size]}>
          {initials(name)}
        </AvatarFallback>
      </Avatar>
      {showPresence ? (
        <span
          className={cn(
            "absolute flex rounded-full ring-2",
            OFFSET[size],
            ring,
          )}
        >
          <PresenceDot className={DOT[size]} status={status} />
        </span>
      ) : null}
    </span>
  );
}
