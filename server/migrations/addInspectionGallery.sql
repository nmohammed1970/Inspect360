-- Per-inspection image gallery + assignments (Contabo-safe).

CREATE TABLE IF NOT EXISTS inspection_gallery_images (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  organization_id VARCHAR NOT NULL,
  inspection_id VARCHAR NOT NULL,
  object_url TEXT NOT NULL,
  file_name VARCHAR(512),
  mime_type VARCHAR(128),
  byte_size INTEGER,
  width INTEGER,
  height INTEGER,
  uploaded_by_user_id VARCHAR,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inspection_gallery_images_inspection_id_idx
  ON inspection_gallery_images (inspection_id);

CREATE INDEX IF NOT EXISTS inspection_gallery_images_org_id_idx
  ON inspection_gallery_images (organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS inspection_gallery_images_insp_url_uidx
  ON inspection_gallery_images (inspection_id, object_url);

CREATE TABLE IF NOT EXISTS inspection_gallery_assignments (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  gallery_image_id VARCHAR NOT NULL,
  inspection_id VARCHAR NOT NULL,
  section_ref TEXT NOT NULL,
  field_key VARCHAR NOT NULL,
  created_by_user_id VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inspection_gallery_assignments_inspection_id_idx
  ON inspection_gallery_assignments (inspection_id);

CREATE INDEX IF NOT EXISTS inspection_gallery_assignments_image_id_idx
  ON inspection_gallery_assignments (gallery_image_id);

CREATE INDEX IF NOT EXISTS inspection_gallery_assignments_dest_idx
  ON inspection_gallery_assignments (inspection_id, section_ref, field_key);

CREATE UNIQUE INDEX IF NOT EXISTS inspection_gallery_assignments_unique_uidx
  ON inspection_gallery_assignments (gallery_image_id, section_ref, field_key);

-- Contabo: after applying as creativecloud, grant app role (see SETUP.md):
-- GRANT SELECT, INSERT, UPDATE, DELETE ON inspection_gallery_images TO inspect360;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON inspection_gallery_assignments TO inspect360;
