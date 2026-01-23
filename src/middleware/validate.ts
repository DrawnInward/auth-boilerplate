import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { ValidationErrorResponse } from "../types/ValidationErrorResponse";

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

// TODO: Probably want to make these error messages be consistent with your own at some point. Have a look at what they actually look like.

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
      console.error("Unexpected error in body validation:", error);
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
      console.error("Unexpected error in params validation:", error);
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
      // Note: req.query is read-only in Express, so we just validate without reassigning
      // Controllers should handle the query params directly from req.query
      next();
    } catch (error) {
      console.error("Unexpected error in query validation:", error);
      next(error);
    }
  };
