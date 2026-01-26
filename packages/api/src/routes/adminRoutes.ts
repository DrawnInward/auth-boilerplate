import express from "express";
import adminAuthRoutes from "./auth/adminAuth";
import adminUserRoutes from "./admin/users";
import adminOrganizationRoutes from "./admin/organizations";
import adminMfaRoutes from "./admin/mfa.routes";

const router = express.Router();

// Admin auth routes
router.use("/auth", adminAuthRoutes);

// Admin MFA routes
router.use("/auth/mfa", adminMfaRoutes);

// Admin management routes
router.use("/users", adminUserRoutes);
router.use("/organizations", adminOrganizationRoutes);

export default router;
