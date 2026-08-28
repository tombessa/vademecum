import { getChatGPTUser } from "@/app/chatgpt-auth";
import { withDatabaseClient } from "@/lib/postgres";
import { buildPlanaltoCandidates } from "@/lib/planalto-reference.mjs";

type PendingRequest = { id: string; raw_query: string; act_type: string; act_number: string; act_year: number; provided_source_url: string | null };

export async function POST() {
  const authenticatedUser = await getChatGPTUser();
  if (!authenticatedUser) return Response.json({ error: "Autenticação necessária." }, { status: 401 });

  try {
    const processed = await withDatabaseClient(async (client) => {
      await client.query("BEGIN");
      try {
        const userResult = await client.query<{ id: string; role: string }>(
          "SELECT user_id AS id, user_role AS role FROM ensure_chatgpt_user($1::citext, $2)",
          [authenticatedUser.email, authenticatedUser.displayName],
        );
        const user = userResult.rows[0];
        if (!user) throw new Error("Usuário não persistido.");
        await client.query("SELECT set_config('app.current_user_id', $1, true), set_config('app.current_user_role', $2, true)", [user.id, user.role]);
        const pending = await client.query<PendingRequest>(
          `SELECT id, raw_query, requested_act_type AS act_type, requested_act_number AS act_number,
                  requested_act_year AS act_year, provided_source_url
             FROM legislation_import_request
            WHERE requested_by = $1 AND status IN ('REQUESTED', 'LOCATING')
            ORDER BY created_at ASC FOR UPDATE`, [user.id],
        );
        const results = [];
        for (const request of pending.rows) {
          const candidates = request.provided_source_url ? [request.provided_source_url] : buildPlanaltoCandidates({ actType: request.act_type, actNumber: request.act_number, actYear: request.act_year });
          for (const url of candidates) {
            await client.query(
              `INSERT INTO legislation_import_candidate (request_id, act_type, act_number, act_year, title, source_url, confidence, is_selected)
               VALUES ($1, $2, $3, $4, $5, $6, $7, true)
               ON CONFLICT DO NOTHING`,
              [request.id, request.act_type, request.act_number, request.act_year, request.raw_query, url, request.provided_source_url ? 1 : 0.8],
            );
          }
          await client.query("UPDATE legislation_import_request SET status = $2 WHERE id = $1", [request.id, candidates.length ? "FOUND" : "AWAITING_CHOICE"]);
          results.push({ id: request.id, reference: request.raw_query, status: candidates.length ? "FOUND" : "AWAITING_CHOICE", candidates });
        }
        await client.query("COMMIT");
        return results;
      } catch (error) { await client.query("ROLLBACK"); throw error; }
    });
    return Response.json({ processed, count: processed.length });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : null;
    return Response.json({ error: code === "42883" ? "Atualização do banco pendente. Execute npm run db:migrate." : "Não foi possível processar a fila agora.", code }, { status: 503 });
  }
}
