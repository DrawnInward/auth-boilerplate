# Auth Boilerplate

A Node.js/Express authentication and multi-tenancy starter. Provides user and admin authentication with JWT tokens, plus organization-based tenancy with role-based membership.

## What's Included

- **User authentication**: Registration, login, password management, email verification tracking
- **Admin authentication**: Separate admin accounts with root admin privileges
- **Multi-tenancy**: Organizations with owner, admin, member, and viewer roles
- **JWT auth**: Access and refresh token pattern with cookie storage
- **PostgreSQL**: Database schema, connection pooling, seed scripts

## Project Structure

```
src/
  routes/        # API endpoint definitions
  controllers/   # Business logic
  models/        # Database operations
  middleware/    # Auth and validation
  types/         # TypeScript definitions
  database/      # Schema, seeding, connection
```

## Setup

Requires Node.js and PostgreSQL.

One-time PostgreSQL setup (if not already done):
```bash
sudo -u postgres createuser -s $(whoami)
```

Then run:
```bash
npm install
npm run setup
npm run seed
```

To use a custom project name for the database:
```bash
PROJECT_NAME=myproject npm run setup
```

This creates `myproject_db`, `myproject_user`, and `test_myproject_db`. Default is `app`.

## Environment Variables

Created by setup:
- `.env` - JWT keys (REFRESH_KEY, USER_ACCESS_KEY, ADMIN_ACCESS_KEY)
- `.env.development` - Dev database config
- `.env.test` - Test database config

Optional:
- `DB_PASSWORD` - PostgreSQL password (default: Password1)
- `PROJECT_NAME` - Database naming prefix (default: app)
- `PORT` - Server port (default: 3000)
- `ALLOWED_ORIGIN` - CORS origin (default: http://localhost:5173)

### Registration Modes

Control who can create accounts and organizations:

- `ACCOUNT_CREATION_MODE` - Who can create accounts
  - `open` (default) - Anyone can self-register
  - `invite_only` - Only invited users can join
  - `admin_only` - Only admins can create users

- `ORG_CREATION_MODE` - Who can create organizations
  - `open` (default) - Any user can create organizations
  - `self_registered_only` - Only self-registered users can create orgs
  - `admin_only` - Only admins can provision organizations

**Example configurations:**

```bash
# Open SaaS (default)
ACCOUNT_CREATION_MODE=open
ORG_CREATION_MODE=open

# Enterprise B2B
ACCOUNT_CREATION_MODE=invite_only
ORG_CREATION_MODE=admin_only

# Hybrid (users can sign up, but org-invited users can't create their own orgs)
ACCOUNT_CREATION_MODE=open
ORG_CREATION_MODE=self_registered_only
```

Admins can override org creation permission per-user via `PATCH /api/admin/users/:userId/org-permission`.

## Scripts

```bash
npm run dev      # Start dev server
npm run setup    # Generate keys and create databases
npm run seed     # Seed database with dev data
npm run test     # Run tests
```

## API Overview

### User Routes
- `POST /api/auth/register` - Register
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `POST /api/auth/refresh` - Refresh tokens

### Admin Routes
- `POST /api/admin/auth/login` - Admin login
- `GET /api/admin/users` - List users
- `GET /api/admin/users/stats` - User statistics

### Organization Routes
- `POST /api/user/organizations` - Create organization
- `GET /api/user/organizations` - List user's organizations
- `POST /api/user/organizations/:id/members` - Add member
