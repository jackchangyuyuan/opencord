import postgres from "postgres";

export const UNIQUE_VIOLATION = "23505";
export const FOREIGN_KEY_VIOLATION = "23503";

function driverError(error: unknown): postgres.PostgresError | null {
  if (error instanceof postgres.PostgresError) {
    return error;
  }

  const cause = error instanceof Error ? error.cause : undefined;

  return cause instanceof postgres.PostgresError ? cause : null;
}

export function isViolation(error: unknown, code: string): boolean {
  return driverError(error)?.code === code;
}

export function violatedConstraint(
  error: unknown,
  code: string,
): string | null {
  const driver = driverError(error);

  if (driver?.code !== code) {
    return null;
  }

  return driver.constraint_name ?? null;
}
