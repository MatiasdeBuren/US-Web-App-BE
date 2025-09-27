import type { Request, Response } from "express";
import { prisma } from "../prismaClient";

// Create a reservation
export const createReservation = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: "Usuario no autenticado" });

    const { amenityId, startTime, endTime } = req.body;
    if (!amenityId || !startTime || !endTime) {
      return res.status(400).json({ message: "Faltan parámetros" });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    // Validate that the dates are valid
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    const amenity = await prisma.amenity.findUnique({ where: { id: amenityId } });
    if (!amenity) return res.status(404).json({ message: "Amenity no encontrada" });

    const duration = (end.getTime() - start.getTime()) / 60000;
    if (duration > amenity.maxDuration) {
      return res.status(400).json({ message: `La duración máxima para ${amenity.name} es de ${amenity.maxDuration} minutos` });
    }

    if (start >= end) return res.status(400).json({ message: "La hora de inicio debe ser anterior a la hora de finalización" });

    // Check if user has any overlapping reservations (same time, any amenity)
    const userOverlappingReservation = await prisma.reservation.findFirst({
      where: {
        userId,
        status: "confirmed",
        AND: [
          { startTime: { lt: end } },
          { endTime: { gt: start } },
        ],
      },
    });

    if (userOverlappingReservation) {
      return res.status(400).json({ message: "Ya tenes una reserva a esta hora" });
    }

    // Check if user already has a reservation for this amenity on the same day
    const startOfDay = new Date(start);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(start);
    endOfDay.setHours(23, 59, 59, 999);

    const userSameAmenityReservation = await prisma.reservation.findFirst({
      where: {
        userId,
        amenityId,
        status: "confirmed",
        startTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    if (userSameAmenityReservation) {
      return res.status(400).json({ message: `Ya tenes una reserva para ${amenity.name} en este día` });
    }

    const overlappingCount = await prisma.reservation.count({
      where: {
        amenityId,
        status: "confirmed",
        AND: [
          { startTime: { lt: end } },
          { endTime: { gt: start } },
        ],
      },
    });

    if (overlappingCount >= amenity.capacity) {
      return res.status(400).json({ message: "El horario está lleno" });
    }


    const reservation = await prisma.reservation.create({
      data: {
        user: { connect: { id: userId } },
        amenity: { connect: { id: amenityId } },
        startTime: start,
        endTime: end,
        status: "confirmed",
      },
    });

    res.json(reservation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al procesar la solicitud" });
  }
};

// Get all reservations of the logged-in user
export const getUserReservations = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const reservations = await prisma.reservation.findMany({
      where: { userId, hiddenFromUser: false },
      include: { amenity: true },
      orderBy: { startTime: "asc" },
    });

    res.json(reservations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};


// PATCH /reservations/:id/cancel
export const cancelReservation = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { id } = req.params; // reservation ID

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // Check if reservation exists and belongs to user
    const reservation = await prisma.reservation.findUnique({
      where: { id: Number(id) },
    });

    if (!reservation) return res.status(404).json({ message: "Reservation not found" });
    if (reservation.userId !== userId) return res.status(403).json({ message: "Not allowed" });

    // Update status to cancelled
    const cancelled = await prisma.reservation.update({
      where: { id: Number(id) },
      data: { status: "cancelled" },
    });

    res.json(cancelled);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al procesar la solicitud" });
  }
};

export const getAmenityReservations = async (req: Request, res: Response) => {
  try {
    const { amenityId } = req.params;
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

    const where: any = {
      amenityId: Number(amenityId),
      status: "confirmed",
    };

    // CORRECCIÓN: Usar UTC para las fechas de consulta
    if (startDate || endDate) {
      if (startDate && endDate) {
        // Para un rango específico de fechas, trabajar en UTC
        const queryStartDate = new Date(String(startDate) + 'T00:00:00.000Z'); // Forzar UTC
        const queryEndDate = new Date(String(endDate) + 'T23:59:59.999Z');     // Forzar UTC


        where.AND = [
          { startTime: { lte: queryEndDate } },
          { endTime: { gte: queryStartDate } },
        ];
      } else if (startDate) {
        const start = new Date(String(startDate) + 'T00:00:00.000Z'); // Forzar UTC
        where.startTime = { gte: start };
      } else if (endDate) {
        const end = new Date(String(endDate) + 'T23:59:59.999Z'); // Forzar UTC
        where.endTime = { lte: end };
      }
    }



    const reservations = await prisma.reservation.findMany({
      where,
      orderBy: { startTime: "asc" },
      include: {
        user: { select: { id: true, name: true } },
      },
    });



    res.json(reservations);
  } catch (error) {
    console.error('Error in getAmenityReservations:', error);
    res.status(500).json({ message: "Error al procesar la solicitud" });
  }
};


export const hideReservationFromUser = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { id } = req.params; // reservation ID
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // Check if reservation exists and belongs to user
    const reservation = await prisma.reservation.findUnique({
      where: { id: Number(id) },
    });

    if (!reservation) return res.status(404).json({ message: "Reserva no encontrada" });
    if (reservation.userId !== userId) return res.status(403).json({ message: "No permitido" });

    // Update hiddenFromUser to true
    const updated = await prisma.reservation.update({
      where: { id: Number(id) },
      data: { hiddenFromUser: true },
    });

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al procesar la solicitud" });
  }
};
