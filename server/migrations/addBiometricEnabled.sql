-- Migration: Add biometric_enabled column to users table
-- 
-- This migration adds a column to track if user has enabled biometric authentication
-- for quick login using fingerprint, face ID, or device PIN.
-- 
-- Run this SQL directly on your PostgreSQL database

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS biometric_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.biometric_enabled IS 
'Tracks if user has enabled biometric authentication for quick login';

