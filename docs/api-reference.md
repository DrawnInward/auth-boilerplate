# API Reference

Base URL: `http://localhost:3000/api`

All endpoints return JSON. Authenticated endpoints require valid JWT cookies (set automatically by login).

## Response Format

Success responses:

```json
{
  "success": true,
  "data": { ... },
  "msg": "Success message"
}
```

Error responses:

```json
{
  "success": false,
  "msg": "Error message"
}
```

---

## Configuration

### GET /config

Returns platform configuration for the frontend.

**Authentication:** None

**Response:**

```json
{
  "oauth": {
    "google": true
  },
  "registration": {
    "accountCreationMode": "open",
    "orgCreationMode": "open"
  }
}
```

---

## User Authentication

### POST /auth/register

Start registration process. Sends verification email.

**Authentication:** None

**Request:**

```json
{
  "email": "user@example.com"
}
```

**Response:**

```json
{
  "success": true,
  "msg": "Verification email sent"
}
```

**Errors:**

- `400` - Invalid email format
- `403` - Registration disabled (when `ACCOUNT_CREATION_MODE` is not `open`)
- `409` - Email already registered

---

### GET /auth/verify/:token

Verify email token from registration email.

**Authentication:** None

**Response:**

```json
{
  "success": true,
  "data": {
    "email": "user@example.com",
    "token": "verification-token"
  },
  "msg": "Email verified"
}
```

**Errors:**

- `400` - Invalid or expired token

---

### POST /auth/complete-registration

Complete registration by setting password.

**Authentication:** None

**Request:**

```json
{
  "token": "verification-token",
  "password": "securepassword123"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "user_id": "uuid",
    "email": "user@example.com"
  },
  "msg": "Registration complete"
}
```

Sets `access_token` and `refresh_token` cookies.

---

### POST /auth/login

Authenticate user with email and password.

**Authentication:** None

**Request:**

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (no MFA):**

```json
{
  "success": true,
  "data": {
    "user_id": "uuid",
    "email": "user@example.com",
    "is_active": true,
    "email_verified": true,
    "mfa_enabled": false,
    "auth_provider": "local",
    "can_create_orgs": true
  },
  "msg": "Login successful"
}
```

**Response (MFA required):**

```json
{
  "success": true,
  "data": {
    "mfa_required": true
  },
  "msg": "MFA verification required"
}
```

Sets `mfa_challenge` cookie when MFA required.

---

### POST /auth/logout

Log out and invalidate refresh token.

**Authentication:** Required

**Response:**

```json
{
  "success": true,
  "msg": "Logged out"
}
```

Clears all auth cookies.

---

### POST /auth/refresh

Refresh access token using refresh token.

**Authentication:** Refresh token cookie

**Response:**

```json
{
  "success": true,
  "msg": "Token refreshed"
}
```

Sets new `access_token` cookie.

---

### GET /auth/me

Get current user profile.

**Authentication:** Required

**Response:**

```json
{
  "success": true,
  "data": {
    "user_id": "uuid",
    "email": "user@example.com",
    "is_active": true,
    "email_verified": true,
    "mfa_enabled": false,
    "auth_provider": "local",
    "can_create_orgs": true,
    "created_through": "self_registered"
  }
}
```

---

### PUT /auth/profile

Update user profile.

**Authentication:** Required

**Request:**

```json
{
  "email": "newemail@example.com"
}
```

**Response:**

```json
{
  "success": true,
  "msg": "Profile updated"
}
```

---

### PUT /auth/change-password

Change password for authenticated user.

**Authentication:** Required

**Request:**

```json
{
  "current_password": "oldpassword",
  "new_password": "newpassword123"
}
```

**Response:**

```json
{
  "success": true,
  "msg": "Password changed"
}
```

---

### POST /auth/forgot-password

Request password reset email.

**Authentication:** None

**Request:**

```json
{
  "email": "user@example.com"
}
```

**Response:**

```json
{
  "success": true,
  "msg": "If the email exists, a reset link has been sent"
}
```

---

### POST /auth/reset-password

Reset password using token from email.

**Authentication:** None

**Request:**

```json
{
  "token": "reset-token",
  "password": "newpassword123"
}
```

**Response:**

```json
{
  "success": true,
  "msg": "Password reset successful"
}
```

---

### POST /auth/request-email-change

Request to change email address. Sends verification to new email.

**Authentication:** Required

**Request:**

```json
{
  "new_email": "newemail@example.com",
  "password": "currentpassword"
}
```

**Response:**

```json
{
  "success": true,
  "msg": "Verification email sent to new address"
}
```

---

### POST /auth/confirm-email-change/:token

