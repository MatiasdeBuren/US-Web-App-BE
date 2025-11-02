import type { Request, Response } from "express";
import { prisma } from "../prismaClient";
import { emailService } from "../services/emailService";

export const getSystemStats = async (req: Request, res: Response) => {
  try {
    console.log(`[ADMIN STATS] User ${(req as any).user.email} requesting system stats`);

    const [
      totalUsers,
      totalApartments,
      totalReservations,
      activeReservations,
      totalAmenities
    ] = await Promise.all([
      prisma.user.count(),
      prisma.apartment.count(),
      prisma.reservation.count(),
      prisma.reservation.count({
        where: {
          status: { name: "confirmada" },
          endTime: {
            gte: new Date() // Reservas que no terminaron
          }
        }
      }),
      prisma.amenity.count()
    ]);

    const stats = {
      totalUsers,
      totalApartments,
      totalReservations,
      activeReservations,
      totalAmenities,
      generatedAt: new Date().toISOString()
    };

    console.log(`[ADMIN STATS] Stats generated successfully:`, stats);

    res.json(stats);
  } catch (error) {
    console.error("❌ [ADMIN STATS ERROR]", error);
    res.status(500).json({ 
      message: "Error fetching system statistics" 
    });
  }
};

export const getAllUsers = async (req: Request, res: Response) => {
  try {
    console.log(`👥 [ADMIN USERS] User ${(req as any).user.email} requesting all users`);

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        apartmentId: true,
        apartment: {
          select: {
            id: true,
            unit: true,
            floor: true,
            rooms: true
          }
        },
        _count: {
          select: {
            reservations: true,
            ownedApartments: true
          }
        }
      },
      orderBy: [
        { role: "desc" }, // Admins primero
        { name: "asc" }
      ]
    });

    const formattedUsers = users.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      apartmentId: user.apartmentId,
      apartment: user.apartment ? {
        id: user.apartment.id,
        unit: user.apartment.unit,
        floor: user.apartment.floor,
        rooms: user.apartment.rooms
      } : null,
      reservationCount: user._count.reservations,
      ownedApartmentsCount: user._count.ownedApartments
    }));

    console.log(` [ADMIN USERS] Retrieved ${formattedUsers.length} users`);

    res.json({
      users: formattedUsers,
      totalCount: formattedUsers.length,
      retrievedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ [ADMIN USERS ERROR]", error);
    res.status(500).json({ 
      message: "Error fetching users list" 
    });
  }
};

export const updateUserRole = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const adminUser = (req as any).user;

    console.log(`[ADMIN ROLE CHANGE] User ${adminUser.email} attempting to change user ${id} role to ${role}`);

    const validRoles = ["admin", "tenant", "owner"];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ 
        message: "Rol inválido. Debe ser: admin, tenant o owner" 
      });
    }

    const userId = parseInt(id || "");
    if (isNaN(userId)) {
      return res.status(400).json({ 
        message: "ID de usuario inválido" 
      });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true }
    });

    if (!targetUser) {
      return res.status(404).json({ 
        message: "Usuario no encontrado" 
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true
      }
    });

    console.log(` [ADMIN ROLE CHANGE] Successfully changed user ${targetUser.email} role from ${targetUser.role} to ${role}`);

    res.json({
      message: "Rol de usuario actualizado con éxito",
      user: updatedUser,
      previousRole: targetUser.role,
      updatedBy: adminUser.email,
      updatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ [ADMIN ROLE CHANGE ERROR]", error);
    res.status(500).json({ 
      message: "Error al actualizar el rol de usuario" 
    });
  }
};


export const getAllReservations = async (req: Request, res: Response) => {
  try {
    const { status, amenityId, limit = "50" } = req.query;
    const adminUser = (req as any).user;

    console.log(` [ADMIN RESERVATIONS] User ${adminUser.email} requesting reservations. Filters:`, { status, amenityId, limit });

    const where: any = {};
    
    if (status && typeof status === "string") {
      where.status = { name: status };
    }
    
    if (amenityId && typeof amenityId === "string") {
      const amenityIdNum = parseInt(amenityId);
      if (!isNaN(amenityIdNum)) {
        where.amenityId = amenityIdNum;
      }
    }

    const limitNum = parseInt(limit as string) || 50;
    const maxLimit = Math.min(limitNum, 200); // Máximo 200 para evitar sobrecarga

    const reservations = await prisma.reservation.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        amenity: {
          select: {
            id: true,
            name: true,
            capacity: true,
            maxDuration: true
          }
        },
        status: true
      },
      orderBy: { createdAt: "desc" },
      take: maxLimit
    });

    console.log(` [ADMIN RESERVATIONS] Retrieved ${reservations.length} reservations`);

    res.json({
      reservations,
      totalCount: reservations.length,
      filters: { status, amenityId, limit: maxLimit },
      retrievedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ [ADMIN RESERVATIONS ERROR]", error);
    res.status(500).json({ 
      message: "Error al obtener las reservas" 
    });
  }
};


