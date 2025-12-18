CREATE TABLE IF NOT EXISTS audit_logs (
  id CHAR(36) PRIMARY KEY,
  actor_id CHAR(36) DEFAULT NULL,
  action VARCHAR(128) NOT NULL,
  target_id CHAR(36) DEFAULT NULL,
  metadata TEXT DEFAULT NULL,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_actor (actor_id),
  INDEX idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
