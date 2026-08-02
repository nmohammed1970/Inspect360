-- Billing Spec v2.0 — ensure self-serve top-up packs 20 / 50 / 100 exist.
-- Safe to re-run. Pricing is computed at request time from tier rates (not stored here).

INSERT INTO addon_pack_config (name, inspection_quantity, pack_order, is_active)
SELECT '20 Pack', 20, 1, true
WHERE NOT EXISTS (
  SELECT 1 FROM addon_pack_config WHERE inspection_quantity = 20
);

INSERT INTO addon_pack_config (name, inspection_quantity, pack_order, is_active)
SELECT '50 Pack', 50, 2, true
WHERE NOT EXISTS (
  SELECT 1 FROM addon_pack_config WHERE inspection_quantity = 50
);

INSERT INTO addon_pack_config (name, inspection_quantity, pack_order, is_active)
SELECT '100 Pack', 100, 3, true
WHERE NOT EXISTS (
  SELECT 1 FROM addon_pack_config WHERE inspection_quantity = 100
);

-- Reactivate / rename if a 100-pack row exists but was inactive or misnamed
UPDATE addon_pack_config
SET
  name = '100 Pack',
  pack_order = 3,
  is_active = true
WHERE inspection_quantity = 100;
