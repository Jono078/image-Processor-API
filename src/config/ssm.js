import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const ssm = new SSMClient({ region: process.env.AWS_REGION || "ap-southeast-2" });
const cache = new Map();

export async function readParam(name, { withDecryption = false, fallbackEnv } = {}) {
  if (cache.has(name)) return cache.get(name);
  try {
    const out = await ssm.send(new GetParameterCommand({ Name: name, WithDecryption: withDecryption }));
    const p = out.Parameter || {};
    console.log(`[SSM] ${name} version=${p.Version}`);
    cache.set(name, p.Value);
    return p.Value;
  } catch (e) {
    if (fallbackEnv && process.env[fallbackEnv]) {
      console.warn(`[SSM] ${name} not found; using env ${fallbackEnv}`);
      const v = process.env[fallbackEnv];
      cache.set(name, v);
      return v;
    }
    throw e;
  }
}
