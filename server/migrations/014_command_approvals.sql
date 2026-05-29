-- Sysadmin command approvals: a worker submits a proposed MCP command, the
-- manager who holds its active assignment approves/denies it (no human in the
-- loop, no server auto-approve). The NOCOS MCP backstop verifies an executed op
-- against the approved record (param-match on {tool,args}) before running it.
-- Distinct from approval_requests (the manager-token-delivery flow) by design.
CREATE TABLE IF NOT EXISTS command_approvals (
  id CHAR(36) PRIMARY KEY,
  requester_id CHAR(36) NOT NULL,
  target_id CHAR(36) NOT NULL,
  conversation_id CHAR(36) NULL,
  tool VARCHAR(120) NOT NULL,
  args JSON NOT NULL,
  display JSON NULL,
  status ENUM('pending','approved','denied','cancelled') NOT NULL DEFAULT 'pending',
  reason VARCHAR(500) NULL,
  decided_by CHAR(36) NULL,
  created_at DATETIME NOT NULL,
  decided_at DATETIME NULL,
  FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
  FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_cmdappr_target (target_id, status),
  INDEX idx_cmdappr_requester (requester_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
