// The one account-active predicate shared by every authentication gate —
// session issue, the refresh rotation gate, and invitation accept. NULL-safe
// on purpose: is_active is nullable in users/admins, and anything but true
// must read as inactive (a NULL row slipping past `=== false` was the A4
// review bug).
export const isAccountActive = (
  principal: { is_active?: boolean | null } | null | undefined,
): boolean => principal?.is_active === true;
