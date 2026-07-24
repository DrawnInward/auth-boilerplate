import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import userRouter from "./routes/user.routes";
import adminRouter from "./routes/admin.routes";
import { catchAllError, handleCustomError } from "./utils/errorHandling";
import { logger } from "./utils/logger";
import { globalLimiter } from "./middleware/rateLimiter";

const corsOptions = {
  origin: process.env.ALLOWED_ORIGIN || "http://localhost:5173",
  credentials: true,
};

const app = express();
// First in the chain so every downstream handler has req.log carrying the
// request id, and every request/response pair is logged once.
app.use(pinoHttp({ logger }));
app.use(cors(corsOptions));
app.use(express.json());
app.use(globalLimiter);
app.use("/api", userRouter);
app.use("/api/admin", adminRouter);
app.use(handleCustomError);
app.use(catchAllError);

export default app;