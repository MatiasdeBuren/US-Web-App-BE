import { Router } from "express";
import { requireAuth } from "../auth_middleware";
import { updateUserName, updateUserPassword, deleteUser } from "../controllers/user";

const router = Router();

// PATCH /user/name -> actualizar el nombre del usuario logueado
router.patch("/name", requireAuth, updateUserName);

// PATCH /user/password -> actualizar la contraseña del usuario logueado
router.patch("/password", requireAuth, updateUserPassword);

// DELETE /user -> delete user account
router.delete("/", requireAuth, deleteUser);

export default router;
