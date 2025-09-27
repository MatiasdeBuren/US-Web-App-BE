import { Router } from "express";
import { login, register, forgotPassword, resetPassword, testEmail } from "../controllers/authController";

const router = Router();

router.post("/login", login);
router.post("/register", register);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

// Development only - test email functionality
if (process.env.NODE_ENV !== 'production') {
  router.post("/test-email", testEmail);
}

export default router;
