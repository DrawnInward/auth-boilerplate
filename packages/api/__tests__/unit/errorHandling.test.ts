import { Request, Response, NextFunction } from "express";
import {
  handleCustomError,
  catchAllError,
} from "../../src/utils/errorHandling";

// The middleware contract genuine 500s are too disruptive to integration-test:
// 4xx messages are client-facing and pass through; 500 messages are written
// for operators, so the body goes generic (log + requestId carry the detail);
// other 5xx codes (502/503) are deliberately client-facing and pass through.

const makeRes = () => {
  const res = {} as Response & { status: jest.Mock; json: jest.Mock };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const makeReq = () =>
  ({
    id: "req-42",
    log: { error: jest.fn(), warn: jest.fn() },
  }) as unknown as Request & { log: { error: jest.Mock; warn: jest.Mock } };

const next: NextFunction = jest.fn();

afterEach(() => jest.clearAllMocks());

describe("handleCustomError", () => {
  it("passes a 4xx message through and logs it as a warning", () => {
    const req = makeReq();
    const res = makeRes();

    handleCustomError({ status: 401, msg: "Invalid Token" }, req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      status: "error",
      message: "Invalid Token",
    });
    expect(req.log.warn).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("replaces a 500 message with a generic body carrying the request id", () => {
    const req = makeReq();
    const res = makeRes();

    handleCustomError(
      { status: 500, msg: "Missing environment variable." },
      req,
      res,
      next,
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      status: "error",
      message: "Internal server error",
      requestId: "req-42",
    });
    // The real message still reaches the operator through the log.
    expect(req.log.error).toHaveBeenCalledWith(
      expect.objectContaining({ status: 500 }),
      "Missing environment variable.",
    );
  });

  it("keeps the real 500 message in development", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      const req = makeReq();
      const res = makeRes();

      handleCustomError(
        { status: 500, msg: "Missing environment variable." },
        req,
        res,
        next,
      );

      expect(res.json).toHaveBeenCalledWith({
        status: "error",
        message: "Missing environment variable.",
      });
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it("passes a non-500 5xx message through — those are deliberately client-facing", () => {
    const req = makeReq();
    const res = makeRes();

    handleCustomError(
      { status: 503, msg: "Google OAuth is not configured" },
      req,
      res,
      next,
    );

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      status: "error",
      message: "Google OAuth is not configured",
    });
    expect(req.log.error).toHaveBeenCalled();
  });

  it("hands an error without a status to the next handler", () => {
    const req = makeReq();
    const res = makeRes();
    const error = new Error("boom");

    handleCustomError(error, req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(error);
  });
});

describe("catchAllError", () => {
  it("answers with a generic 500 carrying the request id and logs the error", () => {
    const req = makeReq();
    const res = makeRes();

    catchAllError(new Error("driver blew up"), req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      status: "error",
      message: "Internal server error",
      requestId: "req-42",
    });
    expect(req.log.error).toHaveBeenCalled();
  });
});
