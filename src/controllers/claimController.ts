import type { Request, Response } from 'express';
import { prisma } from '../prismaClient';


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

  console.log('🔍 [BUILD FILTERS] Input params:', { category, status, search, userId });

  if (userId) {
    where.userId = userId;
  }

  if (category && category !== 'all') {
    where.category = { name: category };
  }

  if (status && status !== 'all') {
    where.status = { name: status };
  }

  if (search) {
    where.OR = [
      { subject: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { location: { contains: search, mode: 'insensitive' } }
    ];
  }

  console.log('🔍 [BUILD FILTERS] Generated where clause:', JSON.stringify(where, null, 2));
  return where;
};

// Función helper para mapear claims con createdBy y adhesiones
const mapClaimsWithCreatedBy = async (claims: any[], requestingUser?: any) => {
  // Obtener adhesiones para todos los claims de una vez
  const claimIds = claims.map(claim => claim.id);
  
  // Obtener conteos de adhesiones para todos los claims
  const [supportCounts, disagreeCounts, userAdhesions] = await Promise.all([
    prisma.claimAdhesion.groupBy({
      by: ['claimId'],
      where: { 
        claimId: { in: claimIds },
        adhesionType: 'support'
      },
      _count: { id: true }
    }),
    prisma.claimAdhesion.groupBy({
      by: ['claimId'],
      where: { 
        claimId: { in: claimIds },
        adhesionType: 'disagree'
      },
      _count: { id: true }
    }),
    requestingUser ? prisma.claimAdhesion.findMany({
      where: {
        claimId: { in: claimIds },
        userId: requestingUser.id
      },
      select: { claimId: true, adhesionType: true }
    }) : []
  ]);

  // Crear maps para acceso rápido
  const supportMap = new Map(supportCounts.map(item => [item.claimId, item._count.id]));
  const disagreeMap = new Map(disagreeCounts.map(item => [item.claimId, item._count.id]));
  const userAdhesionMap = new Map(userAdhesions.map(item => [item.claimId, item.adhesionType]));

  return claims.map((claim: any) => {
    // Determine createdBy based on anonymity and user role
    let createdBy = claim.user.name;
    
    // Show "Anónimo" if claim is anonymous AND user is not admin AND user is not the creator
    if (claim.isAnonymous && 
        requestingUser?.role !== 'admin' && 
        requestingUser?.id !== claim.userId) {
      createdBy = 'Anónimo';
    }

    return {
      ...claim,
      createdBy,
      adhesion_counts: {
        support: supportMap.get(claim.id) || 0,
        disagree: disagreeMap.get(claim.id) || 0
      },
      user_adhesion: userAdhesionMap.get(claim.id) || null
    };
  });
};

// Función helper para mapear un solo claim con createdBy y adhesiones
const mapClaimWithCreatedBy = async (claim: any, requestingUser?: any) => {
  // Obtener conteos de adhesiones para este claim específico
  const [supportCount, disagreeCount, userAdhesion] = await Promise.all([
    prisma.claimAdhesion.count({
      where: { claimId: claim.id, adhesionType: 'support' }
    }),
    prisma.claimAdhesion.count({
      where: { claimId: claim.id, adhesionType: 'disagree' }
    }),
    requestingUser ? prisma.claimAdhesion.findUnique({
      where: {
        unique_user_claim_adhesion: {
          claimId: claim.id,
          userId: requestingUser.id
        }
      },
      select: { adhesionType: true }
    }) : null
  ]);

  // Determine createdBy based on anonymity and user role
  let createdBy = claim.user.name;
  
  // Show "Anónimo" if claim is anonymous AND user is not admin AND user is not the creator
  if (claim.isAnonymous && 
      requestingUser?.role !== 'admin' && 
      requestingUser?.id !== claim.userId) {
    createdBy = 'Anónimo';
  }

  return {
    ...claim,
    createdBy,
    adhesion_counts: {
      support: supportCount,
      disagree: disagreeCount
    },
    user_adhesion: userAdhesion?.adhesionType || null
  };
};

// Función helper para obtener claims con paginación
const getClaimsWithPagination = async (where: any, skip: number, limitNum: number, requestingUser?: any) => {
  try {
    console.log('🔍 [GET CLAIMS PAGINATION] Starting query with params:', { skip, limitNum, where: JSON.stringify(where) });
    
    const [claims, total] = await Promise.all([
      prisma.claim.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, email: true }
          },
          category: true,
          priority: true,
          status: true
        }
      }),
      prisma.claim.count({ where })
    ]);

    console.log(`🔍 [GET CLAIMS PAGINATION] Raw query returned ${claims.length} claims, total: ${total}`);
    
    const mappedClaims = await mapClaimsWithCreatedBy(claims, requestingUser);
    console.log(`🔍 [GET CLAIMS PAGINATION] Mapped claims completed, returning ${mappedClaims.length} claims`);
    
    return { claims: mappedClaims, total };
  } catch (error) {
    console.error('❌ [GET CLAIMS PAGINATION ERROR]', error);
    throw error;
  }
};

