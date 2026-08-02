-- Add image_url to blocks (block photo, same pattern as properties.image_url)
-- Contabo: docker exec -i postgres psql -U inspect360 -d inspect360 < deployment/add_block_image_url.sql

ALTER TABLE blocks ADD COLUMN IF NOT EXISTS image_url text;
