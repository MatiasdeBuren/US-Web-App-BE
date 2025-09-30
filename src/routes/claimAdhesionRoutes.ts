import { Router } from "express";
import { requireAuth } from "../auth_middleware";
import { 
  getClaimAdhesions, 
  createOrUpdateClaimAdhesion, 
  deleteClaimAdhesion 
} from "../controllers/claimAdhesionController";

const router = Router();

// Todas las rutas requieren autenticación
router.use(requireAuth);

// GET /claims/:id/adhesions - Obtener adhesiones de un claim
router.get("/:id/adhesions", getClaimAdhesions);

// POST /claims/:id/adhesions - Crear o actualizar adhesión
router.post("/:id/adhesions", createOrUpdateClaimAdhesion);

// DELETE /claims/:id/adhesions - Eliminar adhesión
router.delete("/:id/adhesions", deleteClaimAdhesion);

export default router;