// Database-driven validation functions
const validateCategory = async (category: string) => {
  const categoryRecord = await prisma.claimCategory.findUnique({
    where: { name: category }
  });
  if (!categoryRecord) {
    const validCategories = await prisma.claimCategory.findMany({ select: { name: true } });
    throw new Error(`Categoría inválida. Valores permitidos: ${validCategories.map(c => c.name).join(', ')}`);
  }
  return categoryRecord;
};

const validatePriority = async (priority: string) => {
  const priorityRecord = await prisma.claimPriority.findUnique({
    where: { name: priority }
  });
  if (!priorityRecord) {
    const validPriorities = await prisma.claimPriority.findMany({ select: { name: true } });
    throw new Error(`Prioridad inválida. Valores permitidos: ${validPriorities.map(p => p.name).join(', ')}`);
  }
  return priorityRecord;
};

const validateStatus = async (status: string) => {
  const statusRecord = await prisma.claimStatus.findUnique({
    where: { name: status }
  });
  if (!statusRecord) {
    const validStatuses = await prisma.claimStatus.findMany({ select: { name: true } });
    throw new Error(`Estado inválido. Valores permitidos: ${validStatuses.map(s => s.name).join(', ')}`);
  }
  return statusRecord;
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
// LOOKUP TABLE ENDPOINTS
// ===============================

// GET /claims/categories - Obtener todas las categorías
export const getClaimCategories = async (req: Request, res: Response) => {
  try {
    const categories = await prisma.claimCategory.findMany({
      orderBy: { name: 'asc' }
    });
    res.json(categories);
  } catch (error) {
    console.error('Error al obtener categorías:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// GET /claims/priorities - Obtener todas las prioridades
export const getClaimPriorities = async (req: Request, res: Response) => {
  try {
    const priorities = await prisma.claimPriority.findMany({
      orderBy: { level: 'asc' }
    });
    res.json(priorities);
  } catch (error) {
    console.error('Error al obtener prioridades:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// GET /claims/statuses - Obtener todos los estados
export const getClaimStatuses = async (req: Request, res: Response) => {
  try {
    const statuses = await prisma.claimStatus.findMany({
      orderBy: { name: 'asc' }
    });
    res.json(statuses);
  } catch (error) {
    console.error('Error al obtener estados:', error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
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
    const user = (req as any).user;
    if (!user?.id) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const { page, limit, category, status, search, includeAll } = req.query;
    const { pageNum, limitNum, skip } = parsePaginationParams(page as string, limit as string);
    
    // Si includeAll es true, mostrar todos los reclamos; si no, solo los del usuario
    const userIdFilter = (includeAll === 'true') ? undefined : user.id;
    const where = buildClaimFilters(category as string, status as string, search as string, userIdFilter);
    const { claims, total } = await getClaimsWithPagination(where, skip, limitNum, user);

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

    const mappedClaim = await mapClaimWithCreatedBy(claim, (req as any).user);
    res.json(mappedClaim);

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

    const { subject, category, description, location, priority, isAnonymous } = req.body;

    // Validar campos requeridos
    if (!subject || !category || !description || !location || !priority) {
      return res.status(400).json({ 
        message: "Todos los campos son obligatorios: subject, category, description, location, priority" 
      });
    }

    // Validate and get records from database
    try {
      const [categoryRecord, priorityRecord, statusRecord] = await Promise.all([
        validateCategory(category),
        validatePriority(priority),
        validateStatus('pendiente') // Default status for new claims
      ]);

      // Use transaction to create claim and notifications atomically
      const result = await prisma.$transaction(async (tx) => {
        // Create the claim
        const claim = await tx.claim.create({
          data: {
            subject,
            categoryId: categoryRecord.id,
            description,
            location,
            priorityId: priorityRecord.id,
            statusId: statusRecord.id,
            userId,
            isAnonymous: Boolean(isAnonymous)
          },
          include: {
            user: {
              select: { id: true, name: true, email: true }
            },
            category: true,
            priority: true,
            status: true
          }
        });

        // Get all admin users
        const adminUsers = await tx.user.findMany({
          where: { role: 'admin' },
          select: { id: true }
        });

        // Determine notification type based on priority
        // High priority or urgent claims get 'urgent_claim' type
        const notificationType = (priorityRecord.name === 'alta' || priorityRecord.name === 'urgente') 
          ? 'urgent_claim' 
          : 'new_claim';

        // Create notifications for all admins
        if (adminUsers.length > 0) {
          await tx.adminNotification.createMany({
            data: adminUsers.map(admin => ({
              adminId: admin.id,
              claimId: claim.id,
              notificationType
            }))
          });
        }

        return claim;
      });

      const mappedClaim = await mapClaimWithCreatedBy(result, (req as any).user);
      res.status(201).json(mappedClaim);
    } catch (validationError) {
      return res.status(400).json({ message: (validationError as Error).message });
    }

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

    // Verificar que el reclamo existe, pertenece al usuario y obtener status
    const claimWithStatus = await prisma.claim.findFirst({
      where: {
        id: parseInt(id),
        userId
      },
      include: { status: true }
    });

    if (!claimWithStatus) {
      return res.status(404).json({ message: "Reclamo no encontrado" });
    }

    // No permitir actualizar reclamos resueltos o rechazados
    if (claimWithStatus.status.name === 'resuelto' || claimWithStatus.status.name === 'rechazado') {
      return res.status(403).json({ 
        message: "No se pueden modificar reclamos resueltos o rechazados" 
      });
    }

    const { subject, category, description, location, priority, status } = req.body;

    // Los usuarios solo pueden cambiar el estado a 'pendiente'
    if (status && status !== 'pendiente') {
      return res.status(403).json({ 
        message: "Los usuarios solo pueden cambiar el estado a 'pendiente'" 
      });
    }

    try {
      // Validate and get IDs from database if values are provided
      const [categoryRecord, priorityRecord, statusRecord] = await Promise.all([
        category ? validateCategory(category) : Promise.resolve(null),
        priority ? validatePriority(priority) : Promise.resolve(null),
        status ? validateStatus(status) : Promise.resolve(null)
      ]);

      // Prepare update data
      const updateData: any = {};
      if (subject) updateData.subject = subject;
      if (description) updateData.description = description;
      if (location) updateData.location = location;
      if (categoryRecord) updateData.categoryId = categoryRecord.id;
      if (priorityRecord) updateData.priorityId = priorityRecord.id;
      if (statusRecord) updateData.statusId = statusRecord.id;

      const updatedClaim = await prisma.claim.update({
        where: { id: parseInt(id) },
        data: updateData,
        include: {
          user: {
            select: { id: true, name: true, email: true }
          },
          category: true,
          priority: true,
          status: true
        }
      });

      const mappedUpdatedClaim = await mapClaimWithCreatedBy(updatedClaim, (req as any).user);
      res.json(mappedUpdatedClaim);
    } catch (validationError) {
      return res.status(400).json({ message: (validationError as Error).message });
    }

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

    // Verificar que el reclamo existe, pertenece al usuario y obtener status
    const claimWithStatusForDelete = await prisma.claim.findFirst({
      where: {
        id: parseInt(id),
        userId
      },
      include: { status: true }
    });

    if (!claimWithStatusForDelete) {
      return res.status(404).json({ message: "Reclamo no encontrado" });
    }

    // No permitir eliminar reclamos en progreso
    if (claimWithStatusForDelete.status.name === 'en_progreso') {
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

    console.log('🔍 [GET ADMIN CLAIMS] Request query params:', req.query);
    const { page, limit, category, status, search, userId } = req.query;
    const { pageNum, limitNum, skip } = parsePaginationParams(page as string, limit as string);
    
    const userIdFilter = userId ? parseInt(userId as string) : undefined;
    const where = buildClaimFilters(category as string, status as string, search as string, userIdFilter);
    
    console.log('🔍 [GET ADMIN CLAIMS] Calling getClaimsWithPagination...');
    const { claims, total } = await getClaimsWithPagination(where, skip, limitNum);

    console.log(`✅ [GET ADMIN CLAIMS] Successfully retrieved ${claims.length} claims, total: ${total}`);
    res.json({ claims, total, page: pageNum, limit: limitNum });

  } catch (error) {
    console.error('❌ [GET ADMIN CLAIMS ERROR] Full error details:', error);
    if (error instanceof Error) {
      console.error('❌ [GET ADMIN CLAIMS ERROR] Error message:', error.message);
      console.error('❌ [GET ADMIN CLAIMS ERROR] Error stack:', error.stack);
    }
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
      // Validate status and get record from database
      const statusRecord = await validateStatus(status);

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
          statusId: statusRecord.id,
          ...(adminNotes && { adminNotes })
        },
        include: {
          user: {
            select: { id: true, name: true, email: true }
          },
          category: true,
          priority: true,
          status: true
        }
      });

      const mappedUpdatedClaim = await mapClaimWithCreatedBy(updatedClaim, (req as any).user);
      res.json(mappedUpdatedClaim);
    } catch (validationError) {
      return res.status(400).json({ message: (validationError as Error).message });
    }

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