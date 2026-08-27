const SCHEMA_PATTERN = /^[a-z_][a-z0-9_]*$/;
const SSL_MODES = new Set(["disable", "prefer", "require", "verify-full"]);

export function parseDatabaseConfig(environment = process.env) {
  const rawUrl = environment.DATABASE_URL?.trim();
  if (!rawUrl) {
    throw new Error("DATABASE_URL não configurada.");
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("DATABASE_URL inválida.");
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DATABASE_URL deve usar o protocolo PostgreSQL.");
  }

  // `schema` não é parâmetro nativo do node-postgres. O schema é aplicado
  // explicitamente ao abrir cada conexão.
  url.searchParams.delete("schema");

  const schema = environment.DATABASE_SCHEMA?.trim() || "vademecum";
  if (!SCHEMA_PATTERN.test(schema)) {
    throw new Error("DATABASE_SCHEMA inválido.");
  }

  const sslMode = environment.DATABASE_SSL_MODE?.trim() ||
    (environment.NODE_ENV === "production" ? "require" : "disable");
  if (!SSL_MODES.has(sslMode)) {
    throw new Error("DATABASE_SSL_MODE inválido.");
  }

  const ca = environment.DATABASE_CA_CERT?.replaceAll("\\n", "\n");
  if (sslMode === "verify-full" && !ca) {
    throw new Error("DATABASE_CA_CERT é obrigatório com verify-full.");
  }

  return {
    connectionString: url.toString(),
    schema,
    sslMode,
    ssl:
      sslMode === "disable"
        ? false
        : {
            rejectUnauthorized: sslMode === "verify-full",
            ...(ca ? { ca } : {}),
          },
  };
}

export function isDatabaseConfigured(environment = process.env) {
  return Boolean(environment.DATABASE_URL?.trim());
}
