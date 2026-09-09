import type { ReactElement } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { useClipped } from "@/lib/use-clipped";

export function Truncated({
  className,
  title,
  value,
}: {
  className?: string | undefined;
  title?: string | undefined;
  value: string;
}) {
  const { clipped, ref } = useClipped<HTMLSpanElement>();

  const text = (
    <span className={cn("block min-w-0 truncate", className)} ref={ref}>
      {value}
    </span>
  );

  if (!clipped) {
    return text;
  }

  return (
    <Tooltip>
      <TooltipTrigger
        className="min-w-0 rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        render={<span tabIndex={0} />}
      >
        {text}
      </TooltipTrigger>
      <TooltipContent className="max-w-80">{title ?? value}</TooltipContent>
    </Tooltip>
  );
}

export function TruncatedControl({
  children,
  clipped,
  value,
}: {
  children: ReactElement;
  clipped: boolean;
  value: string;
}) {
  if (!clipped) {
    return children;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent className="max-w-80">{value}</TooltipContent>
    </Tooltip>
  );
}
