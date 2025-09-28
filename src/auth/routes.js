// src/auth/routes.js
import { Router } from "express";
import crypto from "crypto";
import {CognitoIdentityProviderClient,InitiateAuthCommand,RespondToAuthChallengeCommand} from "@aws-sdk/client-cognito-identity-provider";
import { signUp, confirmSignUp } from "./cognito.js";

export const router = Router();
const client = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

function secretHash(username) {
  const hmac = crypto.createHmac("sha256", process.env.COGNITO_CLIENT_SECRET);
  hmac.update(username + process.env.COGNITO_CLIENT_ID);
  return hmac.digest("base64");
}

router.post("/register", async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password) return res.status(400).json({ error: "username, email, password required" });
  try {
    const out = await signUp(username, password, email);
    res.json({ userConfirmed: out.UserConfirmed === true });
  } catch (e) {
    res.status(400).json({ error: e.name || "SignUpFailed", message: e.message });
  }
});

router.post("/confirm", async (req, res) => {
  const { username, code } = req.body || {};
  if (!username || !code) return res.status(400).json({ error: "username, code required" });
  try {
    await confirmSignUp(username, code);
    res.status(204).end();
  } catch (e) {
    res.status(400).json({ error: e.name || "ConfirmFailed", message: e.message });
  }
});


router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username, password required" });

  const init = await client.send(new InitiateAuthCommand({
    ClientId: process.env.COGNITO_CLIENT_ID,
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: {
      USERNAME: username,
      PASSWORD: password,
      ...(process.env.COGNITO_CLIENT_SECRET ? { SECRET_HASH: secretHash(username) } : {})
    }
  }));

  if (init.ChallengeName === "SELECT_CHALLENGE") {
    const pick = await client.send(new RespondToAuthChallengeCommand({
      ClientId: process.env.COGNITO_CLIENT_ID,
      ChallengeName: "SELECT_CHALLENGE",
      Session: init.Session,
      ChallengeResponses: {
        USERNAME: username,
        ANSWER: "EMAIL_OTP",
        ...(process.env.COGNITO_CLIENT_SECRET ? { SECRET_HASH: secretHash(username) } : {})
      }
    }));
    return res.json({ challenge: "EMAIL_OTP", session: pick.Session });
  }

  if (init.ChallengeName === "EMAIL_OTP") {
    return res.json({ challenge: "EMAIL_OTP", session: init.Session });
  }

  const a = init.AuthenticationResult || {};
  return res.json({
    accessToken: a.AccessToken,
    idToken: a.IdToken,
    refreshToken: a.RefreshToken,
    tokenType: a.TokenType,
    expiresIn: a.ExpiresIn
  });
});

router.post("/login/mfa-email", async (req, res) => {
  const { username, code, session } = req.body || {};
  if (!username || !code || !session) return res.status(400).json({ error: "username, code, session required" });

  const out = await client.send(new RespondToAuthChallengeCommand({
    ClientId: process.env.COGNITO_CLIENT_ID,
    ChallengeName: "EMAIL_OTP",
    Session: session,
    ChallengeResponses: {
      USERNAME: username,
      EMAIL_OTP_CODE: code,
      ...(process.env.COGNITO_CLIENT_SECRET ? { SECRET_HASH: secretHash(username) } : {})
    }
  }));

  const a = out.AuthenticationResult || {};
  return res.json({
    accessToken: a.AccessToken,
    idToken: a.IdToken,
    refreshToken: a.RefreshToken,
    tokenType: a.TokenType,
    expiresIn: a.ExpiresIn
  });
});
