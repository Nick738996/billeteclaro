-- Migration: allow custom category names in budgets
-- Drops the hardcoded categoria check so users can create their own budget categories.
ALTER TABLE budgets DROP CONSTRAINT IF EXISTS budgets_categoria;