Confirm email change using token.

**Authentication:** None

**Response:**

```json
{
  "success": true,
  "msg": "Email changed successfully"
}
```

---

### POST /auth/set-password

Set password for OAuth-only users (no existing password).

**Authentication:** Required

**Request:**

```json
{
  "password": "newpassword123"
}
```

**Response:**

```json
{
  "success": true,
  "msg": "Password set"
}
```

---

## User MFA

### POST /auth/mfa/setup

Start MFA setup. Returns QR code for authenticator app.

**Authentication:** Required

**Response:**

```json
{
  "success": true,
  "data": {
    "qr_code": "data:image/png;base64,...",
    "secret": "JBSWY3DPEHPK3PXP"
  },
  "msg": "Scan QR code with authenticator app"
}
```

---

### POST /auth/mfa/verify-setup

Complete MFA setup by verifying TOTP code.

**Authentication:** Required

**Request:**

```json
{
  "code": "123456"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "backup_codes": [
      "code1",
      "code2",
      "code3",
      "code4",
      "code5",
      "code6",
      "code7",
      "code8",
      "code9",
      "code10"
    ]
  },
  "msg": "MFA enabled"
}
```

---

### POST /auth/mfa/verify

Verify TOTP code (general verification, not login).

**Authentication:** Required

**Request:**

```json
{
  "code": "123456"
}
```

**Response:**

```json
{
  "success": true,
  "msg": "Code verified"
}
```

---

### POST /auth/mfa/disable

Disable MFA. Requires password and current TOTP code.

**Authentication:** Required

**Request:**

```json
{
  "password": "currentpassword",
  "code": "123456"
}
```

**Response:**

```json
{
  "success": true,
  "msg": "MFA disabled"
}
```

---

### GET /auth/mfa/status

Get MFA status for current user.

**Authentication:** Required

**Response:**

```json
{
  "success": true,
  "data": {
    "mfa_enabled": true,
    "backup_codes_remaining": 8
  }
}
```

---

### POST /auth/mfa/backup/verify

Verify using backup code (general verification, not login).

**Authentication:** Required

**Request:**

```json
{
  "code": "backup-code-here"
}
```

**Response:**

```json
{
  "success": true,
  "msg": "Backup code verified"
}
```

---

### POST /auth/mfa/backup/regenerate

Regenerate backup codes. Requires TOTP verification.

**Authentication:** Required

**Request:**

```json
{
  "code": "123456"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "backup_codes": ["code1", "code2", "..."]
  },
  "msg": "Backup codes regenerated"
}
```

---

## MFA Login Verification

These endpoints complete login when MFA is required.

### POST /auth/mfa/login-verify

Verify TOTP during login.

**Authentication:** MFA challenge cookie

**Request:**

```json
{
  "code": "123456"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "user_id": "uuid",
    "email": "user@example.com",
    "is_active": true,
    "email_verified": true,
    "mfa_enabled": true,
    "auth_provider": "local",
    "can_create_orgs": true
  },
  "msg": "Login successful"
}
```

Sets auth cookies on success.

---

### POST /auth/mfa/login-backup

Use backup code during login.

**Authentication:** MFA challenge cookie

**Request:**

```json
{
  "code": "backup-code-here"
}
```

**Response:** Same as `/auth/mfa/login-verify`

---

## OAuth

### GET /oauth/google

Initiate Google OAuth flow.

**Authentication:** None

**Response:**

```json
{
  "success": true,
  "data": {
    "url": "https://accounts.google.com/o/oauth2/v2/auth?..."
  },
  "msg": "Redirect to Google"
}
```

Frontend should redirect user to the returned URL.

---

### GET /oauth/google/callback

Handle Google OAuth callback. Called by Google after user authorizes.

**Query Parameters:**

- `code` - Authorization code from Google
- `state` - State parameter for CSRF protection

**Response (new user or existing Google user):**

```json
{
  "success": true,
  "data": {
    "user_id": "uuid",
    "email": "user@example.com",
    "is_active": true
  },
  "msg": "Logged in with Google"
}
```

**Response (existing email, needs linking):**

```json
{
  "success": true,
  "data": {
    "needs_linking": true,
    "email": "user@example.com"
  },
  "msg": "Account exists. Enter password to link Google."
}
```

**Response (MFA required):**

```json
{
  "success": true,
  "data": {
    "mfa_required": true
  },
  "msg": "MFA verification required"
}
```

---

### POST /oauth/google/link

Link Google account to existing user. Used after `needs_linking` response.

**Authentication:** OAuth pending cookie

**Request:**