export const createAmenity = async (req: Request, res: Response) => {
  try {
    const { name, capacity, maxDuration, openTime, closeTime, isActive, requiresApproval } = req.body;
    const adminUser = (req as any).user;

    console.log(`➕ [ADMIN CREATE AMENITY] User ${adminUser.email} creating amenity:`, { name, capacity, maxDuration, openTime, closeTime, isActive, requiresApproval });

    // Validaciones
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({ 
        message: "El nombre de la amenity es obligatorio y debe ser una cadena no vacía" 
      });
    }

    if (!capacity || typeof capacity !== "number" || capacity < 1) {
      return res.status(400).json({ 
        message: "La capacidad es obligatoria y debe ser un número positivo" 
      });
    }

    if (!maxDuration || typeof maxDuration !== "number" || maxDuration < 1) {
      return res.status(400).json({ 
        message: "La duración máxima es obligatoria y debe ser un número positivo (en minutos)" 
      });
    }

    // Validaciones de horarios
    if (openTime !== undefined && openTime !== null) {
      if (typeof openTime !== "string" || !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(openTime)) {
        return res.status(400).json({ 
          message: "El horario de apertura debe estar en formato HH:MM (24 horas)" 
        });
      }
    }

    if (closeTime !== undefined && closeTime !== null) {
      if (typeof closeTime !== "string" || !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(closeTime)) {
        return res.status(400).json({ 
          message: "El horario de cierre debe estar en formato HH:MM (24 horas)" 
        });
      }
    }

    if (openTime && closeTime) {
      const [openHour, openMin] = openTime.split(':').map(Number);
      const [closeHour, closeMin] = closeTime.split(':').map(Number);
      const openTimeMinutes = openHour * 60 + openMin;
      const closeTimeMinutes = closeHour * 60 + closeMin;

      if (openTimeMinutes >= closeTimeMinutes) {
        return res.status(400).json({ 
          message: "El horario de apertura debe ser anterior al horario de cierre" 
        });
      }
    }

    const existingAmenity = await prisma.amenity.findFirst({
      where: {
        name: {
          equals: name.trim(),
          mode: "insensitive"
        }
      }
    });

    if (existingAmenity) {
      return res.status(409).json({ 
        message: "Ya existe una amenity con este nombre" 
      });
    }

    const createData: any = {
      name: name.trim(),
      capacity,
      maxDuration
    };

    if (openTime !== undefined) {
      createData.openTime = openTime;
    }

    if (closeTime !== undefined) {
      createData.closeTime = closeTime;
    }

    if (isActive !== undefined) {
      createData.isActive = Boolean(isActive);
    }

    if (requiresApproval !== undefined) {
      createData.requiresApproval = Boolean(requiresApproval);
    }

    const newAmenity = await prisma.amenity.create({
      data: createData
    });

    console.log(`✅ [ADMIN CREATE AMENITY] Successfully created amenity: ${newAmenity.name} (ID: ${newAmenity.id}) with hours: ${newAmenity.openTime || 'N/A'} - ${newAmenity.closeTime || 'N/A'}, requiresApproval: ${newAmenity.requiresApproval}`);

    res.status(201).json({
      message: "Amenity creada con éxito",
      amenity: newAmenity,
      createdBy: adminUser.email,
      createdAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ [ADMIN CREATE AMENITY ERROR]", error);
    res.status(500).json({ 
      message: "Error al crear la amenity" 
    });
  }
};

export const updateAmenity = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, capacity, maxDuration, openTime, closeTime, isActive, requiresApproval } = req.body;
    const adminUser = (req as any).user;

    console.log(` [ADMIN UPDATE AMENITY] User ${adminUser.email} updating amenity ${id}:`, { name, capacity, maxDuration, openTime, closeTime, isActive, requiresApproval });

    const amenityId = parseInt(id || "");
    if (isNaN(amenityId)) {
      return res.status(400).json({ 
        message: "ID de amenity inválido" 
      });
    }

    const existingAmenity = await prisma.amenity.findUnique({
      where: { id: amenityId }
    });

    if (!existingAmenity) {
      return res.status(404).json({ 
        message: "Amenity no encontrada" 
      });
    }

    const updateData: any = {};

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ 
          message: "El nombre debe ser una cadena no vacía" 
        });
      }
      updateData.name = name.trim();
    }

    if (capacity !== undefined) {
      if (typeof capacity !== "number" || capacity < 1) {
        return res.status(400).json({ 
          message: "La capacidad debe ser un número positivo" 
        });
      }
      updateData.capacity = capacity;
    }

    if (maxDuration !== undefined) {
      if (typeof maxDuration !== "number" || maxDuration < 1) {
        return res.status(400).json({ 
          message: "La duración máxima debe ser un número positivo (en minutos)" 
        });
      }
      updateData.maxDuration = maxDuration;
    }

    // Validaciones para horarios de operación
    if (openTime !== undefined) {
      if (openTime === null) {
        updateData.openTime = null;
      } else if (typeof openTime !== "string" || !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(openTime)) {
        return res.status(400).json({ 
          message: "El horario de apertura debe estar en formato HH:MM (24 horas)" 
        });
      } else {
        updateData.openTime = openTime;
      }
    }

    if (closeTime !== undefined) {
      if (closeTime === null) {
        updateData.closeTime = null;
      } else if (typeof closeTime !== "string" || !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(closeTime)) {
        return res.status(400).json({ 
          message: "El horario de cierre debe estar en formato HH:MM (24 horas)" 
        });
      } else {
        updateData.closeTime = closeTime;
      }
    }

    if (isActive !== undefined) {
      updateData.isActive = Boolean(isActive);
    }

    if (requiresApproval !== undefined) {
      updateData.requiresApproval = Boolean(requiresApproval);
    }

    const finalOpenTime = updateData.openTime !== undefined ? updateData.openTime : existingAmenity.openTime;
    const finalCloseTime = updateData.closeTime !== undefined ? updateData.closeTime : existingAmenity.closeTime;

    if (finalOpenTime && finalCloseTime) {
      const [openHour, openMin] = finalOpenTime.split(':').map(Number);
      const [closeHour, closeMin] = finalCloseTime.split(':').map(Number);
      const openTimeMinutes = openHour * 60 + openMin;
      const closeTimeMinutes = closeHour * 60 + closeMin;

      if (openTimeMinutes >= closeTimeMinutes) {
        return res.status(400).json({ 
          message: "El horario de apertura debe ser anterior al horario de cierre" 
        });
      }
    }

    // Si se está actualizando el nombre, verificar que no exista otro con el mismo nombre
    if (updateData.name && updateData.name !== existingAmenity.name) {
      const duplicateAmenity = await prisma.amenity.findFirst({
        where: {
          name: {
            equals: updateData.name,
            mode: "insensitive"
          },
          id: {
            not: amenityId
          }
        }
      });

      if (duplicateAmenity) {
        return res.status(409).json({ 
          message: "Ya existe una amenity con este nombre" 
        });
      }
    }

    const updatedAmenity = await prisma.amenity.update({
      where: { id: amenityId },
      data: updateData
    });

    console.log(` [ADMIN UPDATE AMENITY] Successfully updated amenity: ${updatedAmenity.name} (ID: ${updatedAmenity.id}) with hours: ${updatedAmenity.openTime || 'N/A'} - ${updatedAmenity.closeTime || 'N/A'}`);

    res.json({
      message: "Amenity actualizada con éxito",
      amenity: updatedAmenity,
      updatedFields: Object.keys(updateData),
      updatedBy: adminUser.email,
      updatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ [ADMIN UPDATE AMENITY ERROR]", error);
    res.status(500).json({ 
      message: "Error al actualizar la amenity" 
    });
  }
};

