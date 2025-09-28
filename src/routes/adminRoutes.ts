import { Router } from "express";
import { validateAdmin } from "../middleware/adminMiddleware";
import {
  getSystemStats,
  getAllUsers,
  updateUserRole,
  getAllReservations,
  createAmenity,
  updateAmenity,
  getAllApartments,
  createApartment,
  updateApartment,
  deleteApartment,
  getAllAmenities,
  deleteAmenity,
  getAmenityDetailReservations
} from "../controllers/adminController";
import {
  getAdminClaims,
  updateClaimStatus,
  deleteAdminClaim
} from "../controllers/claimController";

const router = Router();

// 🔒 TODAS las rutas admin requieren autenticación de administrador

// 📊 Estadísticas del sistema
router.get("/stats", validateAdmin, getSystemStats);

// 👥 Gestión de usuarios
router.get("/users", validateAdmin, getAllUsers);
router.put("/users/:id/role", validateAdmin, updateUserRole);

// 📋 Gestión de reservas
router.get("/reservations", validateAdmin, getAllReservations);

// � Gestión de amenities - RUTAS COMPLETAS
router.get("/amenities", validateAdmin, getAllAmenities);
router.post("/amenities", validateAdmin, createAmenity);
router.put("/amenities/:id", validateAdmin, updateAmenity);
router.delete("/amenities/:id", validateAdmin, deleteAmenity);
router.get("/amenities/:id/reservations", validateAdmin, getAmenityDetailReservations);

// 🏠 Gestión de apartamentos
router.get("/apartments", validateAdmin, getAllApartments);
router.post("/apartments", validateAdmin, createApartment);
router.put("/apartments/:id", validateAdmin, updateApartment);
router.delete("/apartments/:id", validateAdmin, deleteApartment);

// 📢 Gestión de reclamos
router.get("/claims", validateAdmin, getAdminClaims);
router.put("/claims/:id/status", validateAdmin, updateClaimStatus);
router.delete("/claims/:id", validateAdmin, deleteAdminClaim);

export default router;