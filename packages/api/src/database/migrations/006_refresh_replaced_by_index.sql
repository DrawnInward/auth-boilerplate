-- 002 added the self-referencing replaced_by FK with no index: every DELETE on
-- refresh seq-scans the table for referrers, and the table grows one row per
-- exchange with no purge job yet. Partial index keeps it small (most rows'
-- replaced_by is the live tip's NULL).
--
-- Purge-ordering constraint for any future cleanup job: deleting a successor
-- row SET NULLs its parent's replaced_by, which the grace logic reads as
-- "successor dead" — so prune oldest-first (parents before their successors),
-- or only rows whose used_at is far outside REFRESH_REUSE_GRACE_SECONDS, and
-- never delete a token newer than its parent's grace window.
CREATE INDEX idx_refresh_replaced_by ON refresh (replaced_by)
  WHERE replaced_by IS NOT NULL;
