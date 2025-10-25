import { prisma } from "../prismaClient";


export class ClaimLookupService {
  
  
  private static categoryIds: { [key: string]: number } | null = null;
  private static priorityIds: { [key: string]: number } | null = null;
  private static statusIds: { [key: string]: number } | null = null;


  private static async initializeCategoryIds(): Promise<void> {
    if (this.categoryIds) return;

    try {
      const categories = await prisma.claimCategory.findMany({
        select: { id: true, name: true }
      });

      this.categoryIds = {};
      categories.forEach(category => {
        this.categoryIds![category.name] = category.id;
      });

      console.log('✅ [CLAIM SERVICE] Category IDs cached:', this.categoryIds);
    } catch (error) {
      console.error("❌ [CLAIM SERVICE] Error initializing category IDs:", error);
      this.categoryIds = null;
    }
  }


  private static async initializePriorityIds(): Promise<void> {
    if (this.priorityIds) return;

    try {
      const priorities = await prisma.claimPriority.findMany({
        select: { id: true, name: true }
      });

      this.priorityIds = {};
      priorities.forEach(priority => {
        this.priorityIds![priority.name] = priority.id;
      });

      console.log('✅ [CLAIM SERVICE] Priority IDs cached:', this.priorityIds);
    } catch (error) {
      console.error("❌ [CLAIM SERVICE] Error initializing priority IDs:", error);
      this.priorityIds = null;
    }
  }

 
  private static async initializeStatusIds(): Promise<void> {
    if (this.statusIds) return;

    try {
      const statuses = await prisma.claimStatus.findMany({
        select: { id: true, name: true }
      });

      this.statusIds = {};
      statuses.forEach(status => {
        this.statusIds![status.name] = status.id;
      });

      console.log('✅ [CLAIM SERVICE] Status IDs cached:', this.statusIds);
    } catch (error) {
      console.error("❌ [CLAIM SERVICE] Error initializing status IDs:", error);
      this.statusIds = null;
    }
  }

  static async getCategoryId(categoryName: string): Promise<number | null> {
    await this.initializeCategoryIds();
    return this.categoryIds?.[categoryName] || null;
  }


  static async getPriorityId(priorityName: string): Promise<number | null> {
    await this.initializePriorityIds();
    return this.priorityIds?.[priorityName] || null;
  }

  static async getStatusId(statusName: string): Promise<number | null> {
    await this.initializeStatusIds();
    return this.statusIds?.[statusName] || null;
  }

  static async getAllCategories() {
    try {
      return await prisma.claimCategory.findMany({
        orderBy: { id: 'asc' }
      });
    } catch (error) {
      console.error("❌ [CLAIM SERVICE] Error getting categories:", error);
      return [];
    }
  }

  static async getAllPriorities() {
    try {
      return await prisma.claimPriority.findMany({
        orderBy: { level: 'asc' }
      });
    } catch (error) {
      console.error("❌ [CLAIM SERVICE] Error getting priorities:", error);
      return [];
    }
  }

  static async getAllStatuses() {
    try {
      return await prisma.claimStatus.findMany({
        orderBy: { id: 'asc' }
      });
    } catch (error) {
      console.error("❌ [CLAIM SERVICE] Error getting statuses:", error);
      return [];
    }
  }

  static async initializeClaimLookupTables(): Promise<void> {
    try {
      // Categories
      const categories = [
        { name: 'ascensor', label: 'Ascensor', icon: 'wrench', color: 'purple' },
        { name: 'plomeria', label: 'Plomería', icon: 'droplets', color: 'blue' },
        { name: 'electricidad', label: 'Eléctrico', icon: 'zap', color: 'yellow' },
        { name: 'temperatura', label: 'Calefacción/Aire', icon: 'wind', color: 'green' },
        { name: 'areas_comunes', label: 'Áreas Comunes', icon: 'users', color: 'indigo' },
        { name: 'edificio', label: 'Edificio', icon: 'building', color: 'gray' },
        { name: 'otro', label: 'Otros', icon: 'alert-triangle', color: 'orange' }
      ];

      for (const category of categories) {
        await prisma.claimCategory.upsert({
          where: { name: category.name },
          update: { label: category.label, icon: category.icon, color: category.color },
          create: category
        });
      }

      const priorities = [
        { name: 'baja', label: 'Baja', level: 1, color: 'bg-blue-50 text-blue-700 border-blue-200' },
        { name: 'media', label: 'Media', level: 2, color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
        { name: 'alta', label: 'Alta', level: 3, color: 'bg-orange-50 text-orange-700 border-orange-200' },
        { name: 'urgente', label: 'Urgente', level: 4, color: 'bg-red-50 text-red-700 border-red-200' }
      ];

      for (const priority of priorities) {
        await prisma.claimPriority.upsert({
          where: { name: priority.name },
          update: { label: priority.label, level: priority.level, color: priority.color },
          create: priority
        });
      }

      const statuses = [
        { name: 'pendiente', label: 'Pendiente', color: 'bg-yellow-50 text-yellow-700' },
        { name: 'en_progreso', label: 'En Progreso', color: 'bg-blue-50 text-blue-700' },
        { name: 'resuelto', label: 'Resuelto', color: 'bg-green-50 text-green-700' },
        { name: 'rechazado', label: 'Rechazado', color: 'bg-red-50 text-red-700' }
      ];

      for (const status of statuses) {
        await prisma.claimStatus.upsert({
          where: { name: status.name },
          update: { label: status.label, color: status.color },
          create: status
        });
      }

      console.log('✅ [CLAIM SERVICE] Claim lookup tables initialized');
      
      this.categoryIds = null;
      this.priorityIds = null;
      this.statusIds = null;
      
    } catch (error) {
      console.error("❌ [CLAIM SERVICE] Error initializing claim lookup tables:", error);
    }
  }

  static async convertNamesToIds(data: {
    category?: string;
    priority?: string;
    status?: string;
  }): Promise<{
    categoryId?: number;
    priorityId?: number;
    statusId?: number;
  }> {
    const result: any = {};

    if (data.category) {
      result.categoryId = await this.getCategoryId(data.category);
    }
    if (data.priority) {
      result.priorityId = await this.getPriorityId(data.priority);
    }
    if (data.status) {
      result.statusId = await this.getStatusId(data.status);
    }

    return result;
  }
}