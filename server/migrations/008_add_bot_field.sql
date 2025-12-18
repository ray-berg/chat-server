-- Migration: Add bot field to users table
-- This allows differentiating bot accounts from regular users

ALTER TABLE users ADD COLUMN bot TINYINT(1) NOT NULL DEFAULT 0 AFTER role;

-- Add index for querying bots
CREATE INDEX idx_users_bot ON users(bot);
