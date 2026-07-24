import express from "express";
import userAuthRoutes from "./auth/userAuth.routes";
import organizationRoutes from "./user/organizations.routes";
import invitationRoutes from "./user/invitations.routes";
import mfaRoutes from "./user/mfa.routes";
import oauthRoutes from "./user/oauth.routes";
import configRoutes from "./config.routes";

const router = express.Router();

router.use("/config", configRoutes);

router.use("/auth", userAuthRoutes);

router.use("/auth/mfa", mfaRoutes);

router.use("/oauth", oauthRoutes);

router.use("/organizations", organizationRoutes);

router.use("/invitations", invitationRoutes);

export default router;
