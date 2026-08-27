import {
  assertOfficialPlanaltoUrl,
  buildReflegisQuery,
  parseActReference,
} from "@/lib/planalto-reference.mjs";

export async function POST(request: Request) {
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

  return Response.json(
    {
      status: "LOCATING",
      reference,
      planaltoQuery: buildReflegisQuery(reference),
      sourceUrl,
      persisted: false,
    },
    { status: 202 },
  );
}
