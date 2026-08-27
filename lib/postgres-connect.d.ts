import type { Client } from "pg";

import type { DatabaseConfig, DatabaseEnvironment } from "./postgres-config.mjs";

export function connectDatabase(
  environment?: DatabaseEnvironment,
): Promise<{ client: Client; config: DatabaseConfig }>;