```json
{
  "password": "currentpassword"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "user_id": "uuid"
  },
  "msg": "Google account linked successfully"
}
```

---

### POST /oauth/google/unlink

Unlink Google account. User must have a password set.

**Authentication:** Required

**Response:**

```json
{
  "success": true,
  "msg": "Google account unlinked"
}
```

---

## Organizations

### GET /organizations

List all organizations the user is a member of.

**Authentication:** Required

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "My Organization",
      "slug": "my-organization",
      "role": "owner",
      "member_count": 5
    }
  ]
}
```

---

### POST /organizations

Create a new organization.

**Authentication:** Required (must have org creation permission)

**Request:**

```json
{
  "name": "New Organization"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "New Organization",
    "slug": "new-organization",
    "owner_id": "user-uuid"
  },
  "msg": "Organization created"
}
```

**Errors:**

- `403` - User cannot create organizations (based on `ORG_CREATION_MODE` or `can_create_orgs`)

---

### GET /organizations/:organizationId

Get organization details.

**Authentication:** Required (must be member)

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "My Organization",
    "slug": "my-organization",
    "owner_id": "user-uuid",
    "created_at": "2024-01-01T00:00:00.000Z",
    "role": "owner",
    "member_count": 5
  }
}
```

---

### PUT /organizations/:organizationId

Update organization.

**Authentication:** Required (admin or owner)

**Request:**

```json
{
  "name": "Updated Name"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Updated Name",
    "slug": "updated-name"
  },
  "msg": "Organization updated"
}
```

---

### DELETE /organizations/:organizationId

Delete organization.

**Authentication:** Required (owner only)

**Response:**

```json
{
  "success": true,
  "msg": "Organization deleted"
}
```

---

### GET /organizations/:organizationId/members

List organization members.

**Authentication:** Required (must be member)

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "user_id": "uuid",
      "email": "user@example.com",
      "role": "owner",
      "joined_at": "2024-01-01T00:00:00.000Z"
    },
    {
      "user_id": "uuid",
      "email": "member@example.com",
      "role": "member",
      "joined_at": "2024-01-15T00:00:00.000Z"
    }
  ]
}
```

---

### POST /organizations/:organizationId/members

Add a member directly (user must already exist).

**Authentication:** Required (admin or owner)

**Request:**

```json
{
  "user_id": "uuid",
  "role": "member"
}
```

**Response:**

```json
{
  "success": true,
  "msg": "Member added"
}
```

---

### PUT /organizations/:organizationId/members/:userId

Update member role.

**Authentication:** Required (admin or owner)

**Request:**

```json
{
  "role": "admin"
}
```

**Response:**

```json
{
  "success": true,
  "msg": "Role updated"
}
```

**Note:** Cannot change owner's role. Use transfer ownership instead.

---

### DELETE /organizations/:organizationId/members/:userId

Remove member from organization.

**Authentication:** Required (admin or owner, or self)

**Response:**

```json
{
  "success": true,
  "msg": "Member removed"
}
```

**Note:** Owner cannot be removed. Transfer ownership first.

---

### POST /organizations/:organizationId/leave

Leave organization.

**Authentication:** Required (must be member, cannot be owner)

**Response:**

```json
{
  "success": true,
  "msg": "Left organization"
}
```

---

### POST /organizations/:organizationId/transfer-ownership

Transfer organization ownership to another member.

**Authentication:** Required (owner only)

**Request:**

```json
{
  "new_owner_id": "user-uuid"
}
```

**Response:**

```json
{
  "success": true,
  "msg": "Ownership transferred"
}
```

---

### POST /organizations/:organizationId/invite

Send invitation to join organization.

**Authentication:** Required (admin or owner)

**Request:**

```json
{
  "email": "newmember@example.com",
  "role": "member"
}
```

**Response:**

```json
{
  "success": true,
  "msg": "Invitation sent"
}
```

If user doesn't exist, they'll create an account when accepting.

---

### GET /organizations/:organizationId/invitations

List pending invitations.

**Authentication:** Required (admin or owner)

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "email": "pending@example.com",
      "role": "member",
      "created_at": "2024-01-01T00:00:00.000Z",
      "expires_at": "2024-01-08T00:00:00.000Z"
    }
  ]
}
```

---

### DELETE /organizations/:organizationId/invitations/:invitationId

Cancel pending invitation.

**Authentication:** Required (admin or owner)

**Response:**

```json
{
  "success": true,
  "msg": "Invitation cancelled"
}
```

---

## Invitations

### GET /invitations/:token

Get invitation details by token.

**Authentication:** None

**Response:**

