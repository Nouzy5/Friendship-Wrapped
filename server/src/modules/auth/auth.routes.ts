import { Router } from "express";
import { rateLimit } from "../../middleware/rate-limit.js";
import { getSession, login, logout, register } from "./auth.controller.js";

// Brute-force protection: limits guesses against any single account from one address.
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  key: (req) => {
    const username: unknown = req.body?.username;
    return `${req.ip}|${typeof username === "string" ? username.trim().toLowerCase() : ""}`;
  },
  message: "Too many login attempts. Please wait a few minutes and try again.",
});

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/login", loginRateLimit, login);
authRouter.post("/logout", logout);
authRouter.get("/session", getSession);
