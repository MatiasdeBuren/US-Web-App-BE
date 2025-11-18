import { Router } from "express";
import {
  getGamificationProfile,
  getLeaderboard,
  getAllAchievements,
  getCustomizationOptions,
  updateCustomization,
  getPointTransactions
} from "../controllers/gamificationController";
import { authenticateToken } from "../auth_middleware";

const router = Router();

// Rutas públicas (o con auth básica)
router.get("/profile/:userId", getGamificationProfile);
router.get("/leaderboard", getLeaderboard);
router.get("/achievements", getAllAchievements);
router.get("/transactions/:userId", getPointTransactions);

// Rutas protegidas que requieren autenticación
router.get("/customization/:userId", authenticateToken, getCustomizationOptions);
router.put("/customize", authenticateToken, updateCustomization);

export default router;
