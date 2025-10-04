import type { Request, Response } from "express";
import { prisma } from "../prismaClient";

// Database-driven validation for reservation status
const validateReservationStatus = async (status: string) => {
  const statusRecord = await prisma.reservationStatus.findUnique({
    where: { name: status }
  });
  if (!statusRecord) {
    const validStatuses = await prisma.reservationStatus.findMany({ select: { name: true } });
    throw new Error(`Estado inválido. Valores permitidos: ${validStatuses.map(s => s.name).join(', ')}`);
  }
  return statusRecord;
};

// GET /reservations/statuses - Get all reservation statuses
export const getReservationStatuses = async (req: Request, res: Response) => {
  try {
    const statuses = await prisma.reservationStatus.findMany({
      orderBy: { name: 'asc' }
    });
    res.json(statuses);
  } catch (error) {
    console.error('Error al obtener estados de reserva:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

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
      return res.status(400).json({ message: "Formato de fecha inválido" });
    }

    const amenity = await prisma.amenity.findUnique({ where: { id: amenityId } });
    if (!amenity) return res.status(404).json({ message: "Amenity no encontrada" });

    // Validar que la amenity esté activa
    if (!amenity.isActive) {
      return res.status(400).json({ message: "Esta amenity no está disponible" });
    }

    // Validar horarios de operación (solo si están definidos)
    if (amenity.openTime && amenity.closeTime) {
      // IMPORTANTE: Extraer hora directamente del timestamp ISO para evitar problemas de zona horaria
      // El frontend envía la hora local como si fuera UTC, así que parseamos directamente
      const startTimeStr = startTime; // "2025-10-01T21:30:00.000Z"
      const endTimeStr = endTime;     // "2025-10-01T22:30:00.000Z"
      
      // Extraer hora y minutos directamente del string ISO
      const startHour = parseInt(startTimeStr.substring(11, 13)); // Posición 11-12: "21"
      const startMinutes = parseInt(startTimeStr.substring(14, 16)); // Posición 14-15: "30"
      const endHour = parseInt(endTimeStr.substring(11, 13));
      const endMinutes = parseInt(endTimeStr.substring(14, 16));

      const openTime = amenity.openTime.split(':');
      const closeTime = amenity.closeTime.split(':');
      const openHour = parseInt(openTime[0]);
      const openMinutes = parseInt(openTime[1]);
      const closeHour = parseInt(closeTime[0]);
      const closeMinutes = parseInt(closeTime[1]);

      // Convertir a minutos para comparación más fácil
      const startTimeInMinutes = startHour * 60 + startMinutes;
      const endTimeInMinutes = endHour * 60 + endMinutes;
      const openTimeInMinutes = openHour * 60 + openMinutes;
      const closeTimeInMinutes = closeHour * 60 + closeMinutes;

      console.log(`🕐 [HORARIO DEBUG] Start: ${startHour}:${startMinutes}, End: ${endHour}:${endMinutes}, Amenity: ${amenity.openTime}-${amenity.closeTime}`);

      if (startTimeInMinutes < openTimeInMinutes || endTimeInMinutes > closeTimeInMinutes) {
        return res.status(400).json({ 
          message: `${amenity.name} solo está disponible de ${amenity.openTime} a ${amenity.closeTime}` 
        });
      }
    }

    const duration = (end.getTime() - start.getTime()) / 60000;
    if (duration > amenity.maxDuration) {
      return res.status(400).json({ message: `La duración máxima para ${amenity.name} es de ${amenity.maxDuration} minutos` });
    }

    if (start >= end) return res.status(400).json({ message: "La hora de inicio debe ser anterior a la hora de finalización" });

    // Check if user has any overlapping reservations (same time, any amenity)
    const userOverlappingReservation = await prisma.reservation.findFirst({
      where: {
        userId,
        status: { name: "confirmada" },
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
        status: { name: "confirmada" },
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
        status: { name: "confirmada" },
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
        status: { connect: { name: "confirmada" } },
      },
      include: {
        amenity: true,
        status: true
      }
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
    if (!userId) return res.status(401).json({ message: "Usuario no autenticado" });

    const reservations = await prisma.reservation.findMany({
      where: { userId, hiddenFromUser: false },
      include: { 
        amenity: true,
        status: true
      },
      orderBy: { startTime: "asc" },
    });

    res.json(reservations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};


// PATCH /reservations/:id/cancel
export const cancelReservation = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { id } = req.params; // reservation ID

    if (!userId) return res.status(401).json({ message: "Usuario no autenticado" });

    // Check if reservation exists and belongs to user
    const reservation = await prisma.reservation.findUnique({
      where: { id: Number(id) },
    });

    if (!reservation) return res.status(404).json({ message: "Reserva no encontrada" });
    if (reservation.userId !== userId) return res.status(403).json({ message: "No autorizado" });

    // Update status to cancelled
    const cancelled = await prisma.reservation.update({
      where: { id: Number(id) },
      data: { status: { connect: { name: "cancelada" } } },
      include: {
        amenity: true,
        status: true
      }
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
      status: { name: "confirmada" },
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
        status: true
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
    if (!userId) return res.status(401).json({ message: "Usuario no autenticado" });

    // Check if reservation exists and belongs to user
    const reservation = await prisma.reservation.findUnique({
      where: { id: Number(id) },
    });

    if (!reservation) return res.status(404).json({ message: "Reserva no encontrada" });
    if (reservation.userId !== userId) return res.status(403).json({ message: "No autorizado" });

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
