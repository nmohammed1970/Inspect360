-- Migration: Add first_payment_failure_date column to instance_subscriptions table
-- This column tracks the first payment failure date for grace period handling

ALTER TABLE instance_subscriptions 
ADD COLUMN IF NOT EXISTS first_payment_failure_date TIMESTAMP;

-- Add comment to document the column
COMMENT ON COLUMN instance_subscriptions.first_payment_failure_date IS 'Tracks the first payment failure date for 3-day grace period before deactivation';

