import { Router } from "express";
const router = Router();

function decodeJwtNoVerify(token) {
  try {
    const part = token.split(".")[1];
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "===".slice((b64.length + 3) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch { return {}; }
}

function groupsFromClaims(claims = {}) {
  const candidates = [
    claims["cognito:groups"],
    claims.groups,
    claims.cognitoGroups,
    claims["custom:groups"],
  ];
  const toArr = v => Array.isArray(v) ? v : (typeof v === "string" ? v.split(/[,\s]+/).filter(Boolean) : []);
  return [...new Set(candidates.flatMap(toArr))];
}

router.get("/ping", (req, res) => {
  const claims = req.user || {};
  let groups = groupsFromClaims(claims);
  if (!groups.length) {
    const h = req.headers.authorization || "";
    const jwt = h.startsWith("Bearer ") ? h.slice(7) : "";
    groups = groupsFromClaims(decodeJwtNoVerify(jwt));
  }
  res.json({
    ok: true,
    youAre: claims["cognito:username"] || claims.username,
    groups
  });
});

export default router;
