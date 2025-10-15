import type { Request, Response } from 'express';
import { prisma } from '../prismaClient';

/**
 * GET /admin/notifications - Obtener todas las notificaciones del admin autenticado
 * Acceso: Solo administradores
 */
export const getAdminNotifications = async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user;
    
    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({ 
        message: "Acceso denegado. Se requieren permisos de administrador" 
      });
    }

    console.log(`📬 [ADMIN NOTIFICATIONS] Admin ${adminUser.email} requesting notifications`);

    // Get all notifications for this admin with related claim and user data
    const notifications = await prisma.adminNotification.findMany({
      where: { adminId: adminUser.id },
      include: {
        claim: {
          include: {
            user: {
              select: { id: true, name: true }
            },
            priority: {
              select: { name: true, label: true }
            },
            category: {
              select: { name: true, label: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Count unread notifications
    const unreadCount = await prisma.adminNotification.count({
      where: { 
        adminId: adminUser.id,
        isRead: false 
      }
    });

    // Format notifications according to the required structure
    const formattedNotifications = notifications
      .filter(notification => notification.claim !== null) // Filter out notifications without claims
      .map(notification => {
        const userName = notification.claim!.isAnonymous ? 'Anónimo' : notification.claim!.user.name;
        const categoryLabel = notification.claim!.category.label || notification.claim!.category.name || 'General';
        const priorityLabel = notification.claim!.priority.label || notification.claim!.priority.name;
        
        return {
          id: notification.id.toString(),
          type: notification.notificationType,
          title: `Nuevo reclamo ${notification.notificationType === 'urgent_claim' ? '(URGENTE)' : ''}`,
          message: `${userName} creó un reclamo: "${notification.claim!.subject}" en la categoría ${categoryLabel}`,
          isRead: notification.isRead,
          createdAt: notification.createdAt.toISOString(),
          readAt: notification.readAt?.toISOString() || null,
          claimId: notification.claim!.id,
          claim: {
            id: notification.claim!.id.toString(),
            title: notification.claim!.subject,
            priority: notification.claim!.priority.name,
            category: categoryLabel,
            user: {
              name: userName
            }
          }
        };
      });

    console.log(`✅ [ADMIN NOTIFICATIONS] Retrieved ${formattedNotifications.length} notifications for admin ${adminUser.email}, ${unreadCount} unread`);

    res.json({
      notifications: formattedNotifications,
      unreadCount
    });

  } catch (error) {
    console.error('❌ [ADMIN NOTIFICATIONS ERROR]', error);
    res.status(500).json({ 
      message: "Error al obtener notificaciones" 
    });
  }
};

/**
 * POST /admin/notifications/:id/mark-read - Marcar una notificación específica como leída
 * Acceso: Solo administradores
 */
export const markNotificationRead = async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user;
    const { id } = req.params;

    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({ 
        message: "Acceso denegado. Se requieren permisos de administrador" 
      });
    }

    if (!id) {
      return res.status(400).json({ message: "ID de notificación es requerido" });
    }

    const notificationId = parseInt(id);
    console.log(`📖 [MARK NOTIFICATION READ] Admin ${adminUser.email} marking notification ${id} as read`);

    // Verify notification exists and belongs to this admin
    const existingNotification = await prisma.adminNotification.findFirst({
      where: {
        id: notificationId,
        adminId: adminUser.id
      }
    });

    if (!existingNotification) {
      return res.status(404).json({ message: "Notificación no encontrada" });
    }

    // If already read, just return current state
    if (existingNotification.isRead) {
      return res.json({
        success: true,
        readAt: existingNotification.readAt?.toISOString()
      });
    }

    // Mark as read
    const now = new Date();
    await prisma.adminNotification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: now
      }
    });

    console.log(`✅ [MARK NOTIFICATION READ] Notification ${id} marked as read by admin ${adminUser.email}`);

    res.json({
      success: true,
      readAt: now.toISOString()
    });

  } catch (error) {
    console.error('❌ [MARK NOTIFICATION READ ERROR]', error);
    res.status(500).json({ 
      message: "Error al marcar notificación como leída" 
    });
  }
};

/**
 * POST /admin/notifications/mark-all-read - Marcar todas las notificaciones no leídas como leídas
 * Acceso: Solo administradores
 */
export const markAllNotificationsRead = async (req: Request, res: Response) => {
  try {
    const adminUser = (req as any).user;

    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({ 
        message: "Acceso denegado. Se requieren permisos de administrador" 
      });
    }

    console.log(`📖📖 [MARK ALL READ] Admin ${adminUser.email} marking all notifications as read`);

    const now = new Date();
    
    // Update all unread notifications for this admin
    const updateResult = await prisma.adminNotification.updateMany({
      where: {
        adminId: adminUser.id,
        isRead: false
      },
      data: {
        isRead: true,
        readAt: now
      }
    });

    console.log(`✅ [MARK ALL READ] ${updateResult.count} notifications marked as read by admin ${adminUser.email}`);

    res.json({
      success: true,
      readAt: now.toISOString(),
      markedCount: updateResult.count
    });

  } catch (error) {
    console.error('❌ [MARK ALL READ ERROR]', error);
    res.status(500).json({ 
      message: "Error al marcar todas las notificaciones como leídas" 
    });
  }
};

// ===============================
// USER NOTIFICATIONS (for reservations and other user events)
// ===============================

/**
 * GET /notifications - Obtener todas las notificaciones del usuario autenticado
 * Acceso: Usuarios autenticados
 */
