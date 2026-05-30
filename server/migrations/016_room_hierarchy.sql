-- Channel hierarchy: a room may declare a parent room (one level deep), so the
-- project-manager's per-task breakout rooms nest under their project room instead
-- of being N flat rooms. FK is self-referential with ON DELETE SET NULL -- deleting
-- a project room orphans its breakouts to top-level rather than cascade-deleting
-- their history. Only rooms (type='room') ever set this; directs leave it NULL.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS parent_room_id CHAR(36) NULL;
ALTER TABLE conversations ADD INDEX idx_conv_parent (parent_room_id);
ALTER TABLE conversations ADD CONSTRAINT fk_conv_parent FOREIGN KEY (parent_room_id) REFERENCES conversations(id) ON DELETE SET NULL;
