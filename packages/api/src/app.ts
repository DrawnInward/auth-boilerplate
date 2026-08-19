import express from "express";
import cors, { type CorsOptions } from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import userRouter from "./routes/user.routes";
import adminRouter from "./routes/admin.routes";
import { catchAllError, handleCustomError } from "./utils/errorHandling";
import { logger } from "./utils/logger";
import { globalLimiter } from "./middleware/rateLimiter";
import { originCheck } from "./middleware/originCheck";
import { getAllowedOrigin, getTrustProxy } from "./utils/config";

const corsOptions: CorsOptions = {
  // Read per request, matching originCheck — a module-load snapshot here
  // while originCheck reads per request would let the two disagree if the
  // env changes after import.
  origin: (_requestOrigin, callback) => callback(null, getAllowedOrigin()),
  credentials: true,
};

const app = express();
// Where req.ip comes from, which is what every IP-keyed rate limiter buckets
// on. Behind a reverse proxy this MUST name the proxy (TRUST_PROXY, see
// utils/config.ts) or every client arrives as the proxy's address and shares
// one bucket site-wide. A module-load read, not per-request: Express compiles
// the setting once, and a trust boundary changing under a running process is
// a redeploy, not a config drift to accommodate.
const trustProxy = getTrustProxy();
if (trustProxy !== false) {
  app.set("trust proxy", trustProxy);
}
// First in the chain so every downstream handler has req.log carrying the
// request id, and every request/response pair is logged once.
app.use(pinoHttp({ logger }));
app.use(helmet());
app.use(cors(corsOptions));
// CORS only governs what a browser lets a page *read* — it does not stop a
// cross-site form or fetch from *sending* a cookie-carrying request, which is
// why the origin check is a separate middleware.
app.use(originCheck);
app.use(express.json());
app.use(globalLimiter);
app.use("/api", userRouter);
app.use("/api/admin", adminRouter);
app.use(handleCustomError);
app.use(catchAllError);

export default app;
