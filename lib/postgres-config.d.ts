export type DatabaseEnvironment = Record<string, string | undefined>;

export type DatabaseConfig = {
  connectionString: string;
  schema: string;
  ssl: false | { rejectUnauthorized: boolean; ca?: string };
};

export function parseDatabaseConfig(environment?: DatabaseEnvironment): DatabaseConfig;
export function isDatabaseConfigured(environment?: DatabaseEnvironment): boolean;
