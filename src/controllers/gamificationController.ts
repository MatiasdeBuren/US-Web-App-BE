import type { Request, Response } from "express";
import { prisma } from "../prismaClient";



const POINT_ACTIONS = {

  RESERVATION_COMPLETED: { points: 50, description: "Reserva completada" },
  RESERVATION_CANCELLED: { points: -10, description: "Reserva cancelada" },
  

  RATING_GIVEN: { points: 30, description: "Calificación otorgada" },
  

  CLAIM_CREATED: { points: 20, description: "Reclamo creado" },
  CLAIM_RESOLVED: { points: 40, description: "Reclamo resuelto" },
  CLAIM_REJECTED: { points: -5, description: "Reclamo rechazado" },
  

  ADHESION_GIVEN: { points: 5, description: "Adhesión a reclamo" },
  ADHESION_RECEIVED: { points: 10, description: "Adhesión recibida en tu reclamo" },
  NEGATIVE_ADHESION_RECEIVED: { points: -5, description: "Adhesión negativa recibida" },
  
  DAILY_LOGIN: { points: 10, description: "Inicio de sesión diario" },
  STREAK_BONUS_7: { points: 50, description: "Bonus por 7 días consecutivos" },
  STREAK_BONUS_30: { points: 200, description: "Bonus por 30 días consecutivos" },
} as const;

type PointAction = keyof typeof POINT_ACTIONS;


export async function initializeUserGamification(userId: number) {
  try {
    
    const existing = await prisma.userGamification.findUnique({
      where: { userId }
    });

    if (existing) return existing;


    const userGamification = await prisma.userGamification.create({
      data: {
        userId,
        totalPoints: 0,
        levelId: 1, // Nivel inicial (Bronce)
        selectedThemeId: 1, // Tema por defecto
        selectedFrameId: 1, // Sin marco
        selectedEffectId: 1, // Sin efecto
        consecutiveDays: 0,
      },
      include: {
        level: true,
        selectedTheme: true,
        selectedFrame: true,
        selectedEffect: true,
        selectedTitle: true,
      }
    });

    return userGamification;
  } catch (error) {
    console.error("Error inicializando gamificación:", error);
    throw error;
  }
}


export async function addPoints(
  userId: number,
  action: PointAction,
  metadata?: { reservationId?: number; claimId?: number; ratingId?: number }
) {
  try {
    
    let userGamification = await prisma.userGamification.findUnique({
      where: { userId }
    });

    if (!userGamification) {
      await initializeUserGamification(userId);
      userGamification = await prisma.userGamification.findUnique({
        where: { userId },
        include: {
          level: true,
          selectedTheme: true,
          selectedFrame: true,
          selectedEffect: true,
          selectedTitle: true,
          achievements: {
            include: {
              achievement: {
                include: {
                  category: true,
                  rarity: true
                }
              }
            },
            orderBy: {
              unlockedAt: 'desc'
            }
          },
          favoriteBadges: {
            orderBy: {
              displayOrder: 'asc'
            }
          }
        }
      });
    }

    const actionConfig = POINT_ACTIONS[action];
    const pointsToAdd = actionConfig.points;


    const updatedGamification = await prisma.userGamification.update({
      where: { userId },
      data: {
        totalPoints: {
          increment: pointsToAdd
        }
      }
    });


    await prisma.pointTransaction.create({
      data: {
        userId,
        points: pointsToAdd,
        action,
        description: actionConfig.description,
        reservationId: metadata?.reservationId,
        claimId: metadata?.claimId,
        ratingId: metadata?.ratingId,
      }
    });


    await checkAndUpdateLevel(userId);

    await checkAchievements(userId, action);

    return updatedGamification;
  } catch (error) {
    console.error("Error agregando puntos:", error);
    throw error;
  }
}


async function checkAndUpdateLevel(userId: number) {
  try {
    const userGamification = await prisma.userGamification.findUnique({
      where: { userId },
      include: { level: true }
    });

    if (!userGamification) return;


    const levels = await prisma.gamificationLevel.findMany({
      orderBy: { order: 'asc' }
    });


    let newLevel = levels[0]; // Por defecto, el primer nivel

    for (const level of levels) {
      if (userGamification.totalPoints >= level.minPoints) {
        if (level.maxPoints === null || userGamification.totalPoints <= level.maxPoints) {
          newLevel = level;
          break;
        }
      }
    }


    if (newLevel.id !== userGamification.levelId) {
      await prisma.userGamification.update({
        where: { userId },
        data: { levelId: newLevel.id }
      });

      console.log(`Usuario ${userId} subió a nivel ${newLevel.displayName}!`);
      
    }
  } catch (error) {
    console.error("Error actualizando nivel:", error);
  }
}


