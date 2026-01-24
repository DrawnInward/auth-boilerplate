import express from "express";
import userAuthRoutes from "./auth/userAuth";
import organizationRoutes from "./user/organizations";
import invitationRoutes from "./user/invitations";

const router = express.Router();

// Auth routes
router.use("/auth", userAuthRoutes);

// Organization-scoped routes
router.use("/organizations", organizationRoutes);

// Invitation routes (public - for accepting org invites)
router.use("/invitations", invitationRoutes);

export default router;
