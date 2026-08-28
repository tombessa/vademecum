import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { connectDatabase } from "../lib/postgres-connect.mjs";

const { client, config } = await connectDatabase();
try {
  await client.query(`CREATE TABLE IF NOT EXISTS ${config.schema}.schema_migration (
    filename text PRIMARY KEY,
    sha256 char(64) NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const files = (await readdir(resolve("database/migrations")))
    .filter((filename) => /^\d+_.+\.sql$/.test(filename))
    .sort();
  const applied = await client.query(
    `SELECT filename FROM ${config.schema}.schema_migration`,
  );
  const appliedFiles = new Set(applied.rows.map((row) => row.filename));

  for (const filename of files) {
    if (appliedFiles.has(filename)) continue;

    const sql = await readFile(resolve("database/migrations", filename), "utf8");
    const sha256 = createHash("sha256").update(sql).digest("hex");
    if (filename === "0001_initial.sql") {
      const existing = await client.query(
        `SELECT to_regclass('${config.schema}.app_user')::text AS app_user`,
      );
      if (existing.rows[0]?.app_user) {
        await client.query(
          `INSERT INTO ${config.schema}.schema_migration (filename, sha256)
           VALUES ($1, $2)`,
          [filename, sha256],
        );
        console.log(`Base existente registrada: ${filename}.`);
        continue;
      }
    }

    await client.query(sql);
    await client.query(
      `INSERT INTO ${config.schema}.schema_migration (filename, sha256)
       VALUES ($1, $2)`,
      [filename, sha256],
    );
    console.log(`Migração aplicada: ${filename}.`);
  }
} finally {
  await client.end();
}
