import type { Request, Response } from "express";
import { prisma } from "../prismaClient";

/**
 * GET /claims/:id/adhesions - Obtener adhesiones de un claim específico
 * Acceso: Usuarios autenticados
 */
export const getClaimAdhesions = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const claimId = parseInt(id || "");
    if (isNaN(claimId)) {
      return res.status(400).json({ message: "ID de claim inválido" });
    }

    // Verificar que el claim existe
    const claim = await prisma.claim.findUnique({
      where: { id: claimId },
      select: { id: true, subject: true }
    });

    if (!claim) {
      return res.status(404).json({ message: "Claim no encontrado" });
    }

    // Obtener conteos de adhesiones
    const [supportCount, disagreeCount, userAdhesion] = await Promise.all([
      prisma.claimAdhesion.count({
        where: { claimId, isSupport: true }
      }),
      prisma.claimAdhesion.count({
        where: { claimId, isSupport: false }
      }),
      prisma.claimAdhesion.findUnique({
        where: {
          unique_user_claim_adhesion: {
            claimId,
            userId
          }
        },
        select: { isSupport: true }
      })
    ]);

    console.log(`📊 [CLAIM ADHESIONS] Claim ${claimId}: Support=${supportCount}, Disagree=${disagreeCount}, User=${userAdhesion?.isSupport !== undefined ? (userAdhesion.isSupport ? 'support' : 'disagree') : 'none'}`);

    res.json({
      total_support: supportCount,
      total_disagree: disagreeCount,
      user_adhesion: userAdhesion?.isSupport
    });

  } catch (error) {
    console.error("❌ [GET CLAIM ADHESIONS ERROR]", error);
    res.status(500).json({ message: "Error al obtener adhesiones del claim" });
  }
};


export const createOrUpdateClaimAdhesion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { adhesion_type } = req.body;
    const userId = (req as any).user?.id;
    const userEmail = (req as any).user?.email;

    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const claimId = parseInt(id || "");
    if (isNaN(claimId)) {
      return res.status(400).json({ message: "ID de claim inválido" });
    }

    // Validar adhesion_type
    if (adhesion_type === undefined || typeof adhesion_type !== 'boolean') {
      return res.status(400).json({ 
        message: "adhesion_type debe ser un booleano: true (support) o false (disagree)" 
      });
    }

    // Verificar que el claim existe y obtener info del creador
    const claim = await prisma.claim.findUnique({
      where: { id: claimId },
      select: { id: true, subject: true, userId: true }
    });

    if (!claim) {
      return res.status(404).json({ message: "Claim no encontrado" });
    }

    // REGLA DE NEGOCIO: El creador del claim NO puede adherirse a su propio reclamo
    if (claim.userId === userId) {
      console.log(`🚨 [CLAIM ADHESION] User ${userEmail} tried to adhere to their own claim ${claimId}`);
      return res.status(403).json({ 
        message: "No puedes adherirte a tu propio reclamo" 
      });
    }

    // Crear o actualizar adhesión usando upsert
    const adhesion = await prisma.claimAdhesion.upsert({
      where: {
        unique_user_claim_adhesion: {
          claimId,
          userId
        }
      },
      update: {
        isSupport: adhesion_type,
        updatedAt: new Date()
      },
      create: {
        claimId,
        userId,
        isSupport: adhesion_type
      }
    });

    const action = adhesion.createdAt.getTime() === adhesion.updatedAt.getTime() ? "creada" : "actualizada";
    const adhesionTypeStr = adhesion_type ? 'support' : 'disagree';
    
    console.log(`✅ [CLAIM ADHESION] User ${userEmail} ${action} adhesión '${adhesionTypeStr}' to claim ${claimId}`);

    res.status(200).json({
      message: `Adhesión ${action}`,
      adhesion_type: adhesion_type
    });

  } catch (error) {
    console.error("❌ [CREATE CLAIM ADHESION ERROR]", error);
    res.status(500).json({ message: "Error al registrar adhesión" });
  }
};

/**
 * DELETE /claims/:id/adhesions - Eliminar adhesión de un claim
 * Acceso: Usuarios autenticados
 */
export const deleteClaimAdhesion = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    const userEmail = (req as any).user?.email;

    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const claimId = parseInt(id || "");
    if (isNaN(claimId)) {
      return res.status(400).json({ message: "ID de claim inválido" });
    }

    // Verificar que el claim existe
    const claim = await prisma.claim.findUnique({
      where: { id: claimId },
      select: { id: true, subject: true }
    });

    if (!claim) {
      return res.status(404).json({ message: "Claim no encontrado" });
    }

    // Verificar que existe una adhesión del usuario
    const existingAdhesion = await prisma.claimAdhesion.findUnique({
      where: {
        unique_user_claim_adhesion: {
          claimId,
          userId
        }
      }
    });

    if (!existingAdhesion) {
      return res.status(404).json({ message: "No tienes adhesión registrada para este claim" });
    }

    // Eliminar la adhesión
    await prisma.claimAdhesion.delete({
      where: {
        unique_user_claim_adhesion: {
          claimId,
          userId
        }
      }
    });

    console.log(`🗑️ [CLAIM ADHESION] User ${userEmail} removed adhesion from claim ${claimId}`);

    res.status(200).json({
      message: "Adhesión eliminada"
    });

  } catch (error) {
    console.error("❌ [DELETE CLAIM ADHESION ERROR]", error);
    res.status(500).json({ message: "Error al eliminar adhesión" });
  }
};