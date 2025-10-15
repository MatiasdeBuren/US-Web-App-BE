import type { Request, Response } from "express";
import { prisma } from "../prismaClient";
import { emailService } from "../services/emailService";

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
      // Parse the UTC timestamps and convert to local time for validation
      const startDate = new Date(startTime);
      const endDate = new Date(endTime);
      
      const startHour = startDate.getHours();
      const startMinutes = startDate.getMinutes();
      const endHour = endDate.getHours();
      const endMinutes = endDate.getMinutes();

      const [openTimeHour, openTimeMin] = amenity.openTime.split(':').map(Number);
      const [closeTimeHour, closeTimeMin] = amenity.closeTime.split(':').map(Number);

      // Convert to minutes for easier comparison
      const startTimeInMinutes = startHour * 60 + startMinutes;
      const endTimeInMinutes = endHour * 60 + endMinutes;
      const openTimeInMinutes = openTimeHour * 60 + openTimeMin;
      const closeTimeInMinutes = closeTimeHour * 60 + closeTimeMin;

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

    // Create reservation with transaction to also create notification
    const reservation = await prisma.$transaction(async (tx) => {
      // Determine initial status based on requiresApproval
      const initialStatus = amenity.requiresApproval ? "pendiente" : "confirmada";
      
      const newReservation = await tx.reservation.create({
        data: {
          user: { connect: { id: userId } },
          amenity: { connect: { id: amenityId } },
          startTime: start,
          endTime: end,
          status: { connect: { name: initialStatus } },
        },
        include: {
          amenity: true,
          status: true,
          user: {
            select: { id: true, name: true, email: true }
          }
        }
      });

      if (amenity.requiresApproval) {
        // Create in-app notification for user about pending status
        await tx.userNotification.create({
          data: {
            userId,
            reservationId: newReservation.id,
            notificationType: 'reservation_confirmed',
            title: 'Reserva Pendiente de Aprobación',
            message: `Tu solicitud de reserva para ${amenity.name} está pendiente de aprobación por un administrador.`
          }
        });

        // Create notifications for all admins
        const admins = await tx.user.findMany({
          where: { role: 'admin' },
          select: { id: true }
        });

        // Create admin notifications for pending reservations
        await Promise.all(
          admins.map(admin =>
            tx.adminNotification.create({
              data: {
                adminId: admin.id,
                reservationId: newReservation.id,
                notificationType: 'pending_reservation',
                isRead: false
              }
            })
          )
        );
      }
      // Note: No notification created for auto-confirmed reservations
      // User gets immediate feedback via success toast in frontend

      return newReservation;
    });

    // Send confirmation email only if reservation is auto-confirmed (async, don't wait)
    if (!amenity.requiresApproval) {
      emailService.sendReservationConfirmationEmail(
        reservation.user.email,
        reservation.user.name,
        reservation.amenity.name,
        start,
        end
      ).catch(err => console.error('Error sending confirmation email:', err));
    }

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
      include: {
        amenity: true,
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!reservation) return res.status(404).json({ message: "Reserva no encontrada" });
    if (reservation.userId !== userId) return res.status(403).json({ message: "No autorizado" });

    // Update status to cancelled WITHOUT creating notification (user gets toast in frontend)
    const cancelled = await prisma.reservation.update({
      where: { id: Number(id) },
      data: { status: { connect: { name: "cancelada" } } },
      include: {
        amenity: true,
        status: true,
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    // Send cancellation email (async, don't wait)
    emailService.sendReservationCancellationEmail(
      reservation.user.email,
      reservation.user.name,
      reservation.amenity.name,
      reservation.startTime,
      reservation.endTime
    ).catch(err => console.error('Error sending cancellation email:', err));

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

    if (startDate || endDate) {
      if (startDate && endDate) {
        const queryStartDate = new Date(String(startDate) + 'T00:00:00.000Z');
        const queryEndDate = new Date(String(endDate) + 'T23:59:59.999Z');


        where.AND = [
          { startTime: { lte: queryEndDate } },
          { endTime: { gte: queryStartDate } },
        ];
      } else if (startDate) {
        const start = new Date(String(startDate) + 'T00:00:00.000Z');
        where.startTime = { gte: start };
      } else if (endDate) {
        const end = new Date(String(endDate) + 'T23:59:59.999Z');
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