```json
{
  "success": true,
  "data": {
    "email": "invited@example.com",
    "type": "org_invite",
    "organization_name": "My Organization",
    "role": "member",
    "is_existing_user": false
  }
}
```

---

### POST /invitations/:token/accept

Accept invitation.

**Authentication:** None (for new users) or Required (for existing users)

**Request (new user):**

```json
{
  "password": "newpassword123"
}
```

**Request (existing user):**

```json
{
  "password": "existingpassword"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "user_id": "uuid",
    "organization_id": "uuid"
  },
  "msg": "Invitation accepted"
}
```

Sets auth cookies for new users.

---

## Admin Authentication

### POST /admin/auth/login

Admin login.

**Authentication:** None

**Request:**

```json
{
  "email": "admin@example.com",
  "password": "adminpassword"
}
```

**Response (no MFA):**

```json
{
  "success": true,
  "data": {
    "admin_id": "uuid",
    "email": "admin@example.com",
    "root": true,
    "mfa_enabled": false
  },
  "msg": "Login successful"
}
```

**Response (MFA required):**

```json
{
  "success": true,
  "data": {
    "mfa_required": true
  },
  "msg": "MFA verification required"
}
```

---

### GET /admin/auth/me

Get current admin profile.

**Authentication:** Admin required

**Response:**

```json
{
  "success": true,
  "data": {
    "admin_id": "uuid",
    "email": "admin@example.com",
    "root": true,
    "mfa_enabled": false
  }
}
```

---

### POST /admin/auth/logout

Admin logout.

**Authentication:** Admin required

**Response:**

```json
{
  "success": true,
  "msg": "Logged out"
}
```

---

### POST /admin/auth/mfa/login-verify

Admin MFA verification during login.

**Authentication:** Admin MFA challenge cookie

**Request:**

```json
{
  "code": "123456"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "admin_id": "uuid",
    "email": "admin@example.com",
    "root": true,
    "mfa_enabled": true
  },
  "msg": "Login successful"
}
```

---

### POST /admin/auth/mfa/login-backup

Admin backup code during login.

**Authentication:** Admin MFA challenge cookie

**Request:**

```json
{
  "code": "backup-code"
}
```

**Response:** Same as `/admin/auth/mfa/login-verify`

---

## Admin MFA Management

### POST /admin/auth/mfa/setup

Start MFA setup for admin.

**Authentication:** Admin required

**Response:**

```json
{
  "success": true,
  "data": {
    "qr_code": "data:image/png;base64,...",
    "secret": "JBSWY3DPEHPK3PXP"
  }
}
```

---

### POST /admin/auth/mfa/verify-setup

Complete admin MFA setup.

**Authentication:** Admin required

**Request:**

```json
{
  "code": "123456"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "backup_codes": ["code1", "code2", "..."]
  },
  "msg": "MFA enabled"
}
```

---

### POST /admin/auth/mfa/disable

Disable admin MFA.

**Authentication:** Admin required

**Request:**

```json
{
  "password": "adminpassword",
  "code": "123456"
}
```

**Response:**

```json
{
  "success": true,
  "msg": "MFA disabled"
}
```

---

### GET /admin/auth/mfa/status

Get admin MFA status.

**Authentication:** Admin required

**Response:**

```json
{
  "success": true,
  "data": {
    "mfa_enabled": true,
    "backup_codes_remaining": 10
  }
}
```

---

### POST /admin/auth/mfa/backup/verify

Verify admin backup code.

**Authentication:** Admin required

**Request:**

```json
{
  "code": "backup-code"
}
```

---

### POST /admin/auth/mfa/backup/regenerate

Regenerate admin backup codes.

**Authentication:** Admin required

**Request:**

```json
{
  "code": "123456"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "backup_codes": ["code1", "code2", "..."]
  }
}
```

---

## Admin User Management

### GET /admin/users

List all users.

**Authentication:** Admin required

**Query Parameters:**

- `page` (optional) - Page number
- `limit` (optional) - Items per page
- `search` (optional) - Search by email

**Response:**

```json
{
  "success": true,
  "data": {
    "users": [
      {
        "user_id": "uuid",
        "email": "user@example.com",
        "is_active": true,
        "email_verified": true,
        "mfa_enabled": false,
        "auth_provider": "local",
        "created_through": "self_registered",
        "can_create_orgs": null,
        "created_at": "2024-01-01T00:00:00.000Z"
      }
    ],
    "total": 100,
    "page": 1,
    "limit": 20
  }
}
```

---

### POST /admin/users

Create user via invitation. Sends invitation email.

**Authentication:** Admin required

**Request:**

```json
{
  "email": "newuser@example.com"
}
```

**Response:**

