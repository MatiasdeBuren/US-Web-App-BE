import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../prismaClient";

interface JWTPayload {
  id: number;
  email: string;
  role?: string;
}

const logSecurityEvent = (
  event: "UNAUTHORIZED_ADMIN_ACCESS" | "ADMIN_ACCESS_SUCCESS" | "INVALID_TOKEN",
  req: Request,
  userId?: number,
  userEmail?: string
) => {
  const timestamp = new Date().toISOString();
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const userAgent = req.get("User-Agent") || "unknown";
  const endpoint = req.originalUrl;
  
  console.log(`🚨 [SECURITY LOG] ${timestamp} - ${event}`, {
    userId: userId || "unknown",
    userEmail: userEmail || "unknown",
    endpoint,
    ip,
    userAgent,
    method: req.method
  });
};

export const validateAdmin = async (req: Request, res: Response, next: NextFunction) => {
  console.log(`🔍 [ADMIN MIDDLEWARE] Iniciando validación para ${req.method} ${req.originalUrl}`);
  try {
    const authHeader = req.headers.authorization;
    console.log(`🔍 [ADMIN MIDDLEWARE] AuthHeader presente: ${!!authHeader}`);
    
    if (!authHeader) {
      logSecurityEvent("UNAUTHORIZED_ADMIN_ACCESS", req);
      return res.status(401).json({ 
        message: "Endpoint protegido, se requiere autenticación" 
      });
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      logSecurityEvent("INVALID_TOKEN", req);
      return res.status(401).json({ 
        message: "Formato de encabezado de autorización no válido" 
      });
    }

    const token = parts[1];
    if (!token) {
      logSecurityEvent("UNAUTHORIZED_ADMIN_ACCESS", req);
      return res.status(401).json({ 
        message: "Token missing" 
      });
    }

    let payload: JWTPayload;
    try {
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        console.error("❌ JWT_SECRET no está definido en las variables de entorno");
        throw new Error("JWT_SECRET not configured");
      }
      payload = jwt.verify(token, jwtSecret) as JWTPayload;
    } catch (err) {
      console.error("❌ Error al verificar JWT:", err);
      logSecurityEvent("INVALID_TOKEN", req);
      return res.status(401).json({ 
        message: "Token inválido o expirado" 
      });
    }

    console.log(`🔍 [ADMIN MIDDLEWARE] Consultando usuario ID: ${payload.id}`);
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        email: true,
        role: true,
        name: true
      }
    });
    console.log(`🔍 [ADMIN MIDDLEWARE] Usuario encontrado:`, user ? { id: user.id, email: user.email, role: user.role } : null);

    if (!user) {
      logSecurityEvent("UNAUTHORIZED_ADMIN_ACCESS", req, payload.id, payload.email);
      return res.status(401).json({ 
        message: "Usuario no encontrado" 
      });
    }

    if (user.role !== "admin") {
      logSecurityEvent("UNAUTHORIZED_ADMIN_ACCESS", req, user.id, user.email);
      return res.status(403).json({ 
        message: "Se requiere acceso de administrador. Intento no autorizado registrado." 
      });
    }

    logSecurityEvent("ADMIN_ACCESS_SUCCESS", req, user.id, user.email);

    (req as any).user = user;
    (req as any).userId = user.id; 
    
    next();

  } catch (error) {
    console.error("❌ [ADMIN MIDDLEWARE ERROR] Detalles completos:", {
      error: error,
      message: error instanceof Error ? error.message : 'Error desconocido',
      stack: error instanceof Error ? error.stack : 'Sin stack trace',
      timestamp: new Date().toISOString(),
      endpoint: req.originalUrl,
      method: req.method
    });
    logSecurityEvent("UNAUTHORIZED_ADMIN_ACCESS", req);
    
    return res.status(500).json({ 
      message: "Error interno del servidor al verificar admin" 
    });
  }
};


export const ensureAdminExists = async (): Promise<boolean> => {
  try {
    const adminCount = await prisma.user.count({
      where: { role: "admin" }
    });
    return adminCount > 0;
  } catch (error) {
    console.error("❌ Error checking admin existence:", error);
    return false;
  }
};


export const wouldBeLastAdmin = async (userId: number): Promise<boolean> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });

    if (user?.role !== "admin") {
      return false;
    }

    const adminCount = await prisma.user.count({
      where: { role: "admin" }
    });

    return adminCount === 1; 
  } catch (error) {
    console.error("❌ Error checking if would be last admin:", error);
    return true; 
  }
};