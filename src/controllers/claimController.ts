import type { Request, Response } from 'express';
import { prisma } from '../prismaClient';

// Tipos para las validaciones
type ClaimCategory = 'ascensor' | 'plomeria' | 'electricidad' | 'temperatura' | 'areas_comunes' | 'edificio' | 'otro';
type ClaimPriority = 'baja' | 'media' | 'alta' | 'urgente';
type ClaimStatus = 'pendiente' | 'en_progreso' | 'resuelto' | 'rechazado';

const validCategories: ClaimCategory[] = ['ascensor', 'plomeria', 'electricidad', 'temperatura', 'areas_comunes', 'edificio', 'otro'];
const validPriorities: ClaimPriority[] = ['baja', 'media', 'alta', 'urgente'];
const validStatuses: ClaimStatus[] = ['pendiente', 'en_progreso', 'resuelto', 'rechazado'];

// ===============================
// HELPER FUNCTIONS
// ===============================

// Función helper para parsear parámetros de paginación
const parsePaginationParams = (page?: string, limit?: string) => {
  const pageNum = parseInt(page || '1');
  const limitNum = parseInt(limit || '10');
  const skip = (pageNum - 1) * limitNum;
  return { pageNum, limitNum, skip };
};

// Función helper para construir filtros de búsqueda
const buildClaimFilters = (category?: string, status?: string, search?: string, userId?: number) => {
  const where: any = {};

  if (userId) {
    where.userId = userId;
  }

  if (category && category !== 'all') {
    where.category = category;
  }

  if (status && status !== 'all') {
    where.status = status;
  }

  if (search) {
    where.OR = [
      { subject: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { location: { contains: search, mode: 'insensitive' } }
    ];
  }

  return where;
};

// Función helper para mapear claims con createdBy
const mapClaimsWithCreatedBy = (claims: any[]) => {
  return claims.map((claim: any) => ({
    ...claim,
    createdBy: claim.user.name
  }));
};

// Función helper para mapear un solo claim con createdBy
const mapClaimWithCreatedBy = (claim: any) => ({
  ...claim,
  createdBy: claim.user.name
});

// Función helper para obtener claims con paginación
const getClaimsWithPagination = async (where: any, skip: number, limitNum: number) => {
  const [claims, total] = await Promise.all([
    prisma.claim.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    }),
    prisma.claim.count({ where })
  ]);

  return { claims: mapClaimsWithCreatedBy(claims), total };
};

// Función helper para validar categoría
const validateCategory = (category: string) => {
  if (!validCategories.includes(category as ClaimCategory)) {
    throw new Error(`Categoría inválida. Valores permitidos: ${validCategories.join(', ')}`);
  }
};

// Función helper para validar prioridad
const validatePriority = (priority: string) => {
  if (!validPriorities.includes(priority as ClaimPriority)) {
    throw new Error(`Prioridad inválida. Valores permitidos: ${validPriorities.join(', ')}`);
  }
};

// Función helper para validar estado
const validateStatus = (status: string) => {
  if (!validStatuses.includes(status as ClaimStatus)) {
    throw new Error(`Estado inválido. Valores permitidos: ${validStatuses.join(', ')}`);
  }
};

// Función helper para verificar permisos de admin
const checkAdminPermissions = (user: any, res: Response) => {
  if (!user || user.role !== 'admin') {
    res.status(403).json({ 
      message: "Acceso denegado. Se requieren permisos de administrador" 
    });
    return false;
  }
  return true;
};

// ===============================
// CONTROLLER FUNCTIONS
// ===============================

