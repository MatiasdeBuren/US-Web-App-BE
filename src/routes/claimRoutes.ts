import { Router } from 'express';
import { requireAuth } from '../auth_middleware';
import {
  getPublicClaims,
  getUserClaims,
  getClaim,
  createClaim,
  updateClaim,
  deleteClaim,
  getAdminClaims,
  updateClaimStatus,
  deleteAdminClaim
} from '../controllers/claimController';

const router = Router();

// ==========================================
// RUTAS PÚBLICAS (sin autenticación)
// ==========================================

// GET /claims/public - Obtener todos los reclamos públicos
router.get('/public', getPublicClaims);

// ==========================================
// RUTAS DE USUARIO (requieren autenticación)
// ==========================================

// GET /claims - Obtener reclamos del usuario
router.get('/', requireAuth, getUserClaims);

// GET /claims/:id - Obtener reclamo específico del usuario
router.get('/:id', requireAuth, getClaim);

// POST /claims - Crear nuevo reclamo
router.post('/', requireAuth, createClaim);

// PUT /claims/:id - Actualizar reclamo del usuario
router.put('/:id', requireAuth, updateClaim);

// DELETE /claims/:id - Eliminar reclamo del usuario
router.delete('/:id', requireAuth, deleteClaim);

export default router;