-- The successor token that superseded this one when it was rotated. It lets the
-- refresh reuse-interval (see createAccessToken) tell a concurrent exchange —
-- successor still active — apart from a rotated-then-revoked lineage such as a
-- logout, whose successor is dead, so the grace window can never resurrect a
-- session that was explicitly ended. ON DELETE SET NULL keeps token cleanup from
-- tripping the self-reference. See docs/hardening-plan.md A1.
ALTER TABLE refresh
  ADD COLUMN replaced_by UUID REFERENCES refresh(refresh_id) ON DELETE SET NULL;
