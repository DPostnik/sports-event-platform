import fastify from "fastify";
import { expect } from "vitest";
import { z } from "zod";

const responseSchema = z.object({
  content: z.record(z.string(), z.object({ schema: z.record(z.string(), z.unknown()) })).optional(),
});
const operationSchema = z.object({
  responses: z.record(z.string(), responseSchema),
});

export const openApiSchema = z.object({
  openapi: z.string().startsWith("3.1."),
  paths: z.record(z.string(), z.record(z.string(), operationSchema)),
  components: z.record(z.string(), z.unknown()).default({}),
});

export type OpenApi = z.infer<typeof openApiSchema>;

export async function expectDocumentedResponse(
  document: OpenApi,
  method: string,
  path: string,
  response: { statusCode: number; headers: Record<string, unknown>; body: string },
): Promise<void> {
  const contentType = String(response.headers["content-type"]).split(";")[0]?.trim() ?? "";
  const schema = document.paths[path]?.[method.toLowerCase()]?.responses[response.statusCode]
    ?.content?.[contentType]?.schema;
  if (schema === undefined) {
    throw new Error(`OpenAPI is missing ${method} ${path} ${String(response.statusCode)} ${contentType}`);
  }

  // Validate the served schema independently of the Zod response serializer.
  // The response schemas use keywords shared by JSON Schema 2020-12 and draft 7.
  const validator = fastify({
    ajv: { customOptions: { strictSchema: false, coerceTypes: false, useDefaults: false, removeAdditional: false } },
  });
  validator.post("/", { schema: { body: { ...schema, components: document.components } } },
    (_request, reply) => reply.code(204).send(),
  );

  try {
    const result = await validator.inject({
      method: "POST",
      url: "/",
      headers: { "content-type": "application/json" },
      payload: response.body,
    });
    expect(result.statusCode, result.body).toBe(204);
  } finally {
    await validator.close();
  }
}
