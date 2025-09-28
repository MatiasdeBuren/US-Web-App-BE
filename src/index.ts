import express from "express";
import cors from "cors";
import authRoutes from "./routes/authRoutes";
import { requireAuth } from "./auth_middleware";
import amenityRoutes from "./routes/get_ammenities";
import reservationRoutes from "./routes/reservations";
import userRoutes from "./routes/user";

import apartmentRoutes from "./routes/apartmentRoutes";
import claimRoutes from "./routes/claimRoutes";

import adminRoutes from "./routes/adminRoutes";

import { emailService } from "./services/emailService";
import { prisma } from "./prismaClient";

const app = express();
const PORT = parseInt(process.env.PORT || '3000');

app.use(cors());
app.use(express.json());

// Test email service connection on startup
emailService.testConnection().then(isConnected => {
  if (isConnected) {
    console.log('✅ Email service is ready');
  } else {
    console.log('⚠️ Email service connection failed - check your configuration');
  }
}).catch(error => {
  console.log('⚠️ Email service initialization error:', error.message);
});

// Routes
app.use("/auth", authRoutes);
app.use("/amenities", amenityRoutes);
app.use("/reservations", reservationRoutes);
app.use("/user", userRoutes);

app.use("/apartments", apartmentRoutes);
app.use("/claims", claimRoutes);

app.use("/admin", adminRoutes); // 🔒 Rutas de administración



// Protected route - Dashboard con role actualizado desde BD
app.get("/dashboard", requireAuth, async (req, res) => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({ message: "User ID not found in token" });
        }

        // Consultar BD para obtener información actualizada del usuario incluido el role
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                apartmentId: true
            }
        });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({ 
            message: "Dashboard access granted", 
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                apartmentId: user.apartmentId
            }
        });
    } catch (error) {
        console.error("❌ Dashboard error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});


app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