export const getAllApartments = async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user;
    console.log(` [ADMIN APARTMENTS] User ${adminUser.email} requesting all apartments`);

    const apartments = await prisma.apartment.findMany({
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        tenants: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        _count: {
          select: {
            tenants: true
          }
        }
      },
      orderBy: [
        { floor: "asc" },
        { unit: "asc" }
      ]
    });

    const formattedApartments = apartments.map(apartment => {
      const isOccupied = apartment.tenants.length > 0;
      const tenant = apartment.tenants.length > 0 ? apartment.tenants[0] : null;

      return {
        id: apartment.id,
        unit: apartment.unit,
        floor: apartment.floor,
        areaM2: apartment.areaM2,
        observations: apartment.observations,
        rooms: apartment.rooms,
        isOccupied,
        owner: apartment.owner,
        tenant,
        _count: {
          users: 1 + apartment.tenants.length, // owner + tenants
          tenants: apartment.tenants.length
        }
      };
    });

    console.log(` [ADMIN APARTMENTS] Retrieved ${formattedApartments.length} apartments`);

    res.json({
      apartments: formattedApartments,
      totalCount: formattedApartments.length,
      retrievedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ [ADMIN APARTMENTS ERROR]", error);
    res.status(500).json({ 
      message: "Error al obtener la lista de apartamentos" 
    });
  }
};


