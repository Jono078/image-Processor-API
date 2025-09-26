import { readSecret } from "./secret.js";

const SECRET_ID =
  process.env.SECRET_ID_OVERRIDE || "a2/a2group27/external-api-key";

export async function readSecretWithSource() {
  const before = process.env.EXTERNAL_API_KEY;
  try {
    const v = await readSecret(SECRET_ID, { fallbackEnv: "EXTERNAL_API_KEY" });
    const source = before && v === before ? "env" : "secrets-manager";
    return { value: v, source };
  } catch {
    return { value: before, source: "env" };
  }
}
