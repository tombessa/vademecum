import pg from "pg";

import { parseDatabaseConfig } from "./postgres-config.mjs";

const { Client } = pg;
const SSL_NOT_SUPPORTED = "The server does not support SSL connections";

export async function connectDatabase(environment = process.env) {
  const config = parseDatabaseConfig(environment);
  const sslAttempts = config.sslMode === "prefer"
    ? [config.ssl, false]
    : [config.ssl];

  for (let attempt = 0; attempt < sslAttempts.length; attempt += 1) {
    const client = new Client({
      connectionString: config.connectionString,
      connectionTimeoutMillis: 7_000,
      query_timeout: 15_000,
      statement_timeout: 15_000,
      keepAlive: false,
      ssl: sslAttempts[attempt],
    });

    try {
      await client.connect();
      return { client, config };
    } catch (error) {
      await client.end().catch(() => undefined);
      const mayFallback =
        config.sslMode === "prefer" &&
        attempt === 0 &&
        error instanceof Error &&
        error.message === SSL_NOT_SUPPORTED;
      if (!mayFallback) throw error;
    }
  }

  throw new Error("Não foi possível conectar ao PostgreSQL.");
}