export const getUserNotifications = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    
    if (!user || !user.id) {
      return res.status(401).json({ 
        message: "Usuario no autenticado" 
      });
    }

    console.log(`📬 [USER NOTIFICATIONS] User ${user.email} requesting notifications`);

    // Get all notifications for this user with related reservation data
    const notifications = await prisma.userNotification.findMany({
      where: { userId: user.id },
      include: {
        reservation: {
          include: {
            amenity: {
              select: { id: true, name: true }
            },
            status: {
              select: { name: true, label: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 50 // Limit to last 50 notifications
    });

    // Count unread notifications
    const unreadCount = await prisma.userNotification.count({
      where: { 
        userId: user.id,
        isRead: false 
      }
    });

    // Format notifications
    const formattedNotifications = notifications.map(notification => ({
      id: notification.id.toString(),
      type: notification.notificationType,
      title: notification.title,
      message: notification.message,
      isRead: notification.isRead,
      createdAt: notification.createdAt.toISOString(),
      readAt: notification.readAt?.toISOString() || null,
      reservation: notification.reservation ? {
        id: notification.reservation.id.toString(),
        amenityName: notification.reservation.amenity.name,
        startTime: notification.reservation.startTime.toISOString(),
        endTime: notification.reservation.endTime.toISOString(),
        status: notification.reservation.status.name
      } : null
    }));

    console.log(`✅ [USER NOTIFICATIONS] Retrieved ${formattedNotifications.length} notifications for user ${user.email}, ${unreadCount} unread`);

    res.json({
      notifications: formattedNotifications,
      unreadCount
    });

  } catch (error) {
    console.error('❌ [USER NOTIFICATIONS ERROR]', error);
    res.status(500).json({ 
      message: "Error al obtener notificaciones" 
    });
  }
};

/**
 * POST /notifications/:id/mark-read - Marcar una notificación específica como leída
 * Acceso: Usuarios autenticados
 */
export const markUserNotificationRead = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    if (!user || !user.id) {
      return res.status(401).json({ 
        message: "Usuario no autenticado" 
      });
    }

    if (!id) {
      return res.status(400).json({ message: "ID de notificación es requerido" });
    }

    const notificationId = parseInt(id);
    console.log(`📖 [MARK USER NOTIFICATION READ] User ${user.email} marking notification ${id} as read`);

    // Verify notification exists and belongs to this user
    const existingNotification = await prisma.userNotification.findFirst({
      where: {
        id: notificationId,
        userId: user.id
      }
    });

    if (!existingNotification) {
      return res.status(404).json({ message: "Notificación no encontrada" });
    }

    // If already read, just return current state
    if (existingNotification.isRead) {
      return res.json({
        success: true,
        readAt: existingNotification.readAt?.toISOString()
      });
    }

    // Mark as read
    const now = new Date();
    await prisma.userNotification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: now
      }
    });

    console.log(`✅ [MARK USER NOTIFICATION READ] Notification ${id} marked as read by user ${user.email}`);

    res.json({
      success: true,
      readAt: now.toISOString()
    });

  } catch (error) {
    console.error('❌ [MARK USER NOTIFICATION READ ERROR]', error);
    res.status(500).json({ 
      message: "Error al marcar notificación como leída" 
    });
  }
};

/**
 * POST /notifications/mark-all-read - Marcar todas las notificaciones no leídas como leídas
 * Acceso: Usuarios autenticados
 */
export const markAllUserNotificationsRead = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    if (!user || !user.id) {
      return res.status(401).json({ 
        message: "Usuario no autenticado" 
      });
    }

    console.log(`📖📖 [MARK ALL USER NOTIFICATIONS READ] User ${user.email} marking all notifications as read`);

    const now = new Date();
    
    // Update all unread notifications for this user
    const updateResult = await prisma.userNotification.updateMany({
      where: {
        userId: user.id,
        isRead: false
      },
      data: {
        isRead: true,
        readAt: now
      }
    });

    console.log(`✅ [MARK ALL USER NOTIFICATIONS READ] ${updateResult.count} notifications marked as read by user ${user.email}`);

    res.json({
      success: true,
      readAt: now.toISOString(),
      markedCount: updateResult.count
    });

  } catch (error) {
    console.error('❌ [MARK ALL USER NOTIFICATIONS READ ERROR]', error);
    res.status(500).json({ 
      message: "Error al marcar todas las notificaciones como leídas" 
    });
  }
};

/**
 * DELETE /notifications/:id - Eliminar una notificación específica
 * Acceso: Usuarios autenticados
 */
export const deleteUserNotification = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    if (!user || !user.id) {
      return res.status(401).json({ 
        message: "Usuario no autenticado" 
      });
    }

    if (!id) {
      return res.status(400).json({ message: "ID de notificación es requerido" });
    }

    const notificationId = parseInt(id);
    console.log(`🗑️ [DELETE USER NOTIFICATION] User ${user.email} deleting notification ${id}`);

    // Verify notification exists and belongs to this user
    const existingNotification = await prisma.userNotification.findFirst({
      where: {
        id: notificationId,
        userId: user.id
      }
    });

    if (!existingNotification) {
      return res.status(404).json({ message: "Notificación no encontrada" });
    }

    // Delete notification
    await prisma.userNotification.delete({
      where: { id: notificationId }
    });

    console.log(`✅ [DELETE USER NOTIFICATION] Notification ${id} deleted by user ${user.email}`);

    res.json({
      success: true,
      message: "Notificación eliminada"
    });

  } catch (error) {
    console.error('❌ [DELETE USER NOTIFICATION ERROR]', error);
    res.status(500).json({ 
      message: "Error al eliminar notificación" 
    });
  }
};