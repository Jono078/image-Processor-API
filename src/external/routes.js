import { Router } from "express";
import { readSecret } from "../config/secret.js"

export const router = Router();

router.get("/external/ping", async (req, res) => {
  const before = process.env.EXTERNAL_API_KEY;
  let source = "env";
  try {
    const v = await readSecret(
      process.env.SECRET_ID_OVERRIDE || "a2/a2group27/external-api-key",
      { fallbackEnv: "EXTERNAL_API_KEY" }
    );
    source = before && v === before ? "env" : "secrets-manager";
  } catch {
    source = "env";
  }
  res.set("X-Secret-Source", source);
  res.json({ ok: true, source });
});
