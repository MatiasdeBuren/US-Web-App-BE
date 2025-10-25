import { prisma } from "../prismaClient";


export class ReservationStatusService {

  private static statusIds: { [key: string]: number } | null = null;

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

  private static async getStatusId(statusName: string): Promise<number | null> {
    await this.initializeStatusIds();
    return this.statusIds?.[statusName] || null;
  }

  static async updateExpiredReservations(): Promise<number> {
    try {
      const now = new Date();
      
      await prisma.$connect();
      const confirmadaId = await this.getStatusId('confirmada');
      const finalizadaId = await this.getStatusId('finalizada');

      if (!confirmadaId || !finalizadaId) {
        console.error("❌ [RESERVATION SERVICE] Could not find required status IDs");
        return 0;
      }
      
      const result = await prisma.reservation.updateMany({
        where: {
          statusId: confirmadaId, 
          endTime: {
            lt: now
          }
        },
        data: {
          statusId: finalizadaId 
        }
      });

      if (result.count > 0) {
        console.log(`✅ [RESERVATION SERVICE] ${result.count} reservas actualizadas a "finalizada"`);
      }

      return result.count;
    } catch (error) {
      
      if (error instanceof Error && error.message.includes("Can't reach database server")) {
        console.log("⚠️ [RESERVATION SERVICE] Base de datos temporalmente no disponible, reintentando en el próximo ciclo");
      } else {
        console.error("❌ [RESERVATION SERVICE] Error al actualizar reservas expiradas:", error);
      }
      return 0;
    }
  }

  static startAutoUpdate(): void {
    console.log("🚀 [RESERVATION SERVICE] Iniciando servicio de actualización automática de reservas");
    
    setTimeout(() => {
      this.updateExpiredReservations();
    }, 30000);

    setInterval(() => {
      this.updateExpiredReservations();
    }, 5 * 60 * 1000);
  }

  static async ensureUpdatedReservations(): Promise<void> {
    await this.updateExpiredReservations();
  }

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
      
      this.statusIds = null;
      
    } catch (error) {
      console.error("❌ [RESERVATION SERVICE] Error initializing reservation statuses:", error);
    }
  }
}