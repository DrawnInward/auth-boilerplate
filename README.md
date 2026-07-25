# Auth Boilerplate

A drop-in authentication and multi-tenancy starter for Node.js applications. Provides user and admin authentication with JWT tokens, MFA support, OAuth integration, and organization-based multi-tenancy with role-based access control.

## Features

- **User Authentication**: Registration, login, password reset, email verification, email change
- **Admin Authentication**: Separate admin accounts with root admin privileges
- **Multi-Factor Authentication**: TOTP-based MFA with backup codes for both users and admins
- **OAuth**: Google sign-in and account linking
- **Multi-Tenancy**: Organizations with owner/admin/member/viewer roles
- **Invitations**: Email-based invitations for org membership and user registration
- **Configurable Access**: Control who can register and create organizations via environment variables

## Project Structure

This is a monorepo with three packages:

```
packages/
  api/      # Express.js backend (Node.js/TypeScript)
  web/      # React frontend (Vite/TypeScript)
  shared/   # Shared TypeScript types and Zod schemas
```

### Backend Structure

```
packages/api/src/
  controllers/     # Request handlers (business logic)
    user/          # User-facing endpoints (auth, orgs, invitations, mfa, oauth)
    admin/         # Admin endpoints (user management, org management)
  routes/          # Route definitions
  models/          # Database queries
  middleware/      # Auth guards, validation, rate limiting
  database/        # Schema, seeding, connection pool
  utils/           # Helpers (tokens, encryption, email)
  types/           # TypeScript definitions
```

### Frontend Structure

```
packages/web/src/
  api/             # API client and React Query hooks
  components/      # UI components (shadcn/ui) and layouts
  features/        # Feature modules
    auth/          # Login, register, MFA verification
    settings/      # Profile, security, OAuth management
    organizations/ # Org listing, detail, member management
    invitations/   # Invitation acceptance
    admin/         # Admin panel (users, orgs)
  routes/          # Route definitions and auth guards
```

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL

### Setup