// GET /claims/public - Obtener todos los reclamos públicos (sin autenticación)
export const getPublicClaims = async (req: Request, res: Response) => {
  try {
    const { page, limit, category, status, search } = req.query;
    const { pageNum, limitNum, skip } = parsePaginationParams(page as string, limit as string);
    
    const where = buildClaimFilters(category as string, status as string, search as string);
    const { claims, total } = await getClaimsWithPagination(where, skip, limitNum);

    res.json({ claims, total, page: pageNum, limit: limitNum });
  } catch (error) {
    console.error('Error al obtener reclamos públicos:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// GET /claims - Obtener todos los reclamos del usuario
export const getUserClaims = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const { page, limit, category, status, search, includeAll } = req.query;
    const { pageNum, limitNum, skip } = parsePaginationParams(page as string, limit as string);
    
    // Si includeAll es true, mostrar todos los reclamos; si no, solo los del usuario
    const userIdFilter = (includeAll === 'true') ? undefined : userId;
    const where = buildClaimFilters(category as string, status as string, search as string, userIdFilter);
    const { claims, total } = await getClaimsWithPagination(where, skip, limitNum);

    res.json({ claims, total, page: pageNum, limit: limitNum });

  } catch (error) {
    console.error('Error al obtener reclamos:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// GET /claims/:id - Obtener un reclamo específico
export const getClaim = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    if (!id) {
      return res.status(400).json({ message: "ID del reclamo es requerido" });
    }

    const claim = await prisma.claim.findFirst({
      where: {
        id: parseInt(id),
        userId // Solo puede ver sus propios reclamos
      },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!claim) {
      return res.status(404).json({ message: "Reclamo no encontrado" });
    }

    res.json(mapClaimWithCreatedBy(claim));

  } catch (error) {
    console.error('Error al obtener reclamo:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// POST /claims - Crear un nuevo reclamo
export const createClaim = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const { subject, category, description, location, priority } = req.body;

    // Validar campos requeridos
    if (!subject || !category || !description || !location || !priority) {
      return res.status(400).json({ 
        message: "Todos los campos son obligatorios: subject, category, description, location, priority" 
      });
    }

    // Validar valores permitidos usando helpers
    try {
      validateCategory(category);
      validatePriority(priority);
    } catch (error) {
      return res.status(400).json({ message: (error as Error).message });
    }

    const claim = await prisma.claim.create({
      data: {
        subject,
        category,
        description,
        location,
        priority,
        userId
      },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    res.status(201).json(mapClaimWithCreatedBy(claim));

  } catch (error) {
    console.error('Error al crear reclamo:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// PUT /claims/:id - Actualizar un reclamo
export const updateClaim = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    if (!id) {
      return res.status(400).json({ message: "ID del reclamo es requerido" });
    }

    // Verificar que el reclamo existe y pertenece al usuario
    const existingClaim = await prisma.claim.findFirst({
      where: {
        id: parseInt(id),
        userId
      }
    });

    if (!existingClaim) {
      return res.status(404).json({ message: "Reclamo no encontrado" });
    }

    // No permitir actualizar reclamos resueltos o rechazados
    if (existingClaim.status === 'resuelto' || existingClaim.status === 'rechazado') {
      return res.status(403).json({ 
        message: "No se pueden modificar reclamos resueltos o rechazados" 
      });
    }

    const { subject, category, description, location, priority, status } = req.body;

    // Validar valores si se proporcionan usando helpers
    try {
      if (category) validateCategory(category);
      if (priority) validatePriority(priority);
      if (status) validateStatus(status);
    } catch (error) {
      return res.status(400).json({ message: (error as Error).message });
    }

    // Los usuarios solo pueden cambiar el estado a 'pendiente'
    if (status && status !== 'pendiente') {
      return res.status(403).json({ 
        message: "Los usuarios solo pueden cambiar el estado a 'pendiente'" 
      });
    }

    const updatedClaim = await prisma.claim.update({
      where: { id: parseInt(id) },
      data: {
        ...(subject && { subject }),
        ...(category && { category }),
        ...(description && { description }),
        ...(location && { location }),
        ...(priority && { priority }),
        ...(status && { status })
      },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    res.json(mapClaimWithCreatedBy(updatedClaim));

  } catch (error) {
    console.error('Error al actualizar reclamo:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// DELETE /claims/:id - Eliminar un reclamo
export const deleteClaim = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    if (!id) {
      return res.status(400).json({ message: "ID del reclamo es requerido" });
    }

    // Verificar que el reclamo existe y pertenece al usuario
    const existingClaim = await prisma.claim.findFirst({
      where: {
        id: parseInt(id),
        userId
      }
    });

    if (!existingClaim) {
      return res.status(404).json({ message: "Reclamo no encontrado" });
    }

    // No permitir eliminar reclamos en progreso
    if (existingClaim.status === 'en_progreso') {
      return res.status(409).json({ 
        message: "No se puede eliminar: el reclamo está siendo procesado" 
      });
    }

    await prisma.claim.delete({
      where: { id: parseInt(id) }
    });

    res.status(204).send();

  } catch (error) {
    console.error('Error al eliminar reclamo:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// ===============================
// FUNCIONES DE ADMINISTRADOR
// ===============================

// GET /admin/claims - Obtener todos los reclamos (solo admin)
export const getAdminClaims = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!checkAdminPermissions(user, res)) return;

    const { page, limit, category, status, search, userId } = req.query;
    const { pageNum, limitNum, skip } = parsePaginationParams(page as string, limit as string);
    
    const userIdFilter = userId ? parseInt(userId as string) : undefined;
    const where = buildClaimFilters(category as string, status as string, search as string, userIdFilter);
    const { claims, total } = await getClaimsWithPagination(where, skip, limitNum);

    res.json({ claims, total, page: pageNum, limit: limitNum });

  } catch (error) {
    console.error('Error al obtener reclamos (admin):', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// PUT /admin/claims/:id/status - Actualizar estado de reclamo (solo admin)
export const updateClaimStatus = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!checkAdminPermissions(user, res)) return;

    const { id } = req.params;
    const { status, adminNotes } = req.body;

    if (!id) {
      return res.status(400).json({ message: "ID del reclamo es requerido" });
    }

    if (!status) {
      return res.status(400).json({ message: "El estado es obligatorio" });
    }

    try {
      validateStatus(status);
    } catch (error) {
      return res.status(400).json({ message: (error as Error).message });
    }

    // Verificar que el reclamo existe
    const existingClaim = await prisma.claim.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existingClaim) {
      return res.status(404).json({ message: "Reclamo no encontrado" });
    }

    const updatedClaim = await prisma.claim.update({
      where: { id: parseInt(id) },
      data: {
        status,
        ...(adminNotes && { adminNotes })
      },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    res.json(mapClaimWithCreatedBy(updatedClaim));

  } catch (error) {
    console.error('Error al actualizar estado del reclamo:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// DELETE /admin/claims/:id - Eliminar cualquier reclamo (solo admin)
export const deleteAdminClaim = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!checkAdminPermissions(user, res)) return;

    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "ID del reclamo es requerido" });
    }

    // Verificar que el reclamo existe
    const existingClaim = await prisma.claim.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existingClaim) {
      return res.status(404).json({ message: "Reclamo no encontrado" });
    }

    await prisma.claim.delete({
      where: { id: parseInt(id) }
    });

    res.status(204).send();

  } catch (error) {
    console.error('Error al eliminar reclamo (admin):', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};