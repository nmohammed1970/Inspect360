-- Migration: Add first_payment_failure_date column to instance_subscriptions table
-- 
-- This migration adds a column to track the first payment failure date
-- for implementing a 3-day grace period before deactivation.
-- 
-- Run this SQL directly on your PostgreSQL database

ALTER TABLE instance_subscriptions 
ADD COLUMN IF NOT EXISTS first_payment_failure_date TIMESTAMP;

COMMENT ON COLUMN instance_subscriptions.first_payment_failure_date IS 
'Tracks the first payment failure date for 3-day grace period before deactivation';

