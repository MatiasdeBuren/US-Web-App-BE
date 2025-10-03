import { prisma } from "../prismaClient";

/**
 * Servicio para actualizar automáticamente el estado de las reservas
 * Ahora usando la tabla ReservationStatus
 */
export class ReservationStatusService {
  
  // Cache for status IDs to avoid repeated DB queries
  private static statusIds: { [key: string]: number } | null = null;

  /**
   * Inicializa y cachea los IDs de los estados de reserva
   */
  private static async initializeStatusIds(): Promise<void> {
    if (this.statusIds) return;

    try {
      const statuses = await prisma.reservationStatus.findMany({
        select: { id: true, name: true }
      });

      this.statusIds = {};
      statuses.forEach(status => {
        this.statusIds![status.name] = status.id;
      });

      console.log('✅ [RESERVATION SERVICE] Status IDs cached:', this.statusIds);
    } catch (error) {
      console.error("❌ [RESERVATION SERVICE] Error initializing status IDs:", error);
      this.statusIds = null;
    }
  }

  /**
   * Obtiene el ID de un estado por su nombre
   */
  private static async getStatusId(statusName: string): Promise<number | null> {
    await this.initializeStatusIds();
    return this.statusIds?.[statusName] || null;
  }

  /**
   * Actualiza reservas cuyo tiempo ha expirado a estado "finalizada"
   * @returns Número de reservas actualizadas
   */
  static async updateExpiredReservations(): Promise<number> {
    try {
      const now = new Date();
      
      // Verificar conexión de base de datos antes de intentar la actualización
      await prisma.$connect();

      // Obtener IDs de estados
      const confirmadaId = await this.getStatusId('confirmada');
      const finalizadaId = await this.getStatusId('finalizada');

      if (!confirmadaId || !finalizadaId) {
        console.error("❌ [RESERVATION SERVICE] Could not find required status IDs");
        return 0;
      }
      
      // Actualizar reservas confirmadas que ya pasaron su hora de fin
      const result = await prisma.reservation.updateMany({
        where: {
          statusId: confirmadaId, // Estado "confirmada"
          endTime: {
            lt: now // endTime menor que ahora (ya pasó)
          }
        },
        data: {
          statusId: finalizadaId // Cambiar a "finalizada"
        }
      });

      if (result.count > 0) {
        console.log(`✅ [RESERVATION SERVICE] ${result.count} reservas actualizadas a "finalizada"`);
      }

      return result.count;
    } catch (error) {
      // Log del error pero no fallar completamente
      if (error instanceof Error && error.message.includes("Can't reach database server")) {
        console.log("⚠️ [RESERVATION SERVICE] Base de datos temporalmente no disponible, reintentando en el próximo ciclo");
      } else {
        console.error("❌ [RESERVATION SERVICE] Error al actualizar reservas expiradas:", error);
      }
      return 0;
    }
  }

  /**
   * Inicia el servicio de actualización automática
   * Ejecuta la actualización cada 5 minutos
   */
  static startAutoUpdate(): void {
    console.log("🚀 [RESERVATION SERVICE] Iniciando servicio de actualización automática de reservas");
    
    // Ejecutar después de 30 segundos para permitir que la conexión DB se establezca completamente
    setTimeout(() => {
      this.updateExpiredReservations();
    }, 30000);
    
    // Ejecutar cada 5 minutos (300,000 ms)
    setInterval(() => {
      this.updateExpiredReservations();
    }, 5 * 60 * 1000);
  }

  /**
   * Función que se puede llamar manualmente antes de obtener reservas
   * para asegurar que los estados estén actualizados
   */
  static async ensureUpdatedReservations(): Promise<void> {
    await this.updateExpiredReservations();
  }

  /**
   * Inicializa los estados de reserva en la base de datos si no existen
   */
  static async initializeReservationStatuses(): Promise<void> {
    try {
      const statuses = [
        { name: 'pendiente', label: 'Pendiente' },
        { name: 'confirmada', label: 'Confirmada' },
        { name: 'cancelada', label: 'Cancelada' },
        { name: 'finalizada', label: 'Finalizada' }
      ];

      for (const status of statuses) {
        await prisma.reservationStatus.upsert({
          where: { name: status.name },
          update: { label: status.label },
          create: status
        });
      }

      console.log('✅ [RESERVATION SERVICE] Reservation statuses initialized');
      
      // Reset cache to pick up new/updated statuses
      this.statusIds = null;
      
    } catch (error) {
      console.error("❌ [RESERVATION SERVICE] Error initializing reservation statuses:", error);
    }
  }
}