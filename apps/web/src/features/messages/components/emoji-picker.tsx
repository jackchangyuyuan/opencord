import { REACTION_EMOJI } from "@opencord/shared/constants";
import { SmilePlus } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePointerActivationLatch } from "@/lib/pointer-focus";

export function EmojiPicker({
  onPick,
  onClear,
  triggerLabel = "Add reaction",
  itemLabel = (emoji: string) => `React with ${emoji}`,
  trigger,
  tabbable = false,
}: {
  onPick: (emoji: string) => void;
  onClear?: (() => void) | undefined;
  triggerLabel?: string;
  itemLabel?: (emoji: string) => string;
  trigger?: ReactNode;
  tabbable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const activation = usePointerActivationLatch();

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            aria-label={triggerLabel}
            size="icon-xs"
            variant="ghost"
            type="button"
          />
        }
        {...(tabbable ? {} : { tabIndex: -1 })}
      >
        {trigger ?? <SmilePlus />}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64"
        {...(tabbable ? {} : { finalFocus: activation.finalFocus })}
      >
        <ul className="grid grid-cols-8 gap-0.5">
          {REACTION_EMOJI.map((emoji) => (
            <li key={emoji}>
              <Button
                aria-label={itemLabel(emoji)}
                onClick={(event) => {
                  activation.note(event);
                  onPick(emoji);
                  setOpen(false);
                }}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                {emoji}
              </Button>
            </li>
          ))}
        </ul>

        {onClear === undefined ? null : (
          <Button
            className="mt-1 w-full"
            onClick={(event) => {
              activation.note(event);
              onClear();
              setOpen(false);
            }}
            size="xs"
            type="button"
            variant="ghost"
          >
            Remove emoji
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
