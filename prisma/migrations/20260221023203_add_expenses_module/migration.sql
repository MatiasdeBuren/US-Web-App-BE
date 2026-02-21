-- CreateTable
CREATE TABLE "public"."expense_statuses" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,

    CONSTRAINT "expense_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."expense_types" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "icon" TEXT,

    CONSTRAINT "expense_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."expense_subtypes" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "icon" TEXT,
    "typeId" INTEGER NOT NULL,

    CONSTRAINT "expense_subtypes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."payment_methods" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."expenses" (
    "id" SERIAL NOT NULL,
    "apartmentId" INTEGER,
    "userId" INTEGER,
    "period" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "statusId" INTEGER NOT NULL DEFAULT 1,
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."expense_line_items" (
    "id" SERIAL NOT NULL,
    "expenseId" INTEGER NOT NULL,
    "typeId" INTEGER NOT NULL,
    "subtypeId" INTEGER,
    "description" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "expense_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."expense_payments" (
    "id" SERIAL NOT NULL,
    "expenseId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentMethodId" INTEGER,
    "registeredById" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "expense_statuses_name_key" ON "public"."expense_statuses"("name");

-- CreateIndex
CREATE UNIQUE INDEX "expense_types_name_key" ON "public"."expense_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "expense_subtypes_name_key" ON "public"."expense_subtypes"("name");

-- CreateIndex
CREATE INDEX "expense_subtypes_typeId_idx" ON "public"."expense_subtypes"("typeId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_name_key" ON "public"."payment_methods"("name");

-- CreateIndex
CREATE INDEX "expenses_userId_idx" ON "public"."expenses"("userId");

-- CreateIndex
CREATE INDEX "expenses_apartmentId_idx" ON "public"."expenses"("apartmentId");

-- CreateIndex
CREATE INDEX "expenses_statusId_idx" ON "public"."expenses"("statusId");

-- CreateIndex
CREATE INDEX "expenses_period_idx" ON "public"."expenses"("period");

-- CreateIndex
CREATE INDEX "expenses_dueDate_idx" ON "public"."expenses"("dueDate");

-- CreateIndex
CREATE INDEX "expense_line_items_expenseId_idx" ON "public"."expense_line_items"("expenseId");

-- CreateIndex
CREATE INDEX "expense_line_items_typeId_idx" ON "public"."expense_line_items"("typeId");

-- CreateIndex
CREATE INDEX "expense_line_items_subtypeId_idx" ON "public"."expense_line_items"("subtypeId");

-- CreateIndex
CREATE INDEX "expense_payments_expenseId_idx" ON "public"."expense_payments"("expenseId");

-- CreateIndex
CREATE INDEX "expense_payments_registeredById_idx" ON "public"."expense_payments"("registeredById");

-- AddForeignKey
ALTER TABLE "public"."expense_subtypes" ADD CONSTRAINT "expense_subtypes_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "public"."expense_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."expenses" ADD CONSTRAINT "expenses_apartmentId_fkey" FOREIGN KEY ("apartmentId") REFERENCES "public"."Apartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."expenses" ADD CONSTRAINT "expenses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."expenses" ADD CONSTRAINT "expenses_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "public"."expense_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."expense_line_items" ADD CONSTRAINT "expense_line_items_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "public"."expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."expense_line_items" ADD CONSTRAINT "expense_line_items_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "public"."expense_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."expense_line_items" ADD CONSTRAINT "expense_line_items_subtypeId_fkey" FOREIGN KEY ("subtypeId") REFERENCES "public"."expense_subtypes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."expense_payments" ADD CONSTRAINT "expense_payments_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "public"."expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."expense_payments" ADD CONSTRAINT "expense_payments_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "public"."payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."expense_payments" ADD CONSTRAINT "expense_payments_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