async function checkAchievements(userId: number, action: PointAction) {
  try {
    const userGamification = await prisma.userGamification.findUnique({
      where: { userId }
    });

    if (!userGamification) return;


    const achievements = await prisma.achievement.findMany({
      where: { isActive: true }
    });

    for (const achievement of achievements) {

      const hasAchievement = await prisma.userAchievement.findUnique({
        where: {
          userId_achievementId: {
            userId,
            achievementId: achievement.id
          }
        }
      });


      if (hasAchievement && !achievement.isRepeatable) continue;


      let shouldUnlock = false;

      if (achievement.requiredAction) {

        switch (achievement.requiredAction) {
          case "complete_1_reservation":
            shouldUnlock = userGamification.reservationsCompleted >= 1;
            break;
          case "complete_5_reservations":
            shouldUnlock = userGamification.reservationsCompleted >= 5;
            break;
          case "complete_10_reservations":
            shouldUnlock = userGamification.reservationsCompleted >= 10;
            break;
          case "give_1_rating":
            shouldUnlock = userGamification.ratingsGiven >= 1;
            break;
          case "give_5_ratings":
            shouldUnlock = userGamification.ratingsGiven >= 5;
            break;
          case "create_1_claim":
            shouldUnlock = userGamification.claimsCreated >= 1;
            break;
          case "create_5_claims":
            shouldUnlock = userGamification.claimsCreated >= 5;
            break;
          case "resolve_1_claim":
            shouldUnlock = userGamification.claimsResolved >= 1;
            break;
          case "streak_7_days":
            shouldUnlock = userGamification.consecutiveDays >= 7;
            break;
          case "streak_30_days":
            shouldUnlock = userGamification.consecutiveDays >= 30;
            break;
          case "reach_100_points":
            shouldUnlock = userGamification.totalPoints >= 100;
            break;
          case "reach_500_points":
            shouldUnlock = userGamification.totalPoints >= 500;
            break;
          case "reach_1000_points":
            shouldUnlock = userGamification.totalPoints >= 1000;
            break;
        }
      }


      if (shouldUnlock) {
        if (hasAchievement && achievement.isRepeatable) {
          await prisma.userAchievement.update({
            where: {
              userId_achievementId: {
                userId,
                achievementId: achievement.id
              }
            },
            data: {
              timesEarned: {
                increment: 1
              }
            }
          });
        } else if (!hasAchievement) {

          await prisma.userAchievement.create({
            data: {
              userId,
              achievementId: achievement.id,
              timesEarned: 1
            }
          });


          if (achievement.pointsReward > 0) {
            await prisma.userGamification.update({
              where: { userId },
              data: {
                totalPoints: {
                  increment: achievement.pointsReward
                }
              }
            });

            await prisma.pointTransaction.create({
              data: {
                userId,
                points: achievement.pointsReward,
                action: `ACHIEVEMENT_${achievement.key}`,
                description: `Logro desbloqueado: ${achievement.displayName}`
              }
            });
          }

          console.log(`Usuario ${userId} desbloqueó: ${achievement.displayName}!`);
          

        }
      }
    }
  } catch (error) {
    console.error("Error verificando achievements:", error);
  }
}


async function updateUserStats(
  userId: number,
  statType: 'reservationsCompleted' | 'reservationsCancelled' | 'ratingsGiven' | 
            'claimsCreated' | 'claimsResolved' | 'claimsRejected' | 
            'adhesionsGiven' | 'adhesionsReceived' | 'negativeAdhesions',
  increment: number = 1
) {
  try {

    let userGamification = await prisma.userGamification.findUnique({
      where: { userId }
    });

    if (!userGamification) {
      await initializeUserGamification(userId);
      userGamification = await prisma.userGamification.findUnique({
        where: { userId },
        include: { level: true }
      });
    }

    await prisma.userGamification.update({
      where: { userId },
      data: {
        [statType]: {
          increment
        }
      }
    });
  } catch (error) {
    console.error("Error actualizando estadísticas:", error);
  }
}


