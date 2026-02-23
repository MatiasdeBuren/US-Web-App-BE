-- Migration: expenses_apartment_only
-- Expenses are now exclusively assigned to apartments.
-- The userId column is removed and apartmentId becomes required (NOT NULL).

-- Step 1: Drop the foreign key constraint on userId (if it exists)
ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "expenses_userId_fkey";

-- Step 2: Drop the userId column
ALTER TABLE "expenses" DROP COLUMN IF EXISTS "userId";

-- Step 3: Drop the userId index
DROP INDEX IF EXISTS "expenses_userId_idx";

-- Step 4: Make apartmentId NOT NULL
ALTER TABLE "expenses" ALTER COLUMN "apartmentId" SET NOT NULL;
