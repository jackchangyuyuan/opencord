import { Permissions } from "@opencord/shared/permissions";

import { Switch } from "@/components/ui/switch";
import {
  PERMISSION_LABELS,
  PERMISSION_NAMES,
  toggleBit,
} from "@/features/roles/lib/permissions";

export function PermissionGrid({
  disabled = false,
  heldByActor,
  onChange,
  value,
}: {
  disabled?: boolean;
  heldByActor: number;
  onChange: (next: number) => void;
  value: number;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {PERMISSION_NAMES.map((name) => {
        const bit = Permissions[name];
        const held = (heldByActor & bit) === bit;
        const locked = disabled || !held;

        return (
          <li className="flex items-center gap-3" key={name}>
            <Switch
              aria-label={PERMISSION_LABELS[name]}
              checked={(value & bit) === bit}
              disabled={locked}
              onCheckedChange={(next) => {
                if (locked) {
                  return;
                }

                onChange(toggleBit(value, bit, next));
              }}
            />
            <span
              className={locked ? "text-sm text-muted-foreground" : "text-sm"}
            >
              {PERMISSION_LABELS[name]}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
