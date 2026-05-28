-- Multi-agent orchestration surface (ported from NOCOS #415 onto /api/*).
-- MariaDB-backed (no Redis): exclusive "one active project per agent" is
-- enforced by agent_locks (PK user_id) instead of a partial unique index,
-- which MariaDB does not support. Shared agents never insert a lock row,
-- so the lock-exemption falls out with no special-casing.

CREATE TABLE IF NOT EXISTS agent_profiles (
  user_id CHAR(36) PRIMARY KEY,
  expertise_level ENUM('junior','mid','senior','staff') NOT NULL DEFAULT 'mid',
  system_prompt TEXT DEFAULT NULL,
  specialties JSON DEFAULT NULL,
  tone VARCHAR(120) DEFAULT NULL,
  exclusive TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS agent_skills (
  user_id CHAR(36) NOT NULL,
  skill VARCHAR(64) NOT NULL,
  PRIMARY KEY (user_id, skill),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_agent_skills_skill (skill)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS agent_assignments (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  room_id CHAR(36) NOT NULL,
  assigned_by CHAR(36) NULL,
  assigned_at DATETIME NOT NULL,
  released_at DATETIME NULL,
  advisory TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (room_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_agent_assign_user (user_id, released_at),
  INDEX idx_agent_assign_room (room_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Active-exclusive guard: one row per agent currently holding an exclusive
-- assignment. PK on user_id makes the claim atomic (duplicate -> 409).
CREATE TABLE IF NOT EXISTS agent_locks (
  user_id CHAR(36) PRIMARY KEY,
  assignment_id CHAR(36) NOT NULL,
  room_id CHAR(36) NOT NULL,
  locked_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (assignment_id) REFERENCES agent_assignments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- activity_status sits alongside presence; agents (or their harness) report it.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS activity_status
  ENUM('ready','working','awaiting_review','awaiting_assignment','idle')
  NOT NULL DEFAULT 'idle';
