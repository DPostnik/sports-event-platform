import { z } from "zod";

const positiveInteger = z
  .string()
  .regex(/^[0-9]+$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(2_147_483_647));

const writerKeys = z
  .string()
  .default("{}")
  .transform((value, context): unknown => {
    try {
      return JSON.parse(value);
    } catch {
      context.addIssue({ code: "custom", message: "Expected a JSON object mapping key hashes to sources" });
      return z.NEVER;
    }
  })
  .pipe(z.record(z.string().regex(/^[0-9a-f]{64}$/), z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)));

const environmentSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/, hostname: /.+/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/, hostname: /.+/ }).optional(),
  DB_POOL_SIZE: positiveInteger.default(10),
  DB_POOL_WAIT_MS: positiveInteger.default(200),
  DB_STATEMENT_TIMEOUT_MS: positiveInteger.default(1000),
  OVERLOADED_RETRY_AFTER_SECONDS: positiveInteger.default(1),
  UNAVAILABLE_RETRY_AFTER_SECONDS: positiveInteger.default(5),
  WRITER_KEYS: writerKeys,
  HOST: z.string().trim().min(1).default("0.0.0.0"),
  PORT: z
    .string()
    .regex(/^[0-9]+$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(65_535))
    .default(3000),
});

export interface Configuration {
  readonly databaseUrl: string;
  readonly redisUrl: string | undefined;
  readonly poolSize: number;
  readonly poolWaitMs: number;
  readonly statementTimeoutMs: number;
  readonly retryAfterSeconds: Readonly<Record<"OVERLOADED" | "UNAVAILABLE", number>>;
  readonly writerKeys: ReadonlyMap<string, string>;
  readonly host: string;
  readonly port: number;
}

export function readConfiguration(environment: NodeJS.ProcessEnv): Configuration {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    const messages = new Set(
      parsed.error.issues.map((issue) =>
        issue.path[0] === "WRITER_KEYS"
          ? "WRITER_KEYS: Expected a JSON object mapping lowercase SHA-256 key hashes to valid sources"
          : `${issue.path.join(".")}: ${issue.message}`,
      ),
    );
    throw new Error(`Invalid environment configuration: ${[...messages].join("; ")}`);
  }

  const { DATABASE_URL: databaseUrl, HOST: host, PORT: port } = parsed.data;
  return {
    databaseUrl,
    host,
    port,
    writerKeys: new Map(Object.entries(parsed.data.WRITER_KEYS)),
    retryAfterSeconds: {
      OVERLOADED: parsed.data.OVERLOADED_RETRY_AFTER_SECONDS,
      UNAVAILABLE: parsed.data.UNAVAILABLE_RETRY_AFTER_SECONDS,
    },
    redisUrl: parsed.data.REDIS_URL,
    poolSize: parsed.data.DB_POOL_SIZE,
    poolWaitMs: parsed.data.DB_POOL_WAIT_MS,
    statementTimeoutMs: parsed.data.DB_STATEMENT_TIMEOUT_MS,
  };
}
