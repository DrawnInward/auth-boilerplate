import { Router } from "express";
import { getConfig } from "../controllers/config.controller";

const router = Router();

router.get("/", getConfig);

export default router;
