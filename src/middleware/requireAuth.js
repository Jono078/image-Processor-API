import { Router } from "express";
import {
  CognitoIdentityProviderClient,
  AssociateSoftwareTokenCommand,
  VerifySoftwareTokenCommand,
  SetUserMFAPreferenceCommand
} from "@aws-sdk/client-cognito-identity-provider";

const router = Router();
const client = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

function requireAccessToken(req, res, next) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ") || h.length <= 7) {
    return res.status(401).json({ error: "missing bearer token" });
  }
  req.accessToken = h.slice(7);
  next();
}

router.post("/mfa/setup", requireAccessToken, async (req, res) => {
  const out = await client.send(new AssociateSoftwareTokenCommand({ AccessToken: req.accessToken }));
  const secret = out.SecretCode;
  const issuer = encodeURIComponent(process.env.COGNITO_USER_POOL_NAME || "CAB432App");
  const label = encodeURIComponent("user"); // optional: swap in req.user?.username if you later attach it
  const otpauth = `otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
  res.json({ secret, otpauth });
});

router.post("/mfa/verify", requireAccessToken, async (req, res) => {
  const { code } = req.body || {};
  const v = await client.send(new VerifySoftwareTokenCommand({
    AccessToken: req.accessToken,
    UserCode: code,
    FriendlyDeviceName: "auth-app"
  }));
  if (v.Status !== "SUCCESS") return res.status(400).json({ ok: false });

  await client.send(new SetUserMFAPreferenceCommand({
    AccessToken: req.accessToken,
    SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true }
  }));
  res.json({ ok: true });
});

export default router;
