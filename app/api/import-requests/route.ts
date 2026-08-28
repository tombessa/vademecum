import { getChatGPTUser } from "@/app/chatgpt-auth";
import { withDatabaseClient } from "@/lib/postgres";
import {
  assertOfficialPlanaltoUrl,
  buildReflegisQuery,
  parseActReference,
} from "@/lib/planalto-reference.mjs";

export async function POST(request: Request) {
  const authenticatedUser = await getChatGPTUser();
  if (!authenticatedUser) {
    return Response.json({ error: "Autenticação necessária." }, { status: 401 });
  }

  let payload: { reference?: unknown; sourceUrl?: unknown };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Corpo da solicitação inválido." }, { status: 400 });
  }

  if (typeof payload.reference !== "string" || !payload.reference.trim()) {
    return Response.json({ error: "Informe a espécie, o número e o ano do ato." }, { status: 422 });
  }

  const reference = parseActReference(payload.reference);
  if (!reference) {
    return Response.json(
      { error: "Não foi possível identificar a norma. Use um formato como Lei 8.429/1992." },
      { status: 422 },
    );
  }

  let sourceUrl: string | null = null;
  if (payload.sourceUrl != null && payload.sourceUrl !== "") {
    if (typeof payload.sourceUrl !== "string") {
      return Response.json({ error: "A URL informada é inválida." }, { status: 422 });
    }
    try {
      sourceUrl = assertOfficialPlanaltoUrl(payload.sourceUrl).toString();
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Fonte oficial inválida." },
        { status: 422 },
      );
    }
  }

  try {
    const result = await withDatabaseClient(async (client) => {
      await client.query("BEGIN");
      try {
        const userResult = await client.query<{ id: string; role: string }>(
          `SELECT user_id AS id, user_role AS role
           FROM ensure_chatgpt_user($1::citext, $2)`,
          [authenticatedUser.email, authenticatedUser.displayName],
        );
        const user = userResult.rows[0];
        if (!user) throw new Error("Usuário não persistido.");

        await client.query(
          `SELECT set_config('app.current_user_id', $1, true),
                  set_config('app.current_user_role', $2, true)`,
          [user.id, user.role],
        );

        const importResult = await client.query<{ id: string; status: string }>(
          `INSERT INTO legislation_import_request (
             requested_by, raw_query, requested_act_type, requested_act_number,
             requested_act_year, provided_source_url, status
           ) VALUES ($1, $2, $3, $4, $5, $6, 'LOCATING')
           RETURNING id, status::text`,
          [
            user.id,
            payload.reference.trim(),
            reference.actType,
            reference.actNumber,
            reference.actYear,
            sourceUrl,
          ],
        );

        await client.query("COMMIT");
        return importResult.rows[0];
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });

    return Response.json(
      {
        id: result?.id,
        status: result?.status ?? "LOCATING",
        reference,
        planaltoQuery: buildReflegisQuery(reference),
        sourceUrl,
        persisted: true,
      },
      { status: 202 },
    );
  } catch (error) {
    const databaseCode =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : null;
    const message = databaseCode === "42883"
      ? "Atualização do banco pendente. Execute npm run db:migrate."
      : "Banco de dados indisponível. Tente novamente em instantes.";
    return Response.json(
      { error: message, code: databaseCode ? `DB_${databaseCode}` : null },
      { status: 503 },
    );
  }
}
