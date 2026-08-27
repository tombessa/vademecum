import { connectDatabase } from "../lib/postgres-connect.mjs";

const { client, config } = await connectDatabase();
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
