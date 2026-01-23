import express from "express";
import { authoriseUser } from "../../middleware/authoriseUser";
import { validateBody } from "../../middleware/validate";
import { loginUserSchema } from "../../types";
import { login, logout } from "../../controllers/user/auth";

const router = express.Router();

router.post("/login", validateBody(loginUserSchema), login);

router.post("/logout", authoriseUser(["user"]), logout);

export default router;