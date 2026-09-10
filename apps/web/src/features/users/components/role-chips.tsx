import { type PublicRole, roleColor } from "@/features/roles/api/queries";

export function RoleChips({ roles }: { roles: readonly PublicRole[] }) {
  if (roles.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5 border-t pt-2.5">
      <h3 className="text-micro font-semibold tracking-[0.1em] text-muted-foreground uppercase">
        {roles.length === 1 ? "Role" : "Roles"}
      </h3>
      <ul className="flex flex-wrap gap-1">
        {roles.map((role) => {
          const color = roleColor(role);

          return (
            <li
              className="flex max-w-full items-center gap-1.5 rounded-full border bg-muted/40 py-0.5 pr-2 pl-1.5 text-micro"
              key={role.id}
              style={
                color === undefined
                  ? undefined
                  : {
                      borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
                    }
              }
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full bg-muted-foreground"
                style={
                  color === undefined ? undefined : { backgroundColor: color }
                }
              />
              <span className="truncate">{role.name}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
