-- Migration: Add message reads tracking for bot read receipts
-- Tracks when bots have read messages in a conversation

CREATE TABLE message_reads (
  id VARCHAR(36) PRIMARY KEY,
  conversation_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  last_read_message_id VARCHAR(36) NOT NULL,
  read_at DATETIME NOT NULL,
  UNIQUE KEY unique_conv_user (conversation_id, user_id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (last_read_message_id) REFERENCES messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_message_reads_conv ON message_reads(conversation_id);
CREATE INDEX idx_message_reads_user ON message_reads(user_id);
