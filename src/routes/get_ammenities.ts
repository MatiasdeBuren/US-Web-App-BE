import { Router } from "express";
import { getAmenities } from "../controllers/get_ammenities";
import { requireAuth } from "../auth_middleware";

const router = Router();

router.get("/", requireAuth, getAmenities); // protegida con JWT

export default router;
