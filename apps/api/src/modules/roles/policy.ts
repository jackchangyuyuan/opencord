import type { ServerContext } from "../../access/context.js";
import { forbidden } from "../../lib/errors.js";

export function actorPosition(context: ServerContext): number {
  if (context.server.ownerId === context.userId) {
    return Number.POSITIVE_INFINITY;
  }

  return context.memberRoles.reduce(
    (highest, role) => Math.max(highest, role.position),
    0,
  );
}

export function requireBelowActor(position: number, actor: number): void {
  if (position >= actor) {
    throw forbidden(
      "ROLE_HIERARCHY",
      "That role is at or above your highest role",
    );
  }
}

export function requireHeldPermissions(held: number, mask: number): void {
  if ((mask & ~held) !== 0) {
    throw forbidden(
      "PERMISSION_NOT_HELD",
      "You cannot grant a permission you do not hold",
    );
  }
}