One-time PostgreSQL setup (if your user doesn't have createdb privileges):

```bash
sudo -u postgres createuser -s $(whoami)
```

Install and initialize:

```bash
npm install
npm run setup
npm run seed
```

To use a custom project name or database password:

```bash
PROJECT_NAME=myproject DB_PASSWORD=mysecretpassword npm run setup
```

This creates databases named `myproject_db` and `test_myproject_db` with the specified password. Defaults are `app` and `Password1`.

### Running

```bash
# Terminal 1 - API server (port 3000)
npm run dev:api

# Terminal 2 - Web frontend (port 5173)
npm run dev:web
```

### Default Credentials (Development)

After running `npm run seed`:

- **User**: `demo@example.com` / `Password1`
- **Admin**: `root.admin@test.com` / `Password1`

These are defined in `packages/api/src/database/dev-data/` and can be modified or extended for e2e testing.

## Configuration

### Environment Files

The setup script generates three env files in `packages/api/`:

| File               | Purpose                                         |
| ------------------ | ----------------------------------------------- |
| `.env`             | JWT keys, registration modes, OAuth credentials |
| `.env.development` | Development database connection                 |
| `.env.test`        | Test database connection                        |

### Core Variables

| Variable         | Default                 | Description                                |
| ---------------- | ----------------------- | ------------------------------------------ |
| `PORT`           | `3000`                  | API server port                            |
| `ALLOWED_ORIGIN` | `http://localhost:5173` | CORS origin for frontend                   |
| `NODE_ENV`       | `development`           | Environment (development/test/production)  |
| `DB_PASSWORD`    | `Password1`             | PostgreSQL password (used during setup)    |
| `PROJECT_NAME`   | `app`                   | Database naming prefix (used during setup) |

### JWT Keys (Auto-generated)

| Variable             | Description                                    |
| -------------------- | ---------------------------------------------- |
| `REFRESH_KEY`        | Signs refresh tokens                           |
| `USER_ACCESS_KEY`    | Signs user access tokens                       |
| `ADMIN_ACCESS_KEY`   | Signs admin access tokens                      |
| `MFA_CHALLENGE_KEY`  | Signs MFA challenge tokens                     |
| `MFA_ENCRYPTION_KEY` | Encrypts MFA secrets in database (AES-256-GCM) |

### Token Settings

| Variable             | Default | Description                    |
| -------------------- | ------- | ------------------------------ |
| `REFRESH_TOKEN_DAYS` | `7`     | Refresh token lifetime in days |

### Registration Modes

Control who can create accounts and organizations:

| Variable                | Options                                      | Description                  |
| ----------------------- | -------------------------------------------- | ---------------------------- |
| `ACCOUNT_CREATION_MODE` | `open`, `invite_only`, `admin_only`          | Who can create accounts      |
| `ORG_CREATION_MODE`     | `open`, `self_registered_only`, `admin_only` | Who can create organizations |

**Example configurations:**

```bash
# Open SaaS (default) - anyone can register and create orgs
ACCOUNT_CREATION_MODE=open
ORG_CREATION_MODE=open

# Enterprise B2B - admin provisions everything
ACCOUNT_CREATION_MODE=invite_only
ORG_CREATION_MODE=admin_only

# Hybrid - users can register, but only self-registered users can create orgs
# (users invited to orgs can't create their own)
ACCOUNT_CREATION_MODE=open
ORG_CREATION_MODE=self_registered_only
```

Admins can override org creation permission per-user via `PATCH /api/admin/users/:userId/org-permission`.

### Google OAuth (Optional)

To enable Google sign-in:

1. Create credentials in [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Add authorized redirect URI: `http://localhost:3000/api/oauth/google/callback`
3. Set environment variables:

```bash
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/oauth/google/callback
```

The frontend shows/hides Google sign-in based on whether OAuth is configured (via `GET /api/config`).

### Email

By default, emails are logged to console. For production, implement your own email service wrapper in `packages/api/src/utils/email/`. A SendGrid implementation is included as a reference.

## Architecture

### Authentication Flow

The API uses JWT tokens stored in HTTP-only cookies:

1. **Login**: User provides credentials
2. **Token Generation**: Server returns `access_token` (15min) and `refresh_token` (7 days) in cookies
3. **Authenticated Requests**: Browser automatically sends cookies
4. **Token Refresh**: When access token expires, the refresh token is used to get a new access token. The refresh token is rotated on each use (old token invalidated, new token issued). If a used refresh token is reused, all tokens for that user are revoked (replay attack detection).
5. **Logout**: Clears cookies and invalidates refresh token

### MFA Flow

When MFA is enabled for a user:

1. **Login**: Password verified, but instead of tokens, server returns `{ mfa_required: true }` and sets an `mfa_challenge` cookie
2. **MFA Verify**: User submits TOTP code to `/api/auth/mfa/login-verify`
3. **Token Generation**: If TOTP valid, server returns tokens as normal

Backup codes work the same way via `/api/auth/mfa/login-backup`.

### Rate Limiting

Rate limiting is applied at multiple levels to protect against abuse:

| Limiter | Limit                | Applied To                      |
| ------- | -------------------- | ------------------------------- |
| Global  | 500 req / 15 min     | All routes                      |
| Auth    | 10 attempts / 15 min | Login, register, password reset |
| Strict  | 5 attempts / hour    | Sensitive operations            |
| API     | 100 req / 15 min     | General API endpoints           |

Rate limiting is disabled in test environment. Configuration is in `packages/api/src/middleware/rateLimiter.ts`.

### Organization Roles

| Role     | Permissions                                       |
| -------- | ------------------------------------------------- |
| `owner`  | Full control, can transfer ownership, delete org  |
| `admin`  | Manage members, send invites, update org settings |
| `member` | Standard access                                   |
| `viewer` | Read-only access                                  |

### Frontend-Backend Interaction

The frontend uses React Query for data fetching:

- **API client** (`packages/web/src/api/client.ts`): Fetch wrapper that includes credentials (cookies)
- **Auth state** (`packages/web/src/features/auth/context/AuthContext.tsx`): Calls `/api/auth/me` on mount, provides user state to app
- **Protected routes** (`packages/web/src/routes/ProtectedRoute.tsx`): Redirects to `/login` if not authenticated

### Database Schema

Seven tables provide the authentication foundation:

| Table                  | Purpose                                                                       |
| ---------------------- | ----------------------------------------------------------------------------- |
| `users`                | User accounts (email, password hash, MFA settings, OAuth IDs)                 |
| `admins`               | Admin accounts (separate from users)                                          |
| `refresh`              | Refresh tokens (hashed, with expiry and role info)                            |
| `organizations`        | Organization records (name, slug, owner)                                      |
| `organization_members` | Membership junction (user, org, role)                                         |
| `invitations`          | All invitation types (registration, org invite, password reset, email change) |
| `mfa_backup_codes`     | Hashed backup codes for MFA recovery                                          |

Add your application's tables alongside these. The schema is defined in `packages/api/src/database/seed.ts`.

## Extending the Boilerplate

To add new features:

- **Controllers** go in `packages/api/src/controllers/` - create new directories for your domain (e.g., `products/`, `billing/`)
- **Routes** go in `packages/api/src/routes/` and are registered in `routes/index.ts`
- **Database queries** go in `packages/api/src/models/`
- **Shared types** go in `packages/shared/src/types/` (available to both FE and BE)
- **Frontend features** go in `packages/web/src/features/` with API hooks in `packages/web/src/api/queries/`

### Authentication Middleware

The `authoriseUser` middleware validates JWTs and checks role types:

```typescript
import { authoriseUser } from "../../middleware/authoriseUser";

// Only users can access
router.get("/profile", authoriseUser(["user"]), getProfile);

// Both users and admins can access
router.get("/shared", authoriseUser(["user", "admin"]), getShared);
```

To add new role types, update the middleware and add corresponding JWT signing keys.

### Organization-Scoped Routes

Use the organization middleware for routes that need org context:

```typescript
import { requireOrgRole } from "../../middleware/organizationMiddleware";

// Only org admins and owners can access
router.post(
  "/organizations/:organizationId/settings",
  authoriseUser(["user"]),
  requireOrgRole(["admin", "owner"]),
  updateSettings,
);
```

The middleware validates membership and attaches `req.membership` with role info.

### Shared Types

The `packages/shared` package contains Zod schemas and TypeScript types used by both frontend and backend:

```typescript
import { userSchema, type User } from "@auth-boilerplate/shared";
```

Add new shared types in `packages/shared/src/types/`.

## Scripts

| Command           | Description                             |
| ----------------- | --------------------------------------- |
| `npm run dev:api` | Start API dev server with hot reload    |
| `npm run dev:web` | Start frontend dev server               |
| `npm run build`   | Build all packages                      |
| `npm run test`    | Run backend tests (Jest)                |
| `npm run setup`   | Generate env files and create databases |
| `npm run seed`    | Seed database with development data     |

## API Overview

The API provides endpoints for:

- **User Auth** (`/api/auth/*`): Register, login, logout, password reset, email change, token refresh
- **User MFA** (`/api/auth/mfa/*`): Setup, verify, disable, backup codes
- **OAuth** (`/api/oauth/*`): Google sign-in, account linking/unlinking
- **Organizations** (`/api/organizations/*`): CRUD, member management, invitations, ownership transfer
- **Invitations** (`/api/invitations/*`): View and accept invitations
- **Admin Auth** (`/api/admin/auth/*`): Admin login, MFA
- **Admin Management** (`/api/admin/users/*`, `/api/admin/organizations/*`): User and org administration
- **Config** (`/api/config`): Public endpoint returning enabled features (OAuth, registration modes)

All endpoints return JSON in the format `{ success: true, data: {...}, msg: "..." }` or `{ success: false, msg: "Error message" }`.

See [docs/api-reference.md](docs/api-reference.md) for complete endpoint documentation with request/response examples.
