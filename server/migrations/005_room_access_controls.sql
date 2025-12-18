ALTER TABLE conversations
  ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 1 AFTER title;

CREATE TABLE IF NOT EXISTS room_join_requests (
  id CHAR(36) PRIMARY KEY,
  room_id CHAR(36) NOT NULL,
  requester_id CHAR(36) NOT NULL,
  note VARCHAR(255) DEFAULT NULL,
  status ENUM('pending','approved','denied') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL,
  decided_at DATETIME NULL,
  decided_by CHAR(36) NULL,
  FOREIGN KEY (room_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uniq_room_requester (room_id, requester_id),
  INDEX idx_room_join_room (room_id),
  INDEX idx_room_join_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
