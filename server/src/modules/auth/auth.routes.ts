import { Router } from "express";
import { env } from "../../config/env.js";
import { rateLimit } from "../../middleware/rate-limit.js";
import { requireSession } from "./auth.middleware.js";
import {
  changeEmail,
  getSession,
  login,
  logout,
  register,
  resendVerificationEmail,
  verifyEmail,
} from "./auth.controller.js";

// Brute-force protection: limits guesses against any single account from one address.
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  key: (req) => {
    const identifier: unknown = req.body?.identifier ?? req.body?.username;
    // Read before validation, so capped: a 100 KB "username" mustn't become a 100 KB key.
    return `${req.ip}|${typeof identifier === "string" ? identifier.trim().toLowerCase().slice(0, 64) : ""}`;
  },
  message: "Too many login attempts. Please wait a few minutes and try again.",
});

// Every sign-up sends an email, so someone must not be able to use it to flood an inbox with them.
const registerRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.SIGNUP_LIMIT_PER_HOUR ?? 30,
  key: (req) => req.ip ?? "",
  message: "Too many accounts were created from here. Please try again in an hour.",
});

// A link is unguessable (256 random bits); this only keeps a script from hammering the database.
const verifyEmailRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  key: (req) => req.ip ?? "",
  message: "Too many attempts. Please wait a few minutes and try again.",
});

const resendRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  key: (req) => req.user?.id ?? req.ip ?? "",
  message: "Too many attempts. Please wait a few minutes and try again.",
});

// Each change sends a link to a new address, and asks for the password: fewer than a resend.
const changeEmailRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 4,
  key: (req) => req.user?.id ?? req.ip ?? "",
  message: "Too many attempts. Please wait a few minutes and try again.",
});

export const authRouter = Router();

authRouter.post("/register", registerRateLimit, register);
authRouter.post("/login", loginRateLimit, login);
authRouter.post("/logout", logout);
authRouter.get("/session", getSession);
authRouter.post("/verify-email", verifyEmailRateLimit, verifyEmail);
// These two work before the email is verified: verifying it is what they're for.
authRouter.post("/email/resend", requireSession, resendRateLimit, resendVerificationEmail);
authRouter.put("/email", requireSession, changeEmailRateLimit, changeEmail);
