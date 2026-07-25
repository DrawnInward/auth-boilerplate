import { Response } from "express";

export interface ApiResponse<T = any> {
  status: "success" | "error";
  message?: string;
  data?: T;
}

export const sendSuccess = <T>(
  res: Response,
  data: T,
  message?: string,
): Response<ApiResponse<T>> => {
  return res.json({
    status: "success",
    message,
    data,
  });
};

export const sendCreated = <T>(
  res: Response,
  data: T,
  message?: string,
): Response<ApiResponse<T>> => {
  return res.status(201).json({
    status: "success",
    message,
    data,
  });
};

export const sendNoContent = (res: Response): Response => {
  return res.status(204).send();
};
