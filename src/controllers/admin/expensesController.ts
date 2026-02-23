import type { Request, Response } from "express";
import { prisma } from "../../prismaClient";

const expenseInclude = {
  apartment: {
    select: { id: true, unit: true, floor: true }
  },
  status: true,
  lineItems: {
    include: {
      type: true,
      subtype: true
    }
  },
  payments: {
    include: {
      paymentMethod: true,
      registeredBy: {
        select: { id: true, name: true, email: true }
      }
    },
    orderBy: { paidAt: "desc" as const }
  }
};

async function resolveNewStatus(
  db: any,
  paidAmount: number,
  totalAmount: number,
  dueDate: Date,
  preloadedStatusMap?: Record<string, number>
): Promise<number> {
  const map: Record<string, number> = preloadedStatusMap ?? Object.fromEntries(
    (await db.expenseStatus.findMany({ select: { id: true, name: true } })).map((s: any) => [s.name, s.id])
  );
  const now = new Date();
  if (paidAmount >= totalAmount) return map["pagado"];
  if (paidAmount > 0)           return map["parcial"];
  if (dueDate < now)            return map["vencido"];
  return map["pendiente"];
}

async function validateLineItems(lineItems: any[]): Promise<string | null> {
  for (const [i, item] of lineItems.entries()) {
    if (!item.typeId || typeof item.typeId !== "number")
      return `lineItems[${i}]: 'typeId' es requerido y debe ser un número`;
    if (typeof item.amount !== "number" || item.amount <= 0)
      return `lineItems[${i}]: 'amount' debe ser un número mayor a 0`;
  }

  const typeIds    = [...new Set(lineItems.map((i: any) => i.typeId))] as number[];
  const subtypeIds = [...new Set(lineItems.filter((i: any) => i.subtypeId).map((i: any) => i.subtypeId))] as number[];

  const [typesFound, subtypesFound] = await Promise.all([
    prisma.expenseType.findMany({ where: { id: { in: typeIds } }, select: { id: true } }),
    subtypeIds.length > 0
      ? prisma.expenseSubtype.findMany({ where: { id: { in: subtypeIds } }, select: { id: true, typeId: true } })
      : Promise.resolve([])
  ]);

  if (typesFound.length !== typeIds.length) return "Uno o más typeId no son válidos";
  if (subtypeIds.length > 0 && subtypesFound.length !== subtypeIds.length) return "Uno o más subtypeId no son válidos";

  for (const item of lineItems) {
    if (item.subtypeId) {
      const sub = (subtypesFound as any[]).find((s) => s.id === item.subtypeId);
      if (sub && sub.typeId !== item.typeId)
        return `El subtipo ${item.subtypeId} no pertenece al tipo ${item.typeId}`;
    }
  }

  return null;
}

export const getExpenseTypes = async (_req: Request, res: Response) => {
  try {
    const types = await prisma.expenseType.findMany({
      include: {
        subtypes: {
          orderBy: { label: "asc" }
        }
      },
      orderBy: { label: "asc" }
    });

    res.json({ types });
  } catch (error) {
    console.error("[EXPENSE TYPES]", error);
    res.status(500).json({ message: "Error al obtener tipos de expensa" });
  }
};

export const getExpenseStatuses = async (_req: Request, res: Response) => {
  try {
    const statuses = await prisma.expenseStatus.findMany({
      orderBy: { id: "asc" }
    });
    res.json({ statuses });
  } catch (error) {
    console.error("[EXPENSE STATUSES]", error);
    res.status(500).json({ message: "Error al obtener estados de expensa" });
  }
};

export const getPaymentMethods = async (_req: Request, res: Response) => {
  try {
    const methods = await prisma.paymentMethod.findMany({
      orderBy: { label: "asc" }
    });
    res.json({ paymentMethods: methods });
  } catch (error) {
    console.error("[PAYMENT METHODS]", error);
    res.status(500).json({ message: "Error al obtener métodos de pago" });
  }
};

