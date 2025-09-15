import { verifyAccessToken, idVerifier } from "../auth/cognito.js";

export default async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "missing bearer token" });

    let payload;
    try {
      payload = await verifyAccessToken(token);
    } catch (e1) {
      try {
        payload = await idVerifier.verify(token);
      } catch (e2) {
        console.error("JWT verify failed:", e1?.name, e1?.message, "/", e2?.name, e2?.message);
        return res.status(401).json({ error: "invalid token", detail: e2?.name || e1?.name });
      }
    }

  req.user = {
    sub: payload.sub,
    username: payload.username || payload["cognito:username"] || ""
  };
    next();
  } catch (e) {
    console.error("Auth middleware error:", e);
    res.status(401).json({ error: "invalid token" });
  }
}
