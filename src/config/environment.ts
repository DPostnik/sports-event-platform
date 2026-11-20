import { z } from "zod";

const environmentSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(?:ql)?$/, hostname: /.+/ }),
  HOST: z.string().trim().min(1).default("0.0.0.0"),
  PORT: z.string().regex(/^[0-9]+$/).transform(Number).pipe(z.number().int().min(1).max(65_535)).default(3000),
});

export interface Configuration {
  readonly databaseUrl: string;
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
  return { databaseUrl, host, port };
}
