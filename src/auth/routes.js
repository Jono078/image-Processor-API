import {Router} from "express";
import jwt from "jsonwebtoken";

export const router = Router();

const USERS = [
    {id: "u1", username: "admin", password: "admin123", role: "admin"},
    {id: "u2", username: "user", password:"user123", role: "user"}
];

router.post("/login", (req, res) => {
    console.log("DEBUG /login body:", req.body);

    const {username, password} = req.body || {};
    const u = USERS.find(x => x.username === username && x.password === password);
    if (!u) return res.status(401).json({code: "AuthFailed", message: "Invalid credentials"});
    const token = jwt.sign({sub: u.id, role: u.role}, process.env.JWT_SECRET || "dev", {expiresIn: "2h"});
    res.json({token});
});

export function requireAuth(req, res, next){
    try {
        const h = req.headers.authorization || "";
        const t = h.startsWith("Bearer ") ? h.slice(7) : null;
        req.user = jwt.verify(t, process.env.JWT_SECRET || "dev");
        next()
    } catch {
        res.status(401).json({code: "Unauthorized", message: "Invalid or missing token"});
    }
}

export const requireRole = role => (req, res, next) =>
(req.user?.role === role) ? next() : res.status(403).json({code: "Forbidden", message: "Insufficient role"});