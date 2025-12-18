CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(128) NOT NULL,
  role ENUM('user','moderator','admin') NOT NULL DEFAULT 'user',
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  manager TINYINT(1) NOT NULL DEFAULT 0,
  manager_token CHAR(32) DEFAULT '',
  avatar_url VARCHAR(255) DEFAULT '',
  bio TEXT NULL,
  birthday DATE NULL,
  profile_theme VARCHAR(64) DEFAULT 'light',
  accent_color VARCHAR(32) DEFAULT '#2563eb',
  presence_status ENUM('online','away','busy','offline') NOT NULL DEFAULT 'offline',
  last_seen_at DATETIME NULL,
  profile_photo_url VARCHAR(255) DEFAULT '',
  last_room_id CHAR(36) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS conversations (
  id CHAR(36) PRIMARY KEY,
  type ENUM('direct','group','room') NOT NULL,
  title VARCHAR(255),
  created_by CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  role ENUM('participant','owner') NOT NULL DEFAULT 'participant',
  joined_at DATETIME NOT NULL,
  PRIMARY KEY (conversation_id, user_id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS room_bans (
  room_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  banned_by CHAR(36) NOT NULL,
  reason VARCHAR(255) DEFAULT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (room_id, user_id),
  FOREIGN KEY (room_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (banned_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_room_bans_room (room_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS messages (
  id CHAR(36) PRIMARY KEY,
  conversation_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_messages_conversation (conversation_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS approval_requests (
  id CHAR(36) PRIMARY KEY,
  requester_id CHAR(36) NOT NULL,
  target_id CHAR(36) NOT NULL,
  note TEXT,
  status ENUM('pending','approved','denied') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL,
  responded_at DATETIME NULL,
  FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_approval_target (target_id),
  INDEX idx_approval_requester (requester_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
