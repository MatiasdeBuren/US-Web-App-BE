import type { Request, Response } from "express";
import { prisma} from "../prismaClient.ts";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { emailService } from "../services/emailService.ts";




// ---------------- REGISTER ----------------
export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Es necesario completar todos los campos" });
    }

    const userExists = await prisma.user.findUnique({ where: { email } });
    if (userExists) return res.status(400).json({ message: "El usuario ya existe" });

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: {
        name,
        email,
        password: passwordHash
      }
    });

    res.status(201).json({ message: "Usuario registrado con éxito" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Error interno del servidor" });
    }
};

// ---------------- LOGIN ----------------
export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "El email y la contraseña son obligatorios" });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(401).json({ message: "Credenciales inválidas" });

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) return res.status(401).json({ message: "Credenciales inválidas" });

  // ✅ Create JWT
  const token = jwt.sign(
    {id: user.id, email: user.email, name: user.name },
    process.env.JWT_SECRET!, // must be set in .env
    { expiresIn: "120m" }
  );

  res.json({ message: "Login successful", token });
};

// ---------------- FORGOT PASSWORD ----------------
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: "El email es obligatorio" });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Don't reveal whether user exists or not for security
      return res.json({ message: "Si el correo existe, se ha enviado un enlace de recuperación" });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

    // Save reset token to database
    await prisma.user.update({
      where: { email },
      data: {
        resetPasswordToken: resetToken,
        resetPasswordExpires: resetTokenExpiry
      }
    });

    // Send password reset email
    try {
      await emailService.sendPasswordResetEmail(email, resetToken, user.name);
      console.log(`Password reset email sent to: ${email}`);
    } catch (emailError) {
      console.error('Failed to send password reset email:', emailError);
      
      // For development, log the reset link if email fails
      if (process.env.NODE_ENV === 'development') {
        console.log(`\n🔗 PASSWORD RESET LINK (Email failed, use this link):`);
        console.log(`${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`);
        console.log(`This link expires in 1 hour.\n`);
      }
      
      // Clear the reset token if email fails
      await prisma.user.update({
        where: { email },
        data: {
          resetPasswordToken: null,
          resetPasswordExpires: null
        }
      });
      
      return res.status(500).json({ message: "Error al enviar el correo de recuperación" });
    }

    res.json({ 
      message: "Si el correo existe, se ha enviado un enlace de recuperación"
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: "Error al procesar la solicitud" });
  }
};

// ---------------- RESET PASSWORD ----------------
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    
    if (!token || !newPassword) {
      return res.status(400).json({ message: "Se requiere un token y nueva contraseña" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres" });
    }

    // Find user with valid reset token
    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: token,
        resetPasswordExpires: {
          gt: new Date() // Token must not be expired
        }
      }
    });

    if (!user) {
      return res.status(400).json({ message: "Token de restablecimiento inválido o expirado" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update user password and clear reset token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null
      }
    });

    res.json({ message: "Contraseña restablecida con éxito" });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: "Error al procesar la solicitud" });
  }
};

// ---------------- TEST EMAIL (Development only) ----------------
export const testEmail = async (req: Request, res: Response) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ message: "Not found" });
    }

    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Test email connectivity
    const isConnected = await emailService.testConnection();
    if (!isConnected) {
      return res.status(500).json({ message: "Email service not configured properly" });
    }

    // Send test email
    await emailService.sendPasswordResetEmail(email, "test-token-123", "Test User");
    
    res.json({ message: "Test email sent successfully" });
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({ message: "Failed to send test email" });
  }
};
