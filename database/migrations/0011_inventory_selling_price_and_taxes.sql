-- Phase 7: Inventory & Product Selling Prices and GST Sub-Tax Breakdown (CGST, SGST, IGST)
ALTER TABLE products ADD COLUMN selling_price REAL;
ALTER TABLE products ADD COLUMN tax_rate REAL DEFAULT 5;
ALTER TABLE products ADD COLUMN cgst_rate REAL DEFAULT 2.5;
ALTER TABLE products ADD COLUMN sgst_rate REAL DEFAULT 2.5;
ALTER TABLE products ADD COLUMN igst_rate REAL DEFAULT 0;

ALTER TABLE inventory ADD COLUMN selling_price REAL;
ALTER TABLE inventory ADD COLUMN tax_rate REAL DEFAULT 5;
ALTER TABLE inventory ADD COLUMN cgst_rate REAL DEFAULT 2.5;
ALTER TABLE inventory ADD COLUMN sgst_rate REAL DEFAULT 2.5;
ALTER TABLE inventory ADD COLUMN igst_rate REAL DEFAULT 0;
