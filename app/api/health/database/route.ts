import { isDatabaseConfigured, withDatabaseClient } from "@/lib/postgres";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return Response.json({ status: "not_configured" }, { status: 503 });
  }

  try {
    const result = await withDatabaseClient((client) =>
      client.query<{
        database_name: string;
        schema_name: string;
        app_user_table: string | null;
      }>(
        `SELECT current_database() AS database_name,
                current_schema() AS schema_name,
                to_regclass('vademecum.app_user')::text AS app_user_table`,
      ),
    );
    const database = result.rows[0];

    if (!database?.app_user_table) {
      return Response.json(
        {
          status: "migration_required",
          database: database?.database_name ?? null,
          schema: database?.schema_name ?? null,
        },
        { status: 503 },
      );
    }

    return Response.json({
      status: "available",
      database: database.database_name,
      schema: database.schema_name,
    });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
