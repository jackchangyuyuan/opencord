declare module "eslint-plugin-drizzle" {
  import type { ESLint, Linter } from "eslint";

  export const rules: NonNullable<ESLint.Plugin["rules"]>;
  export const configs: Record<"all" | "recommended", Linter.LegacyConfig>;
  export const meta: NonNullable<ESLint.Plugin["meta"]>;
}
