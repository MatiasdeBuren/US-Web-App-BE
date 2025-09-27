import { Router } from "express";
import { requireAuth } from "../auth_middleware";
import { createReservation, getUserReservations, cancelReservation, getAmenityReservations, hideReservationFromUser } from "../controllers/reservation";


const router = Router();

// POST /reservations -> create a new reservation
router.post("/", requireAuth, createReservation);

// GET /reservations -> get reservations of the logged-in user
router.get("/", requireAuth, getUserReservations);


// PATCH /reservations/:id/cancel -> cancel a reservation
router.patch("/:id/cancel", requireAuth, cancelReservation);

// GET /reservations/amenity/:amenityId -> get all reservations for a specific amenity
router.get("/amenity/:amenityId", requireAuth, getAmenityReservations);


// PATCH /reservations/:id/hide -> hide a reservation from the user
router.patch("/:id/hide", requireAuth, hideReservationFromUser);

export default router;
