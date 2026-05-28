CREATE TABLE IF NOT EXISTS access_requests (
  id CHAR(36) PRIMARY KEY,
  username VARCHAR(64) NOT NULL,
  display_name VARCHAR(128) NOT NULL,
  email VARCHAR(255) DEFAULT NULL,
  note VARCHAR(500) DEFAULT NULL,
  status ENUM('pending','approved','denied') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL,
  decided_at DATETIME NULL,
  decided_by CHAR(36) NULL,
  created_user_id CHAR(36) NULL,
  FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_access_status (status),
  INDEX idx_access_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
