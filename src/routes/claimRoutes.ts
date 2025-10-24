import { Router } from 'express';
import { requireAuth } from '../auth_middleware';
import {
  getUserClaims,
  getClaim,
  createClaim,
  updateClaim,
  deleteClaim,
  getClaimCategories,
  getClaimPriorities,
  getClaimStatuses
} from '../controllers/claimController';

const router = Router();


// GET /claims/categories - Obtener todas las categorías
router.get('/categories', getClaimCategories);

// GET /claims/priorities - Obtener todas las prioridades
router.get('/priorities', getClaimPriorities);

// GET /claims/statuses - Obtener todos los estados
router.get('/statuses', getClaimStatuses);

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