import express from "express";
import adminAuthRoutes from "./auth/adminAuth.routes";
import adminUserRoutes from "./admin/users.routes";
import adminAdminRoutes from "./admin/admins.routes";
import adminOrganizationRoutes from "./admin/organizations.routes";
import adminMfaRoutes from "./admin/mfa.routes";

const router = express.Router();

// Admin auth routes
router.use("/auth", adminAuthRoutes);

// Admin MFA routes
router.use("/auth/mfa", adminMfaRoutes);

// Admin management routes
router.use("/users", adminUserRoutes);
router.use("/admins", adminAdminRoutes);
router.use("/organizations", adminOrganizationRoutes);

export default router;
