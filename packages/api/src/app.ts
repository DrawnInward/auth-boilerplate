import express from "express";
import cors from "cors";
import userRouter from "./routes/userRoutes";
import adminRouter from "./routes/adminRoutes";
import { catchAllError, handleCustomError } from "./utils/errorHandling";
import { globalLimiter } from "./middleware/rateLimiter";

const corsOptions = {
  origin: process.env.ALLOWED_ORIGIN || "http://localhost:5173",
  credentials: true,
};

const app = express();
app.use(cors(corsOptions));
app.use(express.json());
app.use(globalLimiter);
app.use("/api", userRouter);
app.use("/api/admin", adminRouter);
app.use(handleCustomError);
app.use(catchAllError);

export default app;