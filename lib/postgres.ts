import type { ClientBase } from "pg";

import { connectDatabase } from "@/lib/postgres-connect.mjs";
import { isDatabaseConfigured } from "@/lib/postgres-config.mjs";

export { isDatabaseConfigured };

export async function withDatabaseClient<T>(
  operation: (client: ClientBase) => Promise<T>,
): Promise<T> {
  const { client, config } = await connectDatabase();
  try {
    await client.query(`SET search_path TO "${config.schema}", public`);
    return await operation(client);
  } finally {
    await client.end();
  }
}
