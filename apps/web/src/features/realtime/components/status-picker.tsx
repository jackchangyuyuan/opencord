import type { PresenceStatus } from "@opencord/shared/types";
import { ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PresenceDot } from "@/features/members/components/presence-dot";
import { cn } from "@/lib/cn";
import {
  PRESENCE_LABEL,
  type SelfStatus,
  usePresence,
} from "@/stores/presence";

const OPTIONS: SelfStatus[] = ["online", "idle", "dnd"];

export function StatusPicker({
  appearance = "compact",
  className,
}: {
  appearance?: "compact" | "field";
  className?: string;
}) {
  const self = usePresence((state) => state.self);
  const setSelf = usePresence((state) => state.setSelf);

  const status: PresenceStatus = self;
  const field = appearance === "field";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Your status: ${PRESENCE_LABEL[status]}`}
        render={
          <Button
            className={cn(
              field
                ? "h-9 w-full justify-start gap-2.5 px-3 font-normal"
                : "h-6 gap-1.5 px-1.5",
              className,
            )}
            size={field ? "sm" : "xs"}
            variant={field ? "outline" : "ghost"}
          />
        }
      >
        <PresenceDot className={cn(field && "size-2.5")} status={status} />
        <span className="min-w-0 truncate">{PRESENCE_LABEL[status]}</span>
        <ChevronsUpDown
          className={cn(
            "ml-auto shrink-0 opacity-60",
            field ? "size-4" : "size-3",
          )}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className={field ? "w-(--anchor-width) min-w-48 p-1.5" : "w-48"}
        side={field ? "bottom" : "top"}
      >
        <DropdownMenuRadioGroup
          onValueChange={(value) => {
            setSelf(value as SelfStatus);
          }}
          value={self}
        >
          {OPTIONS.map((option) => (
            <DropdownMenuRadioItem
              className={cn(
                field && "gap-2.5 py-2 pl-2.5 data-checked:font-medium",
              )}
              key={option}
              value={option}
            >
              <PresenceDot
                className={cn(field && "size-2.5")}
                status={option}
              />
              {PRESENCE_LABEL[option]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
