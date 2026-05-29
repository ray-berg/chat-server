-- @mention pings. A mentioned user is notified even when they are NOT a member
-- of the conversation (ping only -- no auto-join; the recipient decides whether
-- to answer the ping or join the room). One row per (message, mentioned user).
CREATE TABLE IF NOT EXISTS mentions (
  id CHAR(36) PRIMARY KEY,
  message_id CHAR(36) NOT NULL,
  conversation_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  author_id CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL,
  read_at DATETIME NULL,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_mention (message_id, user_id),
  INDEX idx_mentions_user_unread (user_id, read_at),
  INDEX idx_mentions_conv (conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
