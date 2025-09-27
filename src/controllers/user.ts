import type { Request, Response } from "express";
import { prisma } from "../prismaClient";
import bcrypt from "bcrypt";

// PATCH /user/name – Actualizar nombre de usuario
export const updateUserName = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { name } = req.body;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ message: "Invalid name" });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { name },
      select: { id: true, name: true, email: true },
    });

    res.json({ message: "Name updated successfully", user: updatedUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// PATCH /user/password – Cambiar contraseña
export const updateUserPassword = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { currentPassword, newPassword } = req.body;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Missing parameters" });
    }

    // Buscar al usuario para verificar contraseña actual
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(403).json({ message: "La contraseña actual es incorrecta" });

    // Hashear nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    res.json({ message: "Contraseña actualizada con éxito" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al procesar la solicitud" });
  }
};

// DELETE /user – Delete user account
export const deleteUser = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // Check if user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: "User not found" });

    // Delete user's reservations first (due to foreign key constraints)
    await prisma.reservation.deleteMany({
      where: { userId: userId }
    });

    // Delete the user
    await prisma.user.delete({
      where: { id: userId }
    });

    res.json({ message: "Cuenta de usuario eliminada con éxito" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al procesar la solicitud" });
  }
};
