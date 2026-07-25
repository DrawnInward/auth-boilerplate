import rateLimit, { RateLimitRequestHandler } from "express-rate-limit";
import { RequestHandler } from "express";

interface RateLimitConfig {
  windowMs: number;
  max: number;
  message: string;
}

const isTestEnv = process.env.NODE_ENV === "test";

const RATE_LIMITS = {
  global: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // 500 requests per 15 minutes
    message: "Too many requests, please try again later",
  },
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per 15 minutes
    message: "Too many authentication attempts, please try again later",
  },
  strict: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 attempts per hour
    message: "Too many attempts, please try again later",
  },
  api: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per 15 minutes
    message: "API rate limit exceeded, please slow down",
  },
} as const;

function createLimiter(
  config: RateLimitConfig,
): RateLimitRequestHandler | RequestHandler {
  if (isTestEnv) {
    return (_req, _res, next) => next();
  }

  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    message: { status: "error", message: config.message },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    validate: { xForwardedForHeader: false },
  });
}

export const globalLimiter = createLimiter(RATE_LIMITS.global);
export const authLimiter = createLimiter(RATE_LIMITS.auth);
export const strictLimiter = createLimiter(RATE_LIMITS.strict);
export const apiLimiter = createLimiter(RATE_LIMITS.api);

export { RATE_LIMITS };
