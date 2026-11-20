import { z } from "zod";

const positiveInteger = z.string().regex(/^[0-9]+$/).transform(Number)
  .pipe(z.number().int().min(1).max(2_147_483_647));

const environmentSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/, hostname: /.+/ }),
  DB_POOL_SIZE: positiveInteger.default(10),
  DB_POOL_WAIT_MS: positiveInteger.default(200),
  DB_STATEMENT_TIMEOUT_MS: positiveInteger.default(1000),
  OVERLOADED_RETRY_AFTER_SECONDS: positiveInteger.default(1),
  UNAVAILABLE_RETRY_AFTER_SECONDS: positiveInteger.default(5),
  HOST: z.string().trim().min(1).default("0.0.0.0"),
  PORT: z.string().regex(/^[0-9]+$/).transform(Number).pipe(z.number().int().min(1).max(65_535)).default(3000),
});

export interface Configuration {
  readonly databaseUrl: string;
  readonly poolSize: number;
  readonly poolWaitMs: number;
  readonly statementTimeoutMs: number;
  readonly retryAfterSeconds: Readonly<Record<"OVERLOADED" | "UNAVAILABLE", number>>;
  readonly host: string;
  readonly port: number;
}

export function readConfiguration(environment: NodeJS.ProcessEnv): Configuration {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment configuration: ${messages.join("; ")}`);
  }

  const { DATABASE_URL: databaseUrl, HOST: host, PORT: port } = parsed.data;
  return {
    databaseUrl, host, port,
    retryAfterSeconds: {
      OVERLOADED: parsed.data.OVERLOADED_RETRY_AFTER_SECONDS,
      UNAVAILABLE: parsed.data.UNAVAILABLE_RETRY_AFTER_SECONDS,
    },
    poolSize: parsed.data.DB_POOL_SIZE,
    poolWaitMs: parsed.data.DB_POOL_WAIT_MS,
    statementTimeoutMs: parsed.data.DB_STATEMENT_TIMEOUT_MS,
  };
}
