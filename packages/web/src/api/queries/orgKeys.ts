// The only place organization query keys are built. Hand-written key arrays
// drift: a mutation invalidates ["organizations", id] while the query that
// cached it used ["organizations", id, "members"], and the stale data survives.
//
// The keys are hierarchical, and invalidation relies on that — invalidating
// `all` covers every detail, member and invitation list beneath it, and
// invalidating `detail(orgId)` covers that org's sub-lists.
export const orgKeys = {
  all: ["org"] as const,
  detail: (orgId: string | undefined) => [...orgKeys.all, orgId] as const,
  members: (orgId: string | undefined) =>
    [...orgKeys.detail(orgId), "members"] as const,
  invitations: (orgId: string | undefined) =>
    [...orgKeys.detail(orgId), "invitations"] as const,
};
