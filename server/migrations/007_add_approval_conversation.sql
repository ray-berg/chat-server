ALTER TABLE approval_requests
  ADD COLUMN conversation_id CHAR(36) NULL AFTER target_id;

ALTER TABLE approval_requests
  ADD CONSTRAINT fk_approval_conversation
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    ON DELETE SET NULL;

CREATE INDEX idx_approval_conversation ON approval_requests (conversation_id);
