-- Live GPS on gallery capture/upload + address match vs property.

ALTER TABLE inspection_gallery_images
  ADD COLUMN IF NOT EXISTS capture_latitude DOUBLE PRECISION;

ALTER TABLE inspection_gallery_images
  ADD COLUMN IF NOT EXISTS capture_longitude DOUBLE PRECISION;

ALTER TABLE inspection_gallery_images
  ADD COLUMN IF NOT EXISTS address_match_status VARCHAR(32);

-- Contabo: no new tables; columns inherit table grants for inspect360.
