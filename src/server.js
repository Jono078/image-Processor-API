import { Router } from "express";
export const router = Router();
import express from "express";
import dotenv from "dotenv";
import pino from "pino";
import {router as auth} from "./auth/routes.js";
import {router as files} from "./files/routes.js";
import {router as jobs} from "./jobs/routes.js";
import requireAuth from "./middleware/requireAuth.js"; 
import 'dotenv/config';

dotenv.config();
const app = express();
const log = pino();

app.use(express.json());

//health
app.get("/v1/healthz", (req, res) => res.json({ok:true}));

// routes
app.use("/v1/auth", auth);
app.use("/v1/files", requireAuth, files);
app.use("/v1/jobs", requireAuth, jobs);


//error handling 
app.use((err, req, res, next) => {
    log.error(err);
    res.status(err.status || 500).json({ code: "InternalError", message: err.message});
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`API listening on :${port}`));