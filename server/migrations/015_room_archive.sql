-- Channel archive. A soft, reversible "remove" for rooms: archived rooms are
-- hidden from every client's channel list (listRoomsForUser filters archived_at
-- IS NULL) but the conversation and its full history persist and a moderator can
-- restore them. Hard delete is separate (admin-only DELETE of the conversation
-- row, which cascades to messages/members/etc.).
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS archived_at DATETIME NULL;
