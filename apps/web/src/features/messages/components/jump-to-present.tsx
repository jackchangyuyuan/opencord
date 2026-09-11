import { ArrowDown } from "lucide-react";

import { Button } from "@/components/ui/button";

export function JumpToPresent({
  count,
  onJump,
}: {
  count: number;
  onJump: () => void;
}) {
  if (count === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center">
      <Button
        className="pointer-events-auto shadow-e2"
        onClick={onJump}
        size="sm"
        variant="secondary"
      >
        <ArrowDown />
        {count === 1 ? "1 new message" : `${String(count)} new messages`}
      </Button>
    </div>
  );
}
