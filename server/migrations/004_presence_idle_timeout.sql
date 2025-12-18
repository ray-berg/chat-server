ALTER TABLE users
  MODIFY presence_status ENUM('online','idle','away','dnd','offline') NOT NULL DEFAULT 'offline';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS idle_timeout_minutes INT NOT NULL DEFAULT 5 AFTER profile_photo_url;
