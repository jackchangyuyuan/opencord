import { type PermissionName, Permissions } from "@opencord/shared/permissions";

import { Switch } from "@/components/ui/switch";
import {
  PERMISSION_LABELS,
  permissionBlurb,
  ROLE_PERMISSION_GROUPS,
  toggleBit,
  UNGROUPED_PERMISSIONS,
} from "@/features/roles/lib/permissions";
import { cn } from "@/lib/cn";

function PermissionSwitch({
  disabled,
  heldByActor,
  name,
  onChange,
  value,
}: {
  disabled: boolean;
  heldByActor: number;
  name: PermissionName;
  onChange: (next: number) => void;
  value: number;
}) {
  const bit = Permissions[name];
  const held = (heldByActor & bit) === bit;
  const locked = disabled || !held;
  const blurb = permissionBlurb(name);

  return (
    <li className="flex min-w-0 items-start gap-3">
      <Switch
        aria-label={PERMISSION_LABELS[name]}
        checked={(value & bit) === bit}
        className="mt-0.5 shrink-0"
        disabled={locked}
        onCheckedChange={(next) => {
          if (locked) {
            return;
          }

          onChange(toggleBit(value, bit, next));
        }}
      />
      <span className="flex min-w-0 flex-col">
        <span className={cn("text-sm", locked && "text-muted-foreground")}>
          {PERMISSION_LABELS[name]}
        </span>
        {blurb === undefined ? null : (
          <span className="text-xs leading-snug text-muted-foreground">
            {blurb}
          </span>
        )}
      </span>
    </li>
  );
}

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
  const groups =
    UNGROUPED_PERMISSIONS.length === 0
      ? ROLE_PERMISSION_GROUPS
      : [
          ...ROLE_PERMISSION_GROUPS,
          { title: "Other", names: UNGROUPED_PERMISSIONS },
        ];

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section className="flex min-w-0 flex-col gap-2" key={group.title}>
          <div className="flex flex-col gap-0.5">
            <h4 className="text-micro font-medium tracking-[0.08em] text-muted-foreground uppercase">
              {group.title}
            </h4>
            {group.description === undefined ? null : (
              <p className="text-xs text-muted-foreground">
                {group.description}
              </p>
            )}
          </div>
          <ul className="grid gap-x-8 gap-y-2 md:grid-cols-2">
            {group.names.map((name) => (
              <PermissionSwitch
                disabled={disabled}
                heldByActor={heldByActor}
                key={name}
                name={name}
                onChange={onChange}
                value={value}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
