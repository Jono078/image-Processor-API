import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const sm = new SecretsManagerClient({
  region: process.env.AWS_REGION || "ap-southeast-2",
});

const cache = new Map();

export async function readSecret(secretId, { fallbackEnv, ttlMs = 5 * 60 * 1000 } = {}) {
  const now = Date.now();
  const cached = cache.get(secretId);
  if (cached && (ttlMs <= 0 || now - cached.t <= ttlMs)) return cached.v;

  try {
    const out = await sm.send(new GetSecretValueCommand({ SecretId: secretId }));
    const raw = out.SecretString ?? Buffer.from(out.SecretBinary || []).toString("utf8");
    const v = maybeJson(raw);
    console.log(`[Secret] ${secretId} fetched OK (redacted)`);
    cache.set(secretId, { v, t: now });
    return v;
  } catch (e) {
    const msg = e?.name ? `${e.name}: ${e.message}` : String(e);
    if (fallbackEnv && process.env[fallbackEnv]) {
      console.warn(`[Secret] ${secretId} failed (${msg}); using env ${fallbackEnv}`);
      const v = maybeJson(process.env[fallbackEnv]);
      cache.set(secretId, { v, t: now });
      return v;
    }
    console.error(`[Secret] ${secretId} failed: ${msg}`);
    throw e;
  }
}

function maybeJson(s) {
  const str = typeof s === "string" ? s.trim() : s;
  if (typeof str !== "string") return str;
  if ((str.startsWith("{") && str.endsWith("}")) || (str.startsWith("[") && str.endsWith("]"))) {
    try { return JSON.parse(str); } catch {}
  }
  return str;
}

