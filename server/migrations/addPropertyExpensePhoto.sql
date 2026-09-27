-- Optional photo on property expenses (distinct from receipt)
ALTER TABLE property_expenses
  ADD COLUMN IF NOT EXISTS photo_url TEXT;
