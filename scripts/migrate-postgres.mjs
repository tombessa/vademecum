import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";

import { parseDatabaseConfig } from "../lib/postgres-config.mjs";

const config = parseDatabaseConfig();
const sql = await readFile(resolve("database/migrations/0001_initial.sql"), "utf8");
const client = new Client({
  connectionString: config.connectionString,
  connectionTimeoutMillis: 10_000,
  ssl: config.ssl,
});

await client.connect();
try {
  await client.query(sql);
  console.log(`Migração aplicada no schema ${config.schema}.`);
} finally {
  await client.end();
}
