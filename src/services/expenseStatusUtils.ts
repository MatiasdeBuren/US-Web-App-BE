import { prisma } from "../prismaClient";

/**
 * Marca como vencidos los gastos que tengan fecha de vencimiento pasada y estén en estado pendiente o parcial.
 */
export async function syncOverdueExpenses(additionalWhere: Record<string, any> = {}): Promise<void> {
  const [vencido, pendiente, parcial] = await Promise.all([
    prisma.expenseStatus.findUnique({ where: { name: "vencido" } }),
    prisma.expenseStatus.findUnique({ where: { name: "pendiente" } }),
    prisma.expenseStatus.findUnique({ where: { name: "parcial" } })
  ]);

  if (!vencido || !pendiente || !parcial) return;

  await prisma.expense.updateMany({
    where: {
      ...additionalWhere,
      dueDate: { lt: new Date() },
      statusId: { in: [pendiente.id, parcial.id] }
    },
    data: { statusId: vencido.id }
  });
}
