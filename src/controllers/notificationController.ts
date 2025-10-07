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
    const formattedNotifications = notifications.map(notification => ({
      id: notification.id.toString(),
      type: notification.notificationType,
      isRead: notification.isRead,
      createdAt: notification.createdAt.toISOString(),
      readAt: notification.readAt?.toISOString() || null,
      claim: {
        id: notification.claim.id.toString(),
        title: notification.claim.subject,
        priority: notification.claim.priority.name,
        user: {
          // Show "Anónimo" if claim is anonymous, otherwise show real name
          name: notification.claim.isAnonymous ? 'Anónimo' : notification.claim.user.name
        }
      }
    }));

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