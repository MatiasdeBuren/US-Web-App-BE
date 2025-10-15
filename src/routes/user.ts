import { Router } from "express";
import { requireAuth } from "../auth_middleware";
import { updateUserName, updateUserPassword, deleteUser } from "../controllers/user";
import {
  getUserNotifications,
  markUserNotificationRead,
  markAllUserNotificationsRead,
  deleteUserNotification
} from "../controllers/notificationController";

const router = Router();

// PATCH /user/name -> actualizar el nombre del usuario logueado
router.patch("/name", requireAuth, updateUserName);

// PATCH /user/password -> actualizar la contraseña del usuario logueado
router.patch("/password", requireAuth, updateUserPassword);

// DELETE /user -> delete user account
router.delete("/", requireAuth, deleteUser);

// 🔔 User Notifications Routes
router.get("/notifications", requireAuth, getUserNotifications);
router.post("/notifications/:id/mark-read", requireAuth, markUserNotificationRead);
router.post("/notifications/mark-all-read", requireAuth, markAllUserNotificationsRead);
router.delete("/notifications/:id", requireAuth, deleteUserNotification);

export default router;
