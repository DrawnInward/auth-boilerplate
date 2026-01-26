import { Request, Response, NextFunction } from "express";

interface CustomError {
  status?: number;
  msg?: string;
  message?: string;
}

export const handleCustomError = (
  error: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (error.status) {
    return res.status(error.status).json({
      status: "error",
      message: error.msg || error.message
    });
  }
  next(error);
};

export const catchAllError = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error("Unhandled error:", error);

  return res.status(500).json({
    status: "error",
    message: "Internal server error"
  });
};