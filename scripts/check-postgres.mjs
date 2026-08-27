import { Client } from "pg";

import { parseDatabaseConfig } from "../lib/postgres-config.mjs";

const config = parseDatabaseConfig();
const client = new Client({
  connectionString: config.connectionString,
  connectionTimeoutMillis: 7_000,
  ssl: config.ssl,
});

await client.connect();
try {
  await client.query(`SET search_path TO "${config.schema}", public`);
  const result = await client.query(
    `SELECT current_database() AS database_name,
            current_user AS database_user,
            current_schema() AS schema_name`,
  );
  console.log(JSON.stringify(result.rows[0]));
} finally {
  await client.end();
}
