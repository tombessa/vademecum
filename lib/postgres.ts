import { Client, type ClientBase } from "pg";

import {
  isDatabaseConfigured,
  parseDatabaseConfig,
} from "@/lib/postgres-config.mjs";

export { isDatabaseConfigured };

export async function withDatabaseClient<T>(
  operation: (client: ClientBase) => Promise<T>,
): Promise<T> {
  const config = parseDatabaseConfig();
  const client = new Client({
    connectionString: config.connectionString,
    connectionTimeoutMillis: 7_000,
    query_timeout: 15_000,
    statement_timeout: 15_000,
    keepAlive: false,
    ssl: config.ssl,
  });

  await client.connect();
  try {
    await client.query(`SET search_path TO "${config.schema}", public`);
    return await operation(client);
  } finally {
    await client.end();
  }
}