export const createApartment = async (req: Request, res: Response) => {
  try {
    const { unit, floor, rooms, areaM2, observations, ownerId } = req.body;
    const adminUser = (req as any).user;

    console.log(`[ADMIN CREATE APARTMENT] User ${adminUser.email} creating apartment:`, { unit, floor, rooms, ownerId });

    if (!unit || typeof unit !== "string" || unit.trim().length === 0) {
      return res.status(400).json({ 
        message: "El unit es obligatorio y debe ser una cadena no vacía" 
      });
    }

    if (!floor || typeof floor !== "number" || floor < 1) {
      return res.status(400).json({ 
        message: "El piso es obligatorio y debe ser un número positivo (mínimo 1)" 
      });
    }

    if (!rooms || typeof rooms !== "number" || rooms < 1 || rooms > 10) {
      return res.status(400).json({ 
        message: "Las habitaciones son obligatorias y deben estar entre 1 y 10" 
      });
    }

    const existingApartment = await prisma.apartment.findFirst({
      where: {
        unit: {
          equals: unit.trim(),
          mode: "insensitive"
        }
      }
    });

    if (existingApartment) {
      return res.status(409).json({ 
        message: "Ya existe un apartamento con este número de unidad" 
      });
    }

    if (ownerId) {
      if (typeof ownerId !== "number") {
        return res.status(400).json({ 
          message: "El ID del owner debe ser un número" 
        });
      }

      const owner = await prisma.user.findUnique({
        where: { id: ownerId },
        select: { id: true, role: true, email: true }
      });

      if (!owner) {
        return res.status(404).json({ 
          message: "Owner no encontrado" 
        });
      }

      if (owner.role !== "owner" && owner.role !== "admin") {
        return res.status(400).json({ 
          message: "El owner debe tener el rol de 'owner' o 'admin'" 
        });
      }
    }

    const createData: any = {
      unit: unit.trim(),
      floor,
      rooms
    };

    if (areaM2 && typeof areaM2 === "number" && areaM2 > 0) {
      createData.areaM2 = areaM2;
    }

    if (observations && typeof observations === "string") {
      createData.observations = observations.trim();
    }

    if (ownerId) {
      createData.owner = { connect: { id: ownerId } };
    }

    const newApartment = await prisma.apartment.create({
      data: createData,
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      }
    });

    console.log(`[ADMIN CREATE APARTMENT] Successfully created apartment: ${newApartment.unit} (ID: ${newApartment.id})`);

    res.status(201).json({
      message: "Apartamento creado con éxito",
      apartment: {
        ...newApartment,
        isOccupied: false,
        tenant: null
      },
      createdBy: adminUser.email,
      createdAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ [ADMIN CREATE APARTMENT ERROR]", error);
    res.status(500).json({ 
      message: "Error al crear el apartamento" 
    });
  }
};


export const updateApartment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { unit, floor, rooms, areaM2, observations, ownerId, tenantId } = req.body;
    const adminUser = (req as any).user;

    console.log(` [ADMIN UPDATE APARTMENT] User ${adminUser.email} updating apartment ${id}:`, req.body);

    const apartmentId = parseInt(id || "");
    if (isNaN(apartmentId)) {
      return res.status(400).json({ 
        message: "ID de apartamento inválido" 
      });
    }

    const existingApartment = await prisma.apartment.findUnique({
      where: { id: apartmentId },
      include: {
        owner: true,
        tenants: true
      }
    });

    if (!existingApartment) {
      return res.status(404).json({ 
        message: "Apartamento no encontrado" 
      });
    }

    const updateData: any = {};
    const updatedFields: string[] = [];

    if (unit !== undefined) {
      if (typeof unit !== "string" || unit.trim().length === 0) {
        return res.status(400).json({ 
          message: "El unit debe ser un string no vacío" 
        });
      }

      if (unit.trim() !== existingApartment.unit) {
        const duplicateApartment = await prisma.apartment.findFirst({
          where: {
            unit: {
              equals: unit.trim(),
              mode: "insensitive"
            },
            id: {
              not: apartmentId
            }
          }
        });

        if (duplicateApartment) {
          return res.status(409).json({ 
            message: "Ya existe un apartamento con este número de unidad" 
          });
        }
      }

      updateData.unit = unit.trim();
      updatedFields.push("unit");
    }

    if (floor !== undefined) {
      if (typeof floor !== "number" || floor < 1) {
        return res.status(400).json({ 
          message: "Floor must be a positive number (minimum 1)" 
        });
      }
      updateData.floor = floor;
      updatedFields.push("floor");
    }

    if (rooms !== undefined) {
      if (typeof rooms !== "number" || rooms < 1 || rooms > 10) {
        return res.status(400).json({ 
          message: "Rooms must be between 1 and 10" 
        });
      }
      updateData.rooms = rooms;
      updatedFields.push("rooms");
    }

    if (areaM2 !== undefined) {
      if (areaM2 === null) {
        updateData.areaM2 = null;
      } else if (typeof areaM2 === "number" && areaM2 > 0) {
        updateData.areaM2 = areaM2;
      } else {
        return res.status(400).json({ 
          message: "Area must be a positive number or null" 
        });
      }
      updatedFields.push("areaM2");
    }

    if (observations !== undefined) {
      updateData.observations = observations === null ? null : observations.trim();
      updatedFields.push("observations");
    }

    if (ownerId !== undefined) {
      if (ownerId === null) {
        updateData.owner = { disconnect: true };
        updatedFields.push("owner");
      } else if (typeof ownerId === "number") {
        const owner = await prisma.user.findUnique({
          where: { id: ownerId },
          select: { id: true, role: true }
        });

        if (!owner) {
          return res.status(404).json({ 
            message: "Owner not found" 
          });
        }

        if (owner.role !== "owner" && owner.role !== "admin") {
          return res.status(400).json({ 
            message: "Owner debe tener el rol de 'owner' or 'admin'" 
          });
        }

        updateData.owner = { connect: { id: ownerId } };
        updatedFields.push("owner");
      } else {
        return res.status(400).json({ 
          message: "El ID del owner debe ser un número o null" 
        });
      }
    }

    if (tenantId !== undefined) {
      if (tenantId === null) {
        // Desconectar tenant actual
        const currentTenant = existingApartment.tenants[0];
        if (currentTenant) {
          updateData.tenants = { disconnect: { id: currentTenant.id } };
          updatedFields.push("tenant");
        }
      } else if (typeof tenantId === "number") {
        const tenant = await prisma.user.findUnique({
          where: { id: tenantId },
          select: { id: true, role: true, apartmentId: true }
        });

        if (!tenant) {
          return res.status(404).json({ 
            message: "Inquilino no encontrado" 
          });
        }

        if (tenant.role !== "tenant") {
          return res.status(400).json({ 
            message: "El inquilino debe tener el rol de 'tenant'" 
          });
        }

        if (tenant.apartmentId && tenant.apartmentId !== apartmentId) {
          return res.status(400).json({ 
            message: "El inquilino ya está asignado a otro apartamento" 
          });
        }

        const currentTenant = existingApartment.tenants[0];
        if (currentTenant && currentTenant.id !== tenantId) {
          updateData.tenants = { 
            disconnect: { id: currentTenant.id },
            connect: { id: tenantId }
          };
        } else if (!currentTenant) {
          updateData.tenants = { connect: { id: tenantId } };
        }
        updatedFields.push("tenant");
      } else {
        return res.status(400).json({ 
          message: "El ID del inquilino debe ser un número o null" 
        });
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ 
        message: "No fields to update" 
      });
    }

    const updatedApartment = await prisma.apartment.update({
      where: { id: apartmentId },
      data: updateData,
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        tenants: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        }
      }
    });

    console.log(`[ADMIN UPDATE APARTMENT] Successfully updated apartment: ${updatedApartment.unit} (ID: ${updatedApartment.id})`);

    res.json({
      message: "Apartment updated successfully",
      apartment: {
        ...updatedApartment,
        isOccupied: updatedApartment.tenants.length > 0,
        tenant: updatedApartment.tenants.length > 0 ? updatedApartment.tenants[0] : null
      },
      updatedFields,
      updatedBy: adminUser.email,
      updatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ [ADMIN UPDATE APARTMENT ERROR]", error);
    res.status(500).json({ 
      message: "Error updating apartment" 
    });
  }
};

