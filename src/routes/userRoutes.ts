import express from "express";
import userAuthRoutes from "./auth/userAuth";
import organizationRoutes from "./user/organizations";

const router = express.Router();

// Auth routes
router.use("/auth", userAuthRoutes);

// Organization-scoped routes
router.use("/organizations", organizationRoutes);

export default router;
