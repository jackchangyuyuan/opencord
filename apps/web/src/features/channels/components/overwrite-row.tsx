import type { PermissionName } from "@opencord/shared/permissions";

import type { OverwriteState } from "@/features/channels/lib/overwrites";
import { channelPermissionLabel } from "@/features/roles/lib/permissions";
import { cn } from "@/lib/cn";

const OPTIONS: { value: OverwriteState; label: string }[] = [
  { value: "deny", label: "Deny" },
  { value: "neutral", label: "Inherit" },
  { value: "allow", label: "Allow" },
];

export function OverwriteRow({
  disabled = false,
  inherited,
  name,
  onChange,
  state,
}: {
  disabled?: boolean;
  inherited?: boolean;
  name: PermissionName;
  onChange: (next: OverwriteState) => void;
  state: OverwriteState;
}) {
  const label = channelPermissionLabel(name);

  const differs =
    inherited !== undefined &&
    ((state === "allow" && !inherited) || (state === "deny" && inherited));

  return (
    <li
      className={cn(
        "flex items-center gap-3 py-0.5",
        disabled && "text-muted-foreground",
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("truncate text-sm", differs && "font-medium")}>
          {label}
        </span>
        {state === "neutral" ? (
          inherited === undefined ? null : (
            <span className="text-xs text-muted-foreground">
              {inherited ? "Allowed by default" : "Not allowed by default"}
            </span>
          )
        ) : differs ? (
          <span className="text-xs text-muted-foreground">
            {state === "allow"
              ? "Added for this channel"
              : "Removed for this channel"}
          </span>
        ) : null}
      </span>
      <div
        aria-label={label}
        aria-readonly={disabled || undefined}
        className={cn(
          "flex shrink-0 items-center gap-0.5 rounded-lg border p-0.5",
          disabled && "cursor-not-allowed border-dashed bg-muted/20",
        )}
        role="radiogroup"
      >
        {OPTIONS.map((option) => (
          <button
            aria-checked={state === option.value}
            aria-label={`${label}: ${option.label}`}
            className={cn(
              "rounded-md px-2 py-0.5 text-xs",
              "focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none",
              state === option.value
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground",
              disabled &&
                cn(
                  "cursor-not-allowed hover:bg-transparent",
                  state === option.value ? "opacity-100" : "opacity-55",
                ),
            )}
            disabled={disabled}
            key={option.value}
            onClick={() => {
              onChange(option.value);
            }}
            role="radio"
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </li>
  );
}