```json
{
  "success": true,
  "msg": "Invitation sent"
}
```

---

### GET /admin/users/:userId

Get user details.

**Authentication:** Admin required

**Response:**

```json
{
  "success": true,
  "data": {
    "user_id": "uuid",
    "email": "user@example.com",
    "is_active": true,
    "email_verified": true,
    "mfa_enabled": false,
    "auth_provider": "local",
    "created_through": "self_registered",
    "can_create_orgs": null,
    "created_at": "2024-01-01T00:00:00.000Z",
    "organizations": [
      {
        "id": "uuid",
        "name": "Org Name",
        "role": "member"
      }
    ]
  }
}
```

---

### PUT /admin/users/:userId

Update user.

**Authentication:** Admin required

**Request:**

```json
{
  "email": "updated@example.com",
  "is_active": true
}
```

**Response:**

```json
{
  "success": true,
  "msg": "User updated"
}
```

---

### DELETE /admin/users/:userId

Delete user (soft delete).

**Authentication:** Admin required

**Response:**

```json
{
  "success": true,
  "msg": "User deleted"
}
```

---

### POST /admin/users/:userId/reset-password

Send password reset email to user.

**Authentication:** Admin required

**Response:**

```json
{
  "success": true,
  "msg": "Password reset email sent"
}
```

---

### PATCH /admin/users/:userId/org-permission

Override user's organization creation permission.

**Authentication:** Admin required

**Request:**

```json
{
  "can_create_orgs": true
}
```

Use `null` to revert to default behavior based on `ORG_CREATION_MODE`.

**Response:**

```json
{
  "success": true,
  "msg": "Permission updated"
}
```

---

### POST /admin/users/:userId/disable-mfa

Disable MFA for a user (admin override).

**Authentication:** Admin required

**Response:**

```json
{
  "success": true,
  "msg": "MFA disabled for user"
}
```

---

## Admin Organization Management

### GET /admin/organizations

List all organizations.

**Authentication:** Admin required

**Query Parameters:**

- `page` (optional)
- `limit` (optional)
- `search` (optional) - Search by name or slug

**Response:**

```json
{
  "success": true,
  "data": {
    "organizations": [
      {
        "id": "uuid",
        "name": "Organization Name",
        "slug": "organization-name",
        "owner_id": "user-uuid",
        "owner_email": "owner@example.com",
        "member_count": 5,
        "created_at": "2024-01-01T00:00:00.000Z"
      }
    ],
    "total": 50,
    "page": 1,
    "limit": 20
  }
}
```

---

### GET /admin/organizations/stats

Get organization statistics.

**Authentication:** Admin required

**Response:**

```json
{
  "success": true,
  "data": {
    "total_organizations": 50,
    "total_members": 200,
    "avg_members_per_org": 4
  }
}
```

---

### POST /admin/organizations

Create organization with specified owner.

**Authentication:** Admin required

**Request:**

```json
{
  "name": "New Organization",
  "owner_id": "user-uuid"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "New Organization",
    "slug": "new-organization",
    "owner_id": "user-uuid"
  },
  "msg": "Organization created"
}
```

---

### GET /admin/organizations/:organizationId

Get organization details.

**Authentication:** Admin required

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Organization Name",
    "slug": "organization-name",
    "owner_id": "user-uuid",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

---

### PUT /admin/organizations/:organizationId

Update organization.

**Authentication:** Admin required

**Request:**

```json
{
  "name": "Updated Name"
}
```

**Response:**

```json
{
  "success": true,
  "msg": "Organization updated"
}
```

---

### DELETE /admin/organizations/:organizationId

Delete organization.

**Authentication:** Admin required

**Response:**

```json
{
  "success": true,
  "msg": "Organization deleted"
}
```

---

### GET /admin/organizations/:organizationId/members

List organization members.

**Authentication:** Admin required

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "user_id": "uuid",
      "email": "user@example.com",
      "role": "owner",
      "joined_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### POST /admin/organizations/:organizationId/members

Add member to organization.

**Authentication:** Admin required

**Request:**

```json
{
  "user_id": "uuid",
  "role": "member"
}
```

**Response:**

```json
{
  "success": true,
  "msg": "Member added"
}
```

---

### PUT /admin/organizations/:organizationId/members/:userId

Update member role.

**Authentication:** Admin required

**Request:**

```json
{
  "role": "admin"
}
```

**Response:**

```json
{
  "success": true,
  "msg": "Role updated"
}
```

---

### DELETE /admin/organizations/:organizationId/members/:userId

Remove member from organization.

**Authentication:** Admin required

**Response:**

```json
{
  "success": true,
  "msg": "Member removed"
}
```
