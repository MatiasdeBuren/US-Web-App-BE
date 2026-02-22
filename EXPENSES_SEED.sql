-- ============================================
-- EXPENSES MODULE SEED
-- ============================================
-- Run this AFTER DATABASE_SEED.sql
-- ============================================

-- 1. ESTADOS DE EXPENSA
INSERT INTO "expense_statuses" (name, label, color) VALUES
  ('pendiente', 'Pendiente',  '#FFC107'),
  ('parcial',   'Pago Parcial', '#0D6EFD'),
  ('pagado',    'Pagado',     '#28A745'),
  ('vencido',   'Vencido',    '#DC3545')
ON CONFLICT (name) DO NOTHING;

-- 2. TIPOS DE EXPENSA (jerarquía raíz)
INSERT INTO "expense_types" (name, label, icon) VALUES
  ('gastos_comunes', 'Gastos Comunes', 'apartment'),
  ('luz',            'Luz',            'bolt'),
  ('agua',           'Agua',           'water_drop'),
  ('gas',            'Gas',            'local_fire_department'),
  ('alquiler',       'Alquiler',       'house'),
  ('otro',           'Otro',           'help_outline')
ON CONFLICT (name) DO NOTHING;

-- 3. SUBTIPOS (rubros, solo para tipos que los requieren)
-- Rubros de Gastos Comunes
INSERT INTO "expense_subtypes" (name, label, icon, "typeId") VALUES
  ('limpieza_pileta',        'Limpieza de Pileta',       'pool',             (SELECT id FROM "expense_types" WHERE name = 'gastos_comunes')),
  ('seguridad',              'Seguridad',                'security',         (SELECT id FROM "expense_types" WHERE name = 'gastos_comunes')),
  ('mantenimiento_gym',      'Mantenimiento Gimnasio',   'fitness_center',   (SELECT id FROM "expense_types" WHERE name = 'gastos_comunes')),
  ('mantenimiento_ascensor', 'Mantenimiento Ascensor',   'elevator',         (SELECT id FROM "expense_types" WHERE name = 'gastos_comunes')),
  ('limpieza_general',       'Limpieza General',         'cleaning_services',(SELECT id FROM "expense_types" WHERE name = 'gastos_comunes')),
  ('jardineria',             'Jardinería',               'yard',             (SELECT id FROM "expense_types" WHERE name = 'gastos_comunes')),
  ('administracion',         'Administración',           'manage_accounts',  (SELECT id FROM "expense_types" WHERE name = 'gastos_comunes')),
  ('reparaciones',           'Reparaciones Generales',   'build',            (SELECT id FROM "expense_types" WHERE name = 'gastos_comunes'))
ON CONFLICT (name) DO NOTHING;

-- 4. MÉTODOS DE PAGO
INSERT INTO "payment_methods" (name, label) VALUES
  ('efectivo',      'Efectivo'),
  ('transferencia', 'Transferencia Bancaria'),
  ('debito',        'Tarjeta de Débito'),
  ('otro',          'Otro')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- DATOS DE EJEMPLO (OPCIONAL)
-- ============================================

-- Expensa de ejemplo para el apartamento 101 (tenant: maria.gonzalez)
-- con líneas de detalle para gastos comunes, luz y agua
INSERT INTO "expenses" (
  "apartmentId", "userId", period, "dueDate",
  "totalAmount", "paidAmount", "statusId", "adminNotes", "createdAt", "updatedAt"
) VALUES (
  (SELECT id FROM "Apartment" WHERE unit = '101' LIMIT 1),
  (SELECT id FROM "User" WHERE email = 'maria.gonzalez@gmail.com'),
  DATE_TRUNC('month', CURRENT_DATE),               -- primer día del mes actual
  DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '10 days', -- vence el día 10
  47000,
  0,
  (SELECT id FROM "expense_statuses" WHERE name = 'pendiente'),
  NULL,
  NOW(), NOW()
)
ON CONFLICT DO NOTHING;

-- Line items de esa expensa
INSERT INTO "expense_line_items" ("expenseId", "typeId", "subtypeId", description, amount)
SELECT
  e.id,
  (SELECT id FROM "expense_types" WHERE name = 'gastos_comunes'),
  (SELECT id FROM "expense_subtypes" WHERE name = 'limpieza_pileta'),
  NULL,
  8000
FROM "expenses" e
WHERE e."userId" = (SELECT id FROM "User" WHERE email = 'maria.gonzalez@gmail.com')
LIMIT 1;

INSERT INTO "expense_line_items" ("expenseId", "typeId", "subtypeId", description, amount)
SELECT
  e.id,
  (SELECT id FROM "expense_types" WHERE name = 'gastos_comunes'),
  (SELECT id FROM "expense_subtypes" WHERE name = 'seguridad'),
  NULL,
  12000
FROM "expenses" e
WHERE e."userId" = (SELECT id FROM "User" WHERE email = 'maria.gonzalez@gmail.com')
LIMIT 1;

INSERT INTO "expense_line_items" ("expenseId", "typeId", "subtypeId", description, amount)
SELECT
  e.id,
  (SELECT id FROM "expense_types" WHERE name = 'gastos_comunes'),
  (SELECT id FROM "expense_subtypes" WHERE name = 'mantenimiento_gym'),
  NULL,
  5000
FROM "expenses" e
WHERE e."userId" = (SELECT id FROM "User" WHERE email = 'maria.gonzalez@gmail.com')
LIMIT 1;

INSERT INTO "expense_line_items" ("expenseId", "typeId", "subtypeId", description, amount)
SELECT
  e.id,
  (SELECT id FROM "expense_types" WHERE name = 'luz'),
  NULL,
  NULL,
  15000
FROM "expenses" e
WHERE e."userId" = (SELECT id FROM "User" WHERE email = 'maria.gonzalez@gmail.com')
LIMIT 1;

INSERT INTO "expense_line_items" ("expenseId", "typeId", "subtypeId", description, amount)
SELECT
  e.id,
  (SELECT id FROM "expense_types" WHERE name = 'agua'),
  NULL,
  NULL,
  7000
FROM "expenses" e
WHERE e."userId" = (SELECT id FROM "User" WHERE email = 'maria.gonzalez@gmail.com')
LIMIT 1;

-- ============================================
-- FIN DEL SCRIPT
-- ============================================
