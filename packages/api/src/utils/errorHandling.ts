import { Request, Response, NextFunction } from "express";
import { logger } from "./logger";

interface CustomError {
  status?: number;
  msg?: string;
  message?: string;
  stack?: string;
}

// The error middleware owns error logging — don't log at the throw site as
// well, or every failure appears twice. Client errors (4xx) are warnings;
// anything 5xx or unrecognised is an error and carries its stack.
const logFor = (req: Request) => req.log ?? logger;

export const handleCustomError = (
  error: CustomError,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (error.status) {
    const message = error.msg || error.message;

    if (error.status >= 500) {
      logFor(req).error({ err: error, status: error.status }, message);
    } else {
      logFor(req).warn({ status: error.status }, message);
    }

    return res.status(error.status).json({
      status: "error",
      message,
    });
  }

  next(error);
};

export const catchAllError = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  logFor(req).error({ err: error }, "Unhandled error");

  return res.status(500).json({
    status: "error",
    message: "Internal server error",
  });
};