export const deleteApartment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminUser = (req as any).user;

    console.log(`🗑️ [ADMIN DELETE APARTMENT] User ${adminUser.email} attempting to delete apartment ${id}`);

    const apartmentId = parseInt(id || "");
    if (isNaN(apartmentId)) {
      return res.status(400).json({ 
        message: "Invalid apartment ID" 
      });
    }

    const apartment = await prisma.apartment.findUnique({
      where: { id: apartmentId },
      include: {
        owner: {
          select: { id: true, name: true, email: true }
        },
        tenants: {
          select: { id: true, name: true, email: true }
        },
        _count: {
          select: {
            tenants: true
          }
        }
      }
    });

    if (!apartment) {
      return res.status(404).json({ 
        message: "Apartment not found" 
      });
    }

    const assignedUsers = apartment.tenants.length + (apartment.owner ? 1 : 0);
    
    if (assignedUsers > 0) {
      console.log(`🚨 [ADMIN DELETE APARTMENT] Cannot delete apartment ${id}: has assigned users`);
      return res.status(400).json({ 
        error: "Cannot delete apartment: has assigned users",
        details: {
          assignedUsers,
          owner: apartment.owner,
          tenants: apartment.tenants
        }
      });
    }

    const activeReservations = await prisma.reservation.count({
      where: {
        user: {
          apartmentId: apartmentId
        },
        status: {
          name: { in: ["confirmada", "pendiente"] }
        }
      }
    });

    if (activeReservations > 0) {
      console.log(`🚨 [ADMIN DELETE APARTMENT] Cannot delete apartment ${id}: has active reservations`);
      return res.status(400).json({ 
        error: "Cannot delete apartment: has active reservations",
        details: {
          activeReservations,
          assignedUsers: 0
        }
      });
    }

    const deletedApartment = await prisma.apartment.delete({
      where: { id: apartmentId }
    });

    console.log(` [ADMIN DELETE APARTMENT] Successfully deleted apartment: ${deletedApartment.unit} (ID: ${deletedApartment.id})`);

    res.json({
      message: "Apartment deleted successfully",
      deletedApartment: {
        id: deletedApartment.id,
        unit: deletedApartment.unit,
        floor: deletedApartment.floor
      },
      deletedBy: adminUser.email,
      deletedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ [ADMIN DELETE APARTMENT ERROR]", error);
    res.status(500).json({ 
      message: "Error deleting apartment" 
    });
  }
};


