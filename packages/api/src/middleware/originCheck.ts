import { Request, Response, NextFunction } from "express";
import { getAllowedOrigin } from "../utils/config";
import { httpError } from "../utils/httpError";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// CSRF defence in depth (S6), alongside sameSite cookies: browsers attach an
// Origin header to cross-origin state-changing requests, so one from anywhere
// other than our frontend is rejected. Requests with no Origin at all pass —
// non-browser clients don't send one and aren't CSRF vectors (CSRF is a
// cookie-carrying browser being steered; a client that attaches its own
// cookies can already send anything).
export const originCheck = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const origin = req.headers.origin;

  if (!origin || !STATE_CHANGING_METHODS.has(req.method)) {
    return next();
  }

  if (origin !== getAllowedOrigin()) {
    return next(httpError(403, "Cross-origin request rejected"));
  }

  next();
};
