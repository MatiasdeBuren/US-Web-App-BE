import type { Request, Response } from "express";
import { prisma } from "../prismaClient";

const userExpenseInclude = {
  status: true,
  apartment: { select: { id: true, unit: true, floor: true } },
  lineItems: {
    include: { type: true, subtype: true },
    orderBy: { id: "asc" as const }
  },
  payments: {
    include: { paymentMethod: true },
    orderBy: { paidAt: "desc" as const }
  }
};

async function expenseWhereForUser(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { apartmentId: true }
  });
  if (!user) return null;
  const or: any[] = [{ userId }];
  if (user.apartmentId) or.push({ apartmentId: user.apartmentId });
  return { or, apartmentId: user.apartmentId };
}

export const getUserExpenses = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const ownership = await expenseWhereForUser(userId);
    if (!ownership) return res.status(404).json({ message: "Usuario no encontrado" });

    const { statusId, period, page = "1", limit = "20" } = req.query;

    const where: any = { OR: ownership.or };
    if (statusId) where.statusId = parseInt(statusId as string);
    if (period && typeof period === "string") {
      const [year, month] = period.split("-").map(Number);
      where.period = { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) };
    }

    const pageNum  = Math.max(parseInt(page as string) || 1, 1);
    const limitNum = Math.min(parseInt(limit as string) || 20, 50);
    const skip     = (pageNum - 1) * limitNum;

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        include: userExpenseInclude,
        orderBy: { period: "desc" },
        skip,
        take: limitNum
      }),
      prisma.expense.count({ where })
    ]);

    res.json({
      expenses,
      pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) }
    });
  } catch (error) {
    console.error("[USER EXPENSES]", error);
    res.status(500).json({ message: "Error al obtener las expensas" });
  }
};

export const getUserExpensesSummary = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const ownership = await expenseWhereForUser(userId);
    if (!ownership) return res.status(404).json({ message: "Usuario no encontrado" });

    const unpaidExpenses = await prisma.expense.findMany({
      where: {
        OR: ownership.or,
        status: { name: { in: ["pendiente", "parcial", "vencido"] } }
      },
      select: { totalAmount: true, paidAmount: true, status: { select: { name: true } } }
    });

    const totalDebt = unpaidExpenses.reduce(
      (sum, e) => sum + (e.totalAmount - e.paidAmount), 0
    );
    const overdueDebt = unpaidExpenses
      .filter(e => e.status.name === "vencido")
      .reduce((sum, e) => sum + (e.totalAmount - e.paidAmount), 0);

    const pendingCount = unpaidExpenses.filter(e => e.status.name === "pendiente").length;
    const overdueCount = unpaidExpenses.filter(e => e.status.name === "vencido").length;

    const lastPayment = await prisma.expensePayment.findFirst({
      where: { expense: { OR: ownership.or } },
      orderBy: { paidAt: "desc" },
      select: {
        id: true,
        amount: true,
        paidAt: true,
        notes: true,
        paymentMethod: { select: { label: true } },
        expense: {
          select: {
            id: true,
            period: true,
            apartment: { select: { unit: true } }
          }
        }
      }
    });

    res.json({ totalDebt, overdueDebt, pendingCount, overdueCount, lastPayment });
  } catch (error) {
    console.error("[USER EXPENSES SUMMARY]", error);
    res.status(500).json({ message: "Error al obtener el resumen de expensas" });
  }
};

export const getUserExpense = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const expenseId = parseInt(req.params.id);
    if (isNaN(expenseId)) return res.status(400).json({ message: "ID inválido" });

    const ownership = await expenseWhereForUser(userId);
    if (!ownership) return res.status(404).json({ message: "Usuario no encontrado" });

    const expense = await prisma.expense.findFirst({
      where: { id: expenseId, OR: ownership.or },
      include: userExpenseInclude
    });

    if (!expense) return res.status(404).json({ message: "Expensa no encontrada" });

    const lineItemsByType = expense.lineItems.reduce((acc: any, item) => {
      const key = item.type.name;
      if (!acc[key]) {
        acc[key] = { type: item.type, items: [], subtotal: 0 };
      }
      acc[key].items.push(item);
      acc[key].subtotal += item.amount;
      return acc;
    }, {});

    res.json({ expense, lineItemsByType });
  } catch (error) {
    console.error("[USER EXPENSE DETAIL]", error);
    res.status(500).json({ message: "Error al obtener la expensa" });
  }
};