export const getAllAmenities = async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user;
    console.log(`🏊 [ADMIN AMENITIES] User ${adminUser.email} requesting all amenities`);

    const amenities = await prisma.amenity.findMany({
      include: {
        _count: {
          select: {
            reservations: true
          }
        }
      },
      orderBy: [
        { name: "asc" }
      ]
    });

    const amenitiesWithCounts = await Promise.all(
      amenities.map(async (amenity) => {
        const activeReservations = await prisma.reservation.count({
          where: {
            amenityId: amenity.id,
            status: { name: "confirmada" },
            endTime: {
              gte: new Date() // Reservas que aún no han terminado
            }
          }
        });

        return {
          id: amenity.id,
          name: amenity.name,
          capacity: amenity.capacity,
          maxDuration: amenity.maxDuration,
          openTime: amenity.openTime,
          closeTime: amenity.closeTime,
          isActive: amenity.isActive,
          requiresApproval: amenity.requiresApproval,
          _count: {
            reservations: amenity._count.reservations,
            activeReservations
          }
        };
      })
    );

    console.log(` [ADMIN AMENITIES] Retrieved ${amenitiesWithCounts.length} amenities`);

    res.json({
      amenities: amenitiesWithCounts,
      totalCount: amenitiesWithCounts.length,
      retrievedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ [ADMIN AMENITIES ERROR]", error);
    res.status(500).json({ 
      message: "Error fetching amenities list" 
    });
  }
};


export const deleteAmenity = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminUser = (req as any).user;

    console.log(` [ADMIN DELETE AMENITY] User ${adminUser.email} attempting to delete amenity ${id}`);

    const amenityId = parseInt(id || "");
    if (isNaN(amenityId)) {
      return res.status(400).json({ 
        message: "Invalid amenity ID" 
      });
    }

    const amenity = await prisma.amenity.findUnique({
      where: { id: amenityId },
      select: {
        id: true,
        name: true,
        capacity: true,
        maxDuration: true
      }
    });

    if (!amenity) {
      return res.status(404).json({ 
        message: "Amenity no encontrado" 
      });
    }

    // (activas e históricas)
    const allReservations = await prisma.reservation.count({
      where: {
        amenityId: amenityId
      }
    });

    // Contar solo las reservas activas
    const activeReservations = await prisma.reservation.count({
      where: {
        amenityId: amenityId,
        status: {
          name: { in: ["confirmada", "pendiente"] }
        },
        endTime: {
          gte: new Date()
        }
      }
    });

    console.log(` [ADMIN DELETE AMENITY] Amenity ${amenity.name}: ${allReservations} total reservations, ${activeReservations} active`);

    const result = await prisma.$transaction(async (tx) => {
      
      const deletedReservations = await tx.reservation.deleteMany({
        where: {
          amenityId: amenityId
        }
      });

      console.log(`[ADMIN DELETE AMENITY] Deleted ${deletedReservations.count} reservations for amenity ${amenity.name}`);

      const deletedAmenity = await tx.amenity.delete({
        where: { id: amenityId }
      });

      return { deletedAmenity, deletedReservationsCount: deletedReservations.count };
    });

    console.log(`[ADMIN DELETE AMENITY] Successfully deleted amenity: ${result.deletedAmenity.name} (ID: ${result.deletedAmenity.id}) and ${result.deletedReservationsCount} related reservations`);

    res.status(200).json({
      message: "Amenity eliminado exitosamente",
      deletedAmenity: {
        id: result.deletedAmenity.id,
        name: result.deletedAmenity.name
      },
      deletedReservations: result.deletedReservationsCount,
      deletedBy: adminUser.email,
      deletedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ [ADMIN DELETE AMENITY ERROR]", error);
    res.status(500).json({ 
      message: "Error al eliminar el amenity" 
    });
  }
};

export const getAmenityDetailReservations = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, limit = "50" } = req.query;

    const amenityId = parseInt(id || "");
    if (isNaN(amenityId)) {
      return res.status(400).json({ message: "ID de amenity inválido" });
    }

    const amenity = await prisma.amenity.findUnique({
      where: { id: amenityId },
      select: { id: true, name: true, capacity: true, maxDuration: true }
    });

    if (!amenity) {
      return res.status(404).json({ message: "Amenity no encontrado" });
    }

    const where: any = { amenityId };

    if (status === "active") {
      where.status = { name: "confirmada" };
      where.endTime = { gte: new Date() };
    } else if (status) {
      where.status = { name: status };
    }

    const maxLimit = Math.min(parseInt(limit as string) || 50, 200);

    const [reservations, totalCount] = await Promise.all([
      prisma.reservation.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              apartment: { select: { unit: true, floor: true } }
            }
          },
          status: true
        },
        orderBy: { startTime: "desc" },
        take: maxLimit
      }),
      prisma.reservation.count({ where })
    ]);

    const formattedReservations = reservations.map(r => ({
      id: r.id,
      startTime: r.startTime,
      endTime: r.endTime,
      status: r.status.name,
      createdAt: r.createdAt,
      user: {
        id: r.user.id,
        name: r.user.name,
        email: r.user.email,
        apartment: r.user.apartment
      }
    }));

    console.log(`[ADMIN] Retrieved ${formattedReservations.length} reservations for ${amenity.name}`);

    res.json({
      reservations: formattedReservations,
      amenityName: amenity.name,
      amenityId: amenity.id,
      totalCount,
      filters: { status, limit: maxLimit }
    });

  } catch (error) {
    console.error("❌ [ADMIN AMENITY RESERVATIONS ERROR]", error);
    res.status(500).json({ message: "Error al obtener las reservas del amenity" });
  }
};

