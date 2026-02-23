import { Router } from "express";
import { requireAuth } from "../auth_middleware";
import {
  getUserExpenses,
  getUserExpensesSummary,
  getUserExpense
} from "../controllers/expensesController";
import { getExpenseTypes } from "../controllers/admin/expensesController";

const router = Router();

router.get("/types",   requireAuth, getExpenseTypes);
router.get("/summary", requireAuth, getUserExpensesSummary);
router.get("/",        requireAuth, getUserExpenses);
router.get("/:id",     requireAuth, getUserExpense);

export default router;