export const getExpenses = async (req: Request, res: Response) => {
  try {
    const {
      apartmentId,
      statusId,
      period,
      page = "1",
      limit = "20"
    } = req.query;

    const where: any = {};

    if (apartmentId) where.apartmentId = parseInt(apartmentId as string);
    if (statusId) where.statusId = parseInt(statusId as string);

    if (period && typeof period === "string") {
      const [year, month] = period.split("-").map(Number);
      const from = new Date(year, month - 1, 1);
      const to   = new Date(year, month, 1);
      where.period = { gte: from, lt: to };
    }

    const pageNum  = Math.max(parseInt(page as string) || 1, 1);
    const limitNum = Math.min(parseInt(limit as string) || 20, 100);
    const skip     = (pageNum - 1) * limitNum;

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        include: expenseInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take: limitNum
      }),
      prisma.expense.count({ where })
    ]);

    res.json({
      expenses,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error("[ADMIN EXPENSES GET ALL]", error);
    res.status(500).json({ message: "Error al obtener expensas" });
  }
};

export const getExpense = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const expenseId = parseInt(id);

    if (isNaN(expenseId)) {
      return res.status(400).json({ message: "ID de expensa inválido" });
    }

    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: expenseInclude
    });

    if (!expense) {
      return res.status(404).json({ message: "Expensa no encontrada" });
    }

    res.json({ expense });
  } catch (error) {
    console.error("[ADMIN EXPENSES GET ONE]", error);
    res.status(500).json({ message: "Error al obtener la expensa" });
  }
};

export const createExpense = async (req: Request, res: Response) => {
  try {
    const admin = (req as any).user;
    const {
      apartmentId,
      period,
      dueDate,
      adminNotes,
      lineItems
    } = req.body;

    if (!apartmentId) {
      return res.status(400).json({
        message: "El campo 'apartmentId' es requerido"
      });
    }

    if (!period) {
      return res.status(400).json({ message: "El campo 'period' es requerido" });
    }

    if (!dueDate) {
      return res.status(400).json({ message: "El campo 'dueDate' es requerido" });
    }

    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      return res.status(400).json({ message: "Debe incluir al menos una línea de detalle (lineItems)" });
    }

    const validationError = await validateLineItems(lineItems);
    if (validationError) return res.status(400).json({ message: validationError });

    const apt = await prisma.apartment.findUnique({ where: { id: apartmentId } });
    if (!apt) {
      return res.status(404).json({ message: `Apartamento ${apartmentId} no encontrado` });
    }

    const totalAmount = lineItems.reduce((sum: number, item: any) => sum + item.amount, 0);

    const periodDate = new Date(period);
    periodDate.setDate(1);
    periodDate.setHours(0, 0, 0, 0);

    const dueDateObj = new Date(dueDate);
    dueDateObj.setHours(23, 59, 59, 999);

    const initialStatusId = await resolveNewStatus(prisma, 0, totalAmount, dueDateObj);

    const expense = await prisma.expense.create({
      data: {
        apartmentId,
        period:      periodDate,
        dueDate:     dueDateObj,
        totalAmount,
        paidAmount:  0,
        statusId:    initialStatusId,
        adminNotes:  adminNotes || null,
        lineItems: {
          create: lineItems.map((item: any) => ({
            typeId:      item.typeId,
            subtypeId:   item.subtypeId || null,
            description: item.description || null,
            amount:      item.amount
          }))
        }
      },
      include: expenseInclude
    });

    console.log(` [ADMIN EXPENSES] Admin ${admin.email} creó expensa ${expense.id} por $${totalAmount}`);

    res.status(201).json({
      message: "Expensa creada correctamente",
      expense
    });
  } catch (error) {
    console.error("[ADMIN EXPENSES CREATE]", error);
    res.status(500).json({ message: "Error al crear la expensa" });
  }
};