export const approveReservation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminUser = (req as any).user;

    console.log(` [ADMIN APPROVE RESERVATION] Admin ${adminUser.email} approving reservation ${id}`);

    const reservationId = parseInt(id || "");
    if (isNaN(reservationId)) {
      return res.status(400).json({ 
        message: "ID de reserva inválido" 
      });
    }

    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        },
        amenity: {
          select: { id: true, name: true, capacity: true }
        },
        status: true
      }
    });

    if (!reservation) {
      return res.status(404).json({ 
        message: "Reserva no encontrada" 
      });
    }

    if (reservation.status.name !== "pendiente") {
      return res.status(400).json({ 
        message: `No se puede aprobar una reserva con estado: ${reservation.status.label}` 
      });
    }

    // Verificar que no haya conflictos de capacidad
    const overlappingCount = await prisma.reservation.count({
      where: {
        amenityId: reservation.amenityId,
        status: { name: "confirmada" },
        AND: [
          { startTime: { lt: reservation.endTime } },
          { endTime: { gt: reservation.startTime } },
        ],
      },
    });

    console.log(` [CAPACITY CHECK] Amenity: ${reservation.amenity.name}, Capacity: ${reservation.amenity.capacity}, Current confirmed: ${overlappingCount}`);

    if (overlappingCount >= reservation.amenity.capacity) {
      // Auto-rechazar la reserva si no hay capacidad
      await prisma.$transaction(async (tx) => {
        
        await tx.reservation.update({
          where: { id: reservationId },
          data: { 
            status: { connect: { name: "cancelada" } }
          }
        });

        const cancelledType = await tx.userNotificationType.findUnique({
          where: { name: 'reservation_cancelled' }
        });
        
        await tx.userNotification.create({
          data: {
            userId: reservation.user.id,
            reservationId: reservationId,
            typeId: cancelledType!.id,
            title: 'Reserva Rechazada Automáticamente',
            message: `Tu reserva para ${reservation.amenity.name} fue rechazada porque otras reservas llenaron la capacidad disponible mientras tu solicitud estaba pendiente.`
          }
        });
      });

      // email de rechazo automático
      emailService.sendReservationCancellationEmail(
        reservation.user.email,
        reservation.user.name,
        reservation.amenity.name,
        reservation.startTime,
        reservation.endTime
      ).catch(err => console.error('Error sending auto-rejection email:', err));

      console.log(` [AUTO-REJECT] Reservation ${id} auto-rejected due to full capacity`);

      return res.status(409).json({ 
        message: "No se puede aprobar: el horario está lleno. La reserva ha sido rechazada automáticamente y el usuario ha sido notificado.",
        autoRejected: true
      });
    }

    const approvedReservation = await prisma.$transaction(async (tx) => {
     
      const updated = await tx.reservation.update({
        where: { id: reservationId },
        data: { 
          status: { connect: { name: "confirmada" } }
        },
        include: {
          user: {
            select: { id: true, name: true, email: true }
          },
          amenity: true,
          status: true
        }
      });

      const confirmedType = await tx.userNotificationType.findUnique({
        where: { name: 'reservation_confirmed' }
      });
      
      await tx.userNotification.create({
        data: {
          userId: reservation.user.id,
          reservationId: reservationId,
          typeId: confirmedType!.id,
          title: 'Reserva Aprobada',
          message: `Tu reserva para ${reservation.amenity.name} ha sido aprobada por un administrador.`
        }
      });

      return updated;
    });

    // email de confirmación
    emailService.sendReservationConfirmationEmail(
      reservation.user.email,
      reservation.user.name,
      reservation.amenity.name,
      reservation.startTime,
      reservation.endTime
    ).catch(err => console.error('Error sending approval email:', err));

    console.log(` [ADMIN APPROVE RESERVATION] Reservation ${id} approved successfully`);

    res.json({
      message: "Reserva aprobada exitosamente",
      reservation: approvedReservation,
      approvedBy: adminUser.email,
      approvedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ [ADMIN APPROVE RESERVATION ERROR]", error);
    res.status(500).json({ 
      message: "Error al aprobar la reserva" 
    });
  }
};