async function updateDailyStreak(userId: number) {
  try {
    const userGamification = await prisma.userGamification.findUnique({
      where: { userId }
    });

    if (!userGamification) {
      await initializeUserGamification(userId);
      return;
    }

    const now = new Date();
    const lastLogin = userGamification.lastLoginDate;

    if (!lastLogin) {
      // Primer login
      await prisma.userGamification.update({
        where: { userId },
        data: {
          consecutiveDays: 1,
          lastLoginDate: now
        }
      });
      await addPoints(userId, "DAILY_LOGIN");
      return;
    }


    const daysDiff = Math.floor(
      (now.getTime() - lastLogin.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysDiff === 0) {

      return;
    } else if (daysDiff === 1) {

      const newStreak = userGamification.consecutiveDays + 1;
      
      await prisma.userGamification.update({
        where: { userId },
        data: {
          consecutiveDays: newStreak,
          lastLoginDate: now
        }
      });

      await addPoints(userId, "DAILY_LOGIN");


      if (newStreak === 7) {
        await addPoints(userId, "STREAK_BONUS_7");
      } else if (newStreak === 30) {
        await addPoints(userId, "STREAK_BONUS_30");
      }
    } else {

      await prisma.userGamification.update({
        where: { userId },
        data: {
          consecutiveDays: 1,
          lastLoginDate: now
        }
      });
      await addPoints(userId, "DAILY_LOGIN");
    }
  } catch (error) {
    console.error("Error actualizando racha diaria:", error);
  }
}


export async function getGamificationProfile(req: Request, res: Response) {
  try {
    const userId = parseInt(req.params.userId);

    if (isNaN(userId)) {
      return res.status(400).json({ message: "ID de usuario inválido" });
    }

    let userGamification = await prisma.userGamification.findUnique({
      where: { userId },
      include: {
        level: true,
        selectedTheme: true,
        selectedFrame: true,
        selectedEffect: true,
        selectedTitle: true,
        achievements: {
          include: {
            achievement: {
              include: {
                category: true,
                rarity: true
              }
            }
          },
          orderBy: {
            unlockedAt: 'desc'
          }
        },
        favoriteBadges: {
          orderBy: {
            displayOrder: 'asc'
          }
        }
      }
    });

    if (!userGamification) {
      await initializeUserGamification(userId);
      
      // Volver a buscar con todas las relaciones
      userGamification = await prisma.userGamification.findUnique({
        where: { userId },
        include: {
          level: true,
          selectedTheme: true,
          selectedFrame: true,
          selectedEffect: true,
          selectedTitle: true,
          achievements: {
            include: {
              achievement: {
                include: {
                  category: true,
                  rarity: true
                }
              }
            },
            orderBy: {
              unlockedAt: 'desc'
            }
          },
          favoriteBadges: {
            orderBy: {
              displayOrder: 'asc'
            }
          }
        }
      });
    }

    res.json(userGamification);
  } catch (error) {
    console.error("Error obteniendo perfil de gamificación:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
}

export async function getLeaderboard(req: Request, res: Response) {
  try {
    const { month } = req.query;
    

    const targetMonth = month 
      ? String(month)
      : new Date().toISOString().slice(0, 7); // YYYY-MM

    const leaderboard = await prisma.monthlyLeaderboard.findMany({
      where: { month: targetMonth },
      include: {
        level: true
      },
      orderBy: {
        rank: 'asc'
      },
      take: 100 // Top 100
    });

    res.json(leaderboard);
  } catch (error) {
    console.error("Error obteniendo leaderboard:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
}


export async function getAllAchievements(req: Request, res: Response) {
  try {
    const achievements = await prisma.achievement.findMany({
      where: { isActive: true },
      include: {
        category: true,
        rarity: true
      },
      orderBy: [
        { categoryId: 'asc' },
        { rarityId: 'asc' }
      ]
    });

    res.json(achievements);
  } catch (error) {
    console.error("Error obteniendo achievements:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
}


export async function getCustomizationOptions(req: Request, res: Response) {
  try {
    const userId = parseInt(req.params.userId);

    if (isNaN(userId)) {
      return res.status(400).json({ message: "ID de usuario inválido" });
    }

    const userGamification = await prisma.userGamification.findUnique({
      where: { userId },
      include: { level: true }
    });

    if (!userGamification) {
      return res.status(404).json({ message: "Perfil de gamificación no encontrado" });
    }

    const userLevelOrder = userGamification.level.order;


    const [themes, frames, effects, titles] = await Promise.all([
      prisma.gamificationTheme.findMany({
        where: {
          isActive: true,
          requiredLevel: {
            order: { lte: userLevelOrder }
          }
        },
        include: { requiredLevel: true },
        orderBy: { order: 'asc' }
      }),
      prisma.gamificationFrame.findMany({
        where: {
          isActive: true,
          requiredLevel: {
            order: { lte: userLevelOrder }
          }
        },
        include: { requiredLevel: true },
        orderBy: { order: 'asc' }
      }),
      prisma.gamificationEffect.findMany({
        where: {
          isActive: true,
          requiredLevel: {
            order: { lte: userLevelOrder }
          }
        },
        include: { requiredLevel: true },
        orderBy: { order: 'asc' }
      }),
      prisma.gamificationTitle.findMany({
        where: {
          isActive: true,
          requiredLevel: {
            order: { lte: userLevelOrder }
          }
        },
        include: { requiredLevel: true }
      })
    ]);

    res.json({
      themes,
      frames,
      effects,
      titles,
      currentLevel: userGamification.level
    });
  } catch (error) {
    console.error("Error obteniendo opciones de customización:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
}

/**
 * PUT /api/gamification/customize
 * Actualiza la customización del perfil del usuario
 */
export async function updateCustomization(req: Request, res: Response) {
  try {
    const userId = (req as any).user.id; // Del middleware de auth
    const { themeId, frameId, effectId, titleId, customTitleText } = req.body;

    const userGamification = await prisma.userGamification.findUnique({
      where: { userId },
      include: { level: true }
    });

    if (!userGamification) {
      return res.status(404).json({ message: "Perfil de gamificación no encontrado" });
    }

    const userLevelOrder = userGamification.level.order;


    const validations = [];

    if (themeId) {
      const theme = await prisma.gamificationTheme.findUnique({
        where: { id: themeId },
        include: { requiredLevel: true }
      });
      if (!theme || theme.requiredLevel.order > userLevelOrder) {
        return res.status(403).json({ message: "Tema no desbloqueado" });
      }
      validations.push({ selectedThemeId: themeId });
    }

    if (frameId) {
      const frame = await prisma.gamificationFrame.findUnique({
        where: { id: frameId },
        include: { requiredLevel: true }
      });
      if (!frame || frame.requiredLevel.order > userLevelOrder) {
        return res.status(403).json({ message: "Marco no desbloqueado" });
      }
      validations.push({ selectedFrameId: frameId });
    }

    if (effectId) {
      const effect = await prisma.gamificationEffect.findUnique({
        where: { id: effectId },
        include: { requiredLevel: true }
      });
      if (!effect || effect.requiredLevel.order > userLevelOrder) {
        return res.status(403).json({ message: "Efecto no desbloqueado" });
      }
      validations.push({ selectedEffectId: effectId });
    }

    if (titleId) {
      const title = await prisma.gamificationTitle.findUnique({
        where: { id: titleId },
        include: { requiredLevel: true }
      });
      if (!title || title.requiredLevel.order > userLevelOrder) {
        return res.status(403).json({ message: "Título no desbloqueado" });
      }
      validations.push({ selectedTitleId: titleId });
    }


    const updateData: any = {};
    validations.forEach(v => Object.assign(updateData, v));
    
    if (customTitleText !== undefined) {
      updateData.customTitleText = customTitleText;
    }

    const updated = await prisma.userGamification.update({
      where: { userId },
      data: updateData,
      include: {
        selectedTheme: true,
        selectedFrame: true,
        selectedEffect: true,
        selectedTitle: true
      }
    });

    res.json(updated);
  } catch (error) {
    console.error("Error actualizando customización:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
}

export async function getPointTransactions(req: Request, res: Response) {
  try {
    const userId = parseInt(req.params.userId);
    const { limit = 50, offset = 0 } = req.query;

    if (isNaN(userId)) {
      return res.status(400).json({ message: "ID de usuario inválido" });
    }

    const transactions = await prisma.pointTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset)
    });

    const total = await prisma.pointTransaction.count({
      where: { userId }
    });

    res.json({
      transactions,
      total,
      limit: Number(limit),
      offset: Number(offset)
    });
  } catch (error) {
    console.error("Error obteniendo transacciones:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
}


export { POINT_ACTIONS, addPoints as awardPoints, updateUserStats, updateDailyStreak };
