import express from "express";
import dotenv from "dotenv";
import pino from "pino";
import {router as auth} from "./auth/routes.js";
import {router as files} from "./files/routes.js";
import {router as jobs} from "./jobs/routes.js";
import requireAuth from "./middleware/requireAuth.js"; 
import 'dotenv/config';
import adminRoutes from "./admin/routes.js";
import requireGroup from "./middleware/requireGroup.js";
import { readParam } from "./config/ssm.js";
import { readSecret } from "./config/secret.js";
import { router as external } from "./external/routes.js";

dotenv.config();
const app = express();
const log = pino();

app.use(express.json());

app.get("/v1/external/ping", async (req, res) => {
  const secretId =
    process.env.SECRET_ID_OVERRIDE || "a2/a2group27/external-api-key";

  const before = process.env.EXTERNAL_API_KEY;

  let source = "env";
  try {
    const v = await readSecret(secretId, { fallbackEnv: "EXTERNAL_API_KEY" });
    source = before && v === before ? "env" : "secrets-manager";
  } catch {
    source = "env";
  }

  res.set("X-Secret-Source", source);
  res.json({ ok: true, source });
});

//health
app.get("/v1/healthz", (req, res) => res.json({ok:true}));
app.get("/v1/debug/seen-groups", requireAuth, (req, res) => {
  const claims = req.user || req.auth || req.claims || {};
  const raw =
    claims["cognito:groups"] ?? claims.groups ?? claims.cognitoGroups ?? claims["custom:groups"] ?? null;
  const asArray = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
    ? raw.split(/[,\s]+/).filter(Boolean)
    : [];

  res.json({ username: claims["cognito:username"] || claims.username, rawGroups: raw, groups: asArray });
  });
  app.get('/healthz', (req, res) => {
  res.status(200).type('text/plain').send('api-ok');
});

app.get("/v1/configz", (req, res) => {
  res.json({
    API_BASE_present: !!process.env.API_BASE,
    FRONTEND_URL_present: !!process.env.FRONTEND_URL
  });
});

app.get("/v1/configz/secret", async (req, res) => {
  try {
    const s = await readSecret("a2/a2group27/external-api-key", { fallbackEnv: "EXTERNAL_API_KEY" });
    const isObject = s && typeof s === "object";
    res.json({
      ok: true,
      type: isObject ? "json" : "string",
      keys: isObject ? Object.keys(s).slice(0, 10) : [],
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: "SecretUnavailable", message: e?.message || String(e) });
  }
});

// routes
app.use("/v1/auth", auth);
app.use("/v1/files", requireAuth, files);
app.use("/v1/jobs", requireAuth, jobs);
app.use("/v1/admin", requireAuth, requireGroup("Admin"), adminRoutes);
app.use("/v1", external);


//error handling 
app.use((err, req, res, next) => {
    log.error(err);
    res.status(err.status || 500).json({ code: "InternalError", message: err.message});
});

(async () => {
  const team = "a2group27";
  process.env.API_BASE = await readParam(`/a2/${team}/API_BASE`, { fallbackEnv: "API_BASE" });
  process.env.FRONTEND_URL = await readParam(`/a2/${team}/FRONTEND_URL`, { fallbackEnv: "FRONTEND_URL" });
})().catch(err => {
  console.error("Config bootstrap failed:", err?.message || err);
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`API listening on :${port}`));