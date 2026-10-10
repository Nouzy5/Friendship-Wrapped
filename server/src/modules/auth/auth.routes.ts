import { Router } from "express";
import { env } from "../../config/env.js";
import { rateLimit } from "../../middleware/rate-limit.js";
import { requireSession } from "./auth.middleware.js";
import {
  changeEmail,
  checkPasswordResetLink,
  forgotPassword,
  getSession,
  login,
  logout,
  register,
  resendVerificationEmail,
  resetPassword,
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

// Every request can send an email to someone else's address: bound how many one address can ask for.
const forgotPasswordIpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  key: (req) => req.ip ?? "",
  message: "Too many attempts. Please wait a few minutes and try again.",
});

// ...and how many can be asked for one person, from anywhere. It counts every attempt, whether or not
// the name is an account, so being turned away says nothing about who has one.
const forgotPasswordNameRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  key: (req) => {
    const identifier: unknown = req.body?.identifier;
    const name = typeof identifier === "string" ? identifier.trim().toLowerCase().slice(0, 64) : "";
    // Read before validation, so capped. A request with no name at all (it'll be turned away as invalid) must not share one budget with every other.
    return name ? `name:${name}` : `ip:${req.ip ?? ""}`;
  },
  message: "Too many attempts. Please wait a while and try again.",
});

// A link is unguessable (256 random bits); this only keeps a script from hammering the database.
const resetLinkRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  key: (req) => req.ip ?? "",
  message: "Too many attempts. Please wait a few minutes and try again.",
});

export const authRouter = Router();

authRouter.post("/register", registerRateLimit, register);
authRouter.post("/login", loginRateLimit, login);
authRouter.post("/logout", logout);
authRouter.get("/session", getSession);
// For someone who can't sign in: no session needed, and they work whether or not the email is confirmed.
authRouter.post("/forgot-password", forgotPasswordIpRateLimit, forgotPasswordNameRateLimit, forgotPassword);
authRouter.post("/reset-password/check", resetLinkRateLimit, checkPasswordResetLink);
authRouter.post("/reset-password", resetLinkRateLimit, resetPassword);
authRouter.post("/verify-email", verifyEmailRateLimit, verifyEmail);
// These two work before the email is verified: verifying it is what they're for.
authRouter.post("/email/resend", requireSession, resendRateLimit, resendVerificationEmail);
authRouter.put("/email", requireSession, changeEmailRateLimit, changeEmail);
