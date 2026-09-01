import type { PermissionName } from "@opencord/shared/permissions";

import type { OverwriteState } from "@/features/channels/lib/overwrites";
import { PERMISSION_LABELS } from "@/features/roles/lib/permissions";
import { cn } from "@/lib/cn";

const OPTIONS: { value: OverwriteState; label: string }[] = [
  { value: "deny", label: "Deny" },
  { value: "neutral", label: "Inherit" },
  { value: "allow", label: "Allow" },
];

export function OverwriteRow({
  disabled = false,
  name,
  onChange,
  state,
}: {
  disabled?: boolean;
  name: PermissionName;
  onChange: (next: OverwriteState) => void;
  state: OverwriteState;
}) {
  const label = PERMISSION_LABELS[name];

  return (
    <li className="flex items-center gap-3">
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      <div
        aria-label={label}
        className="flex items-center gap-0.5 rounded-lg border p-0.5"
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
              disabled && "opacity-50",
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
