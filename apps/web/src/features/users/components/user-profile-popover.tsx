import { type ReactNode, useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UserProfileCard } from "@/features/users/components/user-profile-card";

export function UserProfilePopover({
  userId,
  label,
  children = null,
  className,
  serverId,
  side = "right",
  tabbable = true,
  tooltip,
}: {
  userId: string;
  label: string;
  children?: ReactNode;
  className?: string;
  serverId?: string | undefined;
  side?: "top" | "right" | "bottom" | "left";
  tabbable?: boolean;
  tooltip?: string | undefined;
}) {
  const [open, setOpen] = useState(false);

  const trigger = (
    <PopoverTrigger
      aria-label={label}
      className={className}
      data-testid="profile-trigger"
      {...(tabbable ? {} : { tabIndex: -1 })}
    >
      {children}
    </PopoverTrigger>
  );

  return (
    <Popover onOpenChange={setOpen} open={open}>
      {tooltip === undefined ? (
        trigger
      ) : (
        <Tooltip>
          <TooltipTrigger render={trigger} />
          <TooltipContent className="max-w-80 break-words">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      )}
      <PopoverContent align="start" className="w-72" side={side}>
        <UserProfileCard
          onEdit={() => {
            setOpen(false);
          }}
          serverId={serverId}
          userId={userId}
        />
      </PopoverContent>
    </Popover>
  );
}
