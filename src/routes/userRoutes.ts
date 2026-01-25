import express from "express";
import userAuthRoutes from "./auth/userAuth";
import organizationRoutes from "./user/organizations";
import invitationRoutes from "./user/invitations";
import mfaRoutes from "./user/mfa.routes";
import oauthRoutes from "./user/oauth.routes";

const router = express.Router();

// Auth routes
router.use("/auth", userAuthRoutes);

// MFA routes
router.use("/auth/mfa", mfaRoutes);

// OAuth routes
router.use("/oauth", oauthRoutes);

// Organization-scoped routes
router.use("/organizations", organizationRoutes);

// Invitation routes (public - for accepting org invites)
router.use("/invitations", invitationRoutes);

export default router;
