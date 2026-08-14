import { defineRelations } from "drizzle-orm";

import { authRelations } from "./schema/auth.js";
import * as schema from "./schema/index.js";

export const relations = { ...defineRelations(schema), ...authRelations };
