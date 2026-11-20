import { createHash, randomBytes } from "node:crypto";

function testWriter(source: string) {
  const key = randomBytes(32).toString("base64url");
  return {
    source,
    hash: createHash("sha256").update(key).digest("hex"),
    headers: { authorization: `Bearer ${key}` },
  };
}

export const apiWriter = testWriter("api-test");
export const manualWriter = testWriter("manual");
export const writerKeyEnvironment = JSON.stringify({
  [apiWriter.hash]: apiWriter.source,
  [manualWriter.hash]: manualWriter.source,
});
