import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ValidationErrorResponse } from "../types/ValidationErrorResponse";
import { childLogger } from "../utils/logger";

const log = childLogger("validate");

require("dotenv").config({quiet: true});

const formatZodError = (
  error: z.ZodError
): ValidationErrorResponse["errors"] => {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join(".") : "root",
    message: issue.message,
    code: issue.code,
  }));
};

const getValidationErrorResponse = (
  message: string,
  error: z.ZodError
): ValidationErrorResponse => {
  if (process.env.NODE_ENV === "production") {
    return {
      status: "error",
      message,
      errors: error.issues.map((issue) => ({
        field: issue.path.length > 0 ? issue.path.join(".") : "root",
        message: "Validation failed",
        code: "VALIDATION_ERROR",
      })),
    };
  } else {
    return {
      status: "error",
      message,
      errors: formatZodError(error),
    };
  }
};

export const validateBody =
  (schema: z.ZodTypeAny) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await schema.safeParseAsync(req.body);
      if (!result.success) {
        return res
          .status(400)
          .json(
            getValidationErrorResponse(
              "Request body validation failed",
              result.error
            )
          );
      }
      req.body = result.data;
      next();
    } catch (error) {
      log.error({ err: error }, "Unexpected error in body validation");
      next(error);
    }
  };

export const validateParams =
  (schema: z.ZodTypeAny) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await schema.safeParseAsync(req.params);
      if (!result.success) {
        return res
          .status(400)
          .json(
            getValidationErrorResponse(
              "URL parameters validation failed",
              result.error
            )
          );
      }
      req.params = result.data as { [key: string]: string };
      next();
    } catch (error) {
      log.error({ err: error }, "Unexpected error in params validation");
      next(error);
    }
  };

export const validateQuery =
  (schema: z.ZodTypeAny) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await schema.safeParseAsync(req.query);
      if (!result.success) {
        return res
          .status(400)
          .json(
            getValidationErrorResponse(
              "Query parameters validation failed",
              result.error
            )
          );
      }
      // req.query is read-only in Express 5, so the parsed (coerced, defaulted)
      // output is stashed on res.locals instead. Controllers read it via
      // getValidatedQuery — never by re-parsing the schema themselves, which
      // would duplicate the contract and silently drift from it.
      res.locals.query = result.data;
      next();
    } catch (error) {
      log.error({ err: error }, "Unexpected error in query validation");
      next(error);
    }
  };

// The typed accessor for whatever validateQuery parsed. Typing is the caller's
// assertion: pass the schema's inferred type, e.g.
// getValidatedQuery<OrganizationsQuery>(res).
export const getValidatedQuery = <T>(res: Response): T =>
  res.locals.query as T;