export const updateExpense = async (req: Request, res: Response) => {
  try {
    const admin = (req as any).user;
    const { id } = req.params;
    const expenseId = parseInt(id);

    if (isNaN(expenseId)) {
      return res.status(400).json({ message: "ID de expensa inválido" });
    }

    const existing = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: { payments: true }
    });

    if (!existing) {
      return res.status(404).json({ message: "Expensa no encontrada" });
    }

    const {
      apartmentId,
      period,
      dueDate,
      adminNotes,
      lineItems
    } = req.body;

    if (lineItems !== undefined) {
      if (!Array.isArray(lineItems) || lineItems.length === 0) {
        return res.status(400).json({ message: "lineItems debe ser un arreglo no vacío" });
      }
      const validationError = await validateLineItems(lineItems);
      if (validationError) return res.status(400).json({ message: validationError });
    }

    const updateData: any = {};

    if (apartmentId !== undefined) {
      if (!apartmentId) {
        return res.status(400).json({ message: "El campo 'apartmentId' no puede ser nulo" });
      }
      const apt = await prisma.apartment.findUnique({ where: { id: apartmentId } });
      if (!apt) {
        return res.status(404).json({ message: `Apartamento ${apartmentId} no encontrado` });
      }
      updateData.apartmentId = apartmentId;
    }

    if (adminNotes  !== undefined) updateData.adminNotes  = adminNotes  || null;

    if (period) {
      const p = new Date(period);
      p.setDate(1);
      p.setHours(0, 0, 0, 0);
      updateData.period = p;
    }

    if (dueDate) {
      const d = new Date(dueDate);
      d.setHours(23, 59, 59, 999);
      updateData.dueDate = d;
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (lineItems !== undefined) {
        await tx.expenseLineItem.deleteMany({ where: { expenseId } });

        const newTotal = lineItems.reduce((sum: number, i: any) => sum + i.amount, 0);
        updateData.totalAmount = newTotal;

        await tx.expenseLineItem.createMany({
          data: lineItems.map((item: any) => ({
            expenseId,
            typeId:      item.typeId,
            subtypeId:   item.subtypeId || null,
            description: item.description || null,
            amount:      item.amount
          }))
        });
      }

      const effectiveDueDate = updateData.dueDate ?? existing.dueDate;
      const effectiveTotal   = updateData.totalAmount ?? existing.totalAmount;
      const paidAmount = existing.payments.reduce((sum, p) => sum + p.amount, 0);
      const statusId = await resolveNewStatus(tx, paidAmount, effectiveTotal, effectiveDueDate);

      updateData.paidAmount = paidAmount;
      updateData.statusId   = statusId;

      return tx.expense.update({
        where: { id: expenseId },
        data: updateData,
        include: expenseInclude
      });
    });

    console.log(` [ADMIN EXPENSES] Admin ${admin.email} actualizó expensa ${expenseId}`);

    res.json({
      message: "Expensa actualizada correctamente",
      expense: updated
    });
  } catch (error) {
    console.error("[ADMIN EXPENSES UPDATE]", error);
    res.status(500).json({ message: "Error al actualizar la expensa" });
  }
};

export const deleteExpense = async (req: Request, res: Response) => {
  try {
    const admin = (req as any).user;
    const { id } = req.params;
    const expenseId = parseInt(id);

    if (isNaN(expenseId)) {
      return res.status(400).json({ message: "ID de expensa inválido" });
    }

    const existing = await prisma.expense.findUnique({ where: { id: expenseId } });
    if (!existing) {
      return res.status(404).json({ message: "Expensa no encontrada" });
    }

    await prisma.expense.delete({ where: { id: expenseId } });

    console.log(` [ADMIN EXPENSES] Admin ${admin.email} eliminó expensa ${expenseId}`);

    res.json({ message: "Expensa eliminada correctamente" });
  } catch (error) {
    console.error("[ADMIN EXPENSES DELETE]", error);
    res.status(500).json({ message: "Error al eliminar la expensa" });
  }
};

