ALTER TABLE conversations
  MODIFY type ENUM('direct','group','room') NOT NULL;