export const rejectReservation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminUser = (req as any).user;

    console.log(` [ADMIN REJECT RESERVATION] Admin ${adminUser.email} rejecting reservation ${id}`);

    const reservationId = parseInt(id || "");
    if (isNaN(reservationId)) {
      return res.status(400).json({ 
        message: "ID de reserva inválido" 
      });
    }

    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        },
        amenity: {
          select: { id: true, name: true, capacity: true }
        },
        status: true
      }
    });

    if (!reservation) {
      return res.status(404).json({ 
        message: "Reserva no encontrada" 
      });
    }

    if (reservation.status.name !== "pendiente") {
      return res.status(400).json({ 
        message: `No se puede rechazar una reserva con estado: ${reservation.status.label}` 
      });
    }

    const rejectedReservation = await prisma.$transaction(async (tx) => {
      
      const updated = await tx.reservation.update({
        where: { id: reservationId },
        data: { 
          status: { connect: { name: "cancelada" } }
        },
        include: {
          user: {
            select: { id: true, name: true, email: true }
          },
          amenity: true,
          status: true
        }
      });

      const notificationMessage = reason 
        ? `Tu reserva para ${reservation.amenity.name} ha sido rechazada. Motivo: ${reason}`
        : `Tu reserva para ${reservation.amenity.name} ha sido rechazada por un administrador.`;

      const cancelledType = await tx.userNotificationType.findUnique({
        where: { name: 'reservation_cancelled' }
      });
      
      await tx.userNotification.create({
        data: {
          userId: reservation.user.id,
          reservationId: reservationId,
          typeId: cancelledType!.id,
          title: 'Reserva Rechazada',
          message: notificationMessage
        }
      });

      return updated;
    });

    // email de rechazo
    emailService.sendReservationCancellationEmail(
      reservation.user.email,
      reservation.user.name,
      reservation.amenity.name,
      reservation.startTime,
      reservation.endTime,
      reason // Pasar la razón al email
    ).catch(err => console.error('Error sending rejection email:', err));

    console.log(` [ADMIN REJECT RESERVATION] Reservation ${id} rejected successfully`);

    res.json({
      message: "Reserva rechazada exitosamente",
      reservation: rejectedReservation,
      rejectedBy: adminUser.email,
      rejectedAt: new Date().toISOString(),
      reason: reason || null
    });

  } catch (error) {
    console.error("❌ [ADMIN REJECT RESERVATION ERROR]", error);
    res.status(500).json({ 
      message: "Error al rechazar la reserva" 
    });
  }
};

export const getPendingReservations = async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user;
    console.log(`[ADMIN PENDING RESERVATIONS] Admin ${adminUser.email} requesting pending reservations`);

    const pendingReservations = await prisma.reservation.findMany({
      where: {
        status: { name: "pendiente" }
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            apartment: {
              select: {
                unit: true,
                floor: true
              }
            }
          }
        },
        amenity: {
          select: {
            id: true,
            name: true,
            capacity: true,
            maxDuration: true
          }
        },
        status: true
      },
      orderBy: { createdAt: "desc" }
    });

    console.log(` [ADMIN PENDING RESERVATIONS] Found ${pendingReservations.length} pending reservations`);

    res.json({
      reservations: pendingReservations,
      totalCount: pendingReservations.length,
      retrievedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ [ADMIN PENDING RESERVATIONS ERROR]", error);
    res.status(500).json({ 
      message: "Error al obtener reservas pendientes" 
    });
  }
};

export const cancelReservationAsAdmin = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminUser = (req as any).user;

    console.log(`🗑️ [ADMIN CANCEL RESERVATION] Admin ${adminUser.email} cancelling reservation ${id}`);

    const reservationId = parseInt(id || "");
    if (isNaN(reservationId)) {
      return res.status(400).json({ 
        message: "ID de reserva inválido" 
      });
    }

    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        },
        amenity: {
          select: { id: true, name: true }
        },
        status: true
      }
    });

    if (!reservation) {
      return res.status(404).json({ 
        message: "Reserva no encontrada" 
      });
    }

    if (reservation.status.name === "cancelada") {
      return res.status(400).json({ 
        message: "La reserva ya está cancelada" 
      });
    }

    const cancelledReservation = await prisma.$transaction(async (tx) => {
      
      const updated = await tx.reservation.update({
        where: { id: reservationId },
        data: { 
          status: { connect: { name: "cancelada" } }
        },
        include: {
          user: {
            select: { id: true, name: true, email: true }
          },
          amenity: true,
          status: true
        }
      });

      const notificationMessage = reason 
        ? `Tu reserva para ${reservation.amenity.name} ha sido cancelada por un administrador. Motivo: ${reason}`
        : `Tu reserva para ${reservation.amenity.name} ha sido cancelada por un administrador.`;

      const cancelledType = await tx.userNotificationType.findUnique({
        where: { name: 'reservation_cancelled' }
      });
      
      await tx.userNotification.create({
        data: {
          userId: reservation.user.id,
          reservationId: reservationId,
          typeId: cancelledType!.id,
          title: 'Reserva Cancelada por Administrador',
          message: notificationMessage
        }
      });

      return updated;
    });

    // email de cancelación
    emailService.sendReservationCancellationEmail(
      reservation.user.email,
      reservation.user.name,
      reservation.amenity.name,
      reservation.startTime,
      reservation.endTime,
      reason // Pasar la razón al email
    ).catch(err => console.error('Error sending admin cancellation email:', err));

    console.log(` [ADMIN CANCEL RESERVATION] Reservation ${id} cancelled successfully by admin`);

    res.json({
      message: "Reserva cancelada exitosamente",
      reservation: cancelledReservation,
      cancelledBy: adminUser.email,
      cancelledAt: new Date().toISOString(),
      reason: reason || null
    });

  } catch (error) {
    console.error(" [ADMIN CANCEL RESERVATION ERROR]", error);
    res.status(500).json({ 
      message: "Error al cancelar la reserva" 
    });
  }
};