export const registerExpensePayment = async (req: Request, res: Response) => {
  try {
    const admin = (req as any).user;
    const { expenseId: id } = req.params;
    const expenseId = parseInt(id);

    if (isNaN(expenseId)) {
      return res.status(400).json({ message: "ID de expensa inválido" });
    }

    const { amount, paymentMethodId, paidAt, notes } = req.body;

    if (typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({ message: "'amount' debe ser un número mayor a 0" });
    }

    const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
    if (!expense) {
      return res.status(404).json({ message: "Expensa no encontrada" });
    }

    if (paymentMethodId) {
      const method = await prisma.paymentMethod.findUnique({ where: { id: paymentMethodId } });
      if (!method) {
        return res.status(400).json({ message: `Método de pago ${paymentMethodId} no encontrado` });
      }
    }

    const statusRecords = await prisma.expenseStatus.findMany({ select: { id: true, name: true } });
    const statusMap: Record<string, number> = Object.fromEntries(statusRecords.map((s: any) => [s.name, s.id]));

    const payment = await prisma.$transaction(async (tx) => {
      const newPayment = await tx.expensePayment.create({
        data: {
          expenseId,
          amount,
          paymentMethodId: paymentMethodId || null,
          registeredById:  admin.id,
          paidAt:          paidAt ? new Date(paidAt) : new Date(),
          notes:           notes || null
        },
        include: {
          paymentMethod: true,
          registeredBy: { select: { id: true, name: true, email: true } }
        }
      });

      const expWithPayments = await tx.expense.findUnique({
        where: { id: expenseId },
        include: { payments: { select: { amount: true } } }
      });

      const newPaidAmount = expWithPayments!.payments.reduce((sum, p) => sum + p.amount, 0);
      const newStatusId = await resolveNewStatus(
        tx,
        newPaidAmount,
        expWithPayments!.totalAmount,
        expWithPayments!.dueDate,
        statusMap
      );

      await tx.expense.update({
        where: { id: expenseId },
        data: { paidAmount: newPaidAmount, statusId: newStatusId }
      });

      return newPayment;
    });

    const updatedExpense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: expenseInclude
    });

    console.log(
      ` [ADMIN EXPENSES] Admin ${admin.email} registró pago de $${amount} en expensa ${expenseId}`
    );

    res.status(201).json({
      message: "Pago registrado correctamente",
      payment,
      expense: updatedExpense
    });
  } catch (error) {
    console.error(" [ADMIN EXPENSES PAYMENT]", error);
    res.status(500).json({ message: "Error al registrar el pago" });
  }
};

export const deleteExpensePayment = async (req: Request, res: Response) => {
  try {
    const admin = (req as any).user;
    const { expenseId: eId, paymentId: pId } = req.params;
    const expenseId = parseInt(eId);
    const paymentId = parseInt(pId);

    if (isNaN(expenseId) || isNaN(paymentId)) {
      return res.status(400).json({ message: "IDs inválidos" });
    }

    const payment = await prisma.expensePayment.findFirst({
      where: { id: paymentId, expenseId }
    });

    if (!payment) {
      return res.status(404).json({ message: "Pago no encontrado" });
    }

    const statusRecords = await prisma.expenseStatus.findMany({ select: { id: true, name: true } });
    const statusMap: Record<string, number> = Object.fromEntries(statusRecords.map((s: any) => [s.name, s.id]));

    await prisma.$transaction(async (tx) => {
      await tx.expensePayment.delete({ where: { id: paymentId } });

      const expWithPayments = await tx.expense.findUnique({
        where: { id: expenseId },
        include: { payments: { select: { amount: true } } }
      });

      const newPaidAmount = expWithPayments!.payments.reduce((sum, p) => sum + p.amount, 0);
      const newStatusId = await resolveNewStatus(
        tx,
        newPaidAmount,
        expWithPayments!.totalAmount,
        expWithPayments!.dueDate,
        statusMap
      );

      await tx.expense.update({
        where: { id: expenseId },
        data: { paidAmount: newPaidAmount, statusId: newStatusId }
      });
    });

    const updatedExpense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: expenseInclude
    });

    console.log(
      ` [ADMIN EXPENSES] Admin ${admin.email} eliminó pago ${paymentId} de expensa ${expenseId}`
    );

    res.json({
      message: "Pago eliminado correctamente",
      expense: updatedExpense
    });
  } catch (error) {
    console.error("[ADMIN EXPENSES DELETE PAYMENT]", error);
    res.status(500).json({ message: "Error al eliminar el pago" });
  }
};
