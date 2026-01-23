import express from "express";
import adminAuthRoutes from "./auth/adminAuth";
import adminUserRoutes from "./admin/users";
import adminOrganizationRoutes from "./admin/organizations";

const router = express.Router();

// Admin auth routes
router.use("/auth", adminAuthRoutes);

// Admin management routes
router.use("/users", adminUserRoutes);
router.use("/organizations", adminOrganizationRoutes);

export default router;
