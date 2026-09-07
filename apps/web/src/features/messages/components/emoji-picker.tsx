import { REACTION_EMOJI } from "@opencord/shared/constants";
import { SmilePlus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button aria-label="Add reaction" size="icon-xs" variant="ghost" />
        }
        tabIndex={-1}
      >
        <SmilePlus />
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <ul className="grid grid-cols-8 gap-0.5">
          {REACTION_EMOJI.map((emoji) => (
            <li key={emoji}>
              <Button
                aria-label={`React with ${emoji}`}
                onClick={() => {
                  onPick(emoji);
                  setOpen(false);
                }}
                size="icon-xs"
                variant="ghost"
              >
                {emoji}
              </Button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
