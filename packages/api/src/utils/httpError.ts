// The one way expected errors are thrown. Produces the same `{ status, msg }`
// shape that older code throws as object literals — so handleCustomError needs
// no changes and both shapes flow through the same middleware — but as a real
// Error, so expected errors carry a stack trace in the logs.
export class HttpError extends Error {
  status: number;
  msg: string;

  constructor(status: number, msg: string) {
    super(msg);
    this.name = "HttpError";
    this.status = status;
    this.msg = msg;
  }
}

export const httpError = (status: number, msg: string): HttpError =>
  new HttpError(status, msg);

// Shape check rather than instanceof, so plain `throw { status, msg }` literals
// satisfy it too.
export const isHttpError = (error: unknown): error is HttpError =>
  typeof error === "object" &&
  error !== null &&
  typeof (error as HttpError).status === "number" &&
  typeof (error as HttpError).msg === "string";
