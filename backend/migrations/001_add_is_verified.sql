-- Migration: Add is_verified column to users table
-- Date: 2025-12-30
-- Description: Adds is_verified boolean field to support email verification

-- Add is_verified column with default value TRUE
-- (TRUE because we verify email before creating user in new flow)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT TRUE;

-- Set all existing users to verified (they registered before email verification was required)
UPDATE users SET is_verified = TRUE WHERE is_verified IS NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_users_is_verified ON users(is_verified);
