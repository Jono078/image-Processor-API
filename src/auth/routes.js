import { Router } from "express";
import { signUp, confirmSignUp, login } from "./cognito.js";

export const router = Router();

router.post("/register", async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password) {
    return res.status(400).json({ error: "username, email, password required" });
  }
  try {
    const out = await signUp(username, password, email);
    res.json({ userConfirmed: out.UserConfirmed === true });
  } catch (e) {
    res.status(400).json({ error: e.name || "SignUpFailed", message: e.message });
  }
});

router.post("/confirm", async (req, res) => {
  const { username, code } = req.body || {};
  if (!username || !code) {
    return res.status(400).json({ error: "username, code required" });
  }
  try {
    await confirmSignUp(username, code);
    res.status(204).end();
  } catch (e) {
    res.status(400).json({ error: e.name || "ConfirmFailed", message: e.message });
  }
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "username, password required" });
  }
  try {
    const r = await login(username, password);
    const a = r.AuthenticationResult || {};
    res.json({
      accessToken: a.AccessToken,
      idToken: a.IdToken,
      refreshToken: a.RefreshToken,
      tokenType: a.TokenType,
      expiresIn: a.ExpiresIn
    });
  } catch (e) {
    res.status(400).json({ error: e.name || "LoginFailed", message: e.message });
  }
});
