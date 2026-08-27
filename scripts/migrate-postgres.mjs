import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { connectDatabase } from "../lib/postgres-connect.mjs";

const sql = await readFile(resolve("database/migrations/0001_initial.sql"), "utf8");
const { client, config } = await connectDatabase();
try {
  await client.query(sql);
  console.log(`Migração aplicada no schema ${config.schema}.`);
} finally {
  await client.end();
}
