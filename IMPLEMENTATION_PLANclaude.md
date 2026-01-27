# Frontend Implementation Plan

## Overview

React frontend for auth-boilerplate with complete authentication, user management, organization management, and admin functionality.

## Tech Stack

- **Build**: Vite
- **Framework**: React 18 + TypeScript
- **UI**: shadcn/ui + Tailwind CSS
- **Routing**: React Router v6 with Outlet
- **Data Fetching**: React Query (@tanstack/react-query)
- **Forms**: React Hook Form + Zod (shared schemas)
- **State**: React Context + useState

---

## Directory Structure

```
packages/web/
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── package.json
└── src/
    ├── main.tsx                    # App entry point
    ├── App.tsx                     # Root component with providers
    ├── index.css                   # Tailwind imports
    │
    ├── api/
    │   ├── client.ts               # Fetch wrapper with credentials
    │   └── queries/
    │       ├── auth.ts             # useLogin, useLogout, useMe, etc.
    │       ├── user.ts             # useChangePassword, useUpdateProfile
    │       ├── mfa.ts              # useMfaSetup, useMfaVerify, etc.
    │       ├── organizations.ts    # useOrganizations, useCreateOrg, etc.
    │       ├── invitations.ts      # useInvitation, useAcceptInvite
    │       └── admin.ts            # Admin-specific queries
    │
    ├── components/
    │   ├── ui/                     # shadcn components (button, input, etc.)
    │   ├── layout/
    │   │   ├── PublicLayout.tsx    # Layout for login/register pages
    │   │   ├── ProtectedLayout.tsx # Layout for authenticated users
    │   │   ├── AdminLayout.tsx     # Layout for admin panel
    │   │   ├── Header.tsx          # Navigation header
    │   │   └── Sidebar.tsx         # Admin sidebar
    │   └── shared/
    │       ├── LoadingSpinner.tsx
    │       ├── ErrorMessage.tsx
    │       └── ConfirmDialog.tsx
    │
    ├── features/
    │   ├── auth/
    │   │   ├── context/
    │   │   │   └── AuthContext.tsx     # User auth state & methods
    │   │   ├── components/
    │   │   │   ├── LoginForm.tsx
    │   │   │   ├── RegisterForm.tsx
    │   │   │   ├── MfaVerifyForm.tsx
    │   │   │   └── PasswordResetForm.tsx
    │   │   └── pages/
    │   │       ├── LoginPage.tsx
    │   │       ├── RegisterPage.tsx
    │   │       ├── VerifyEmailPage.tsx
    │   │       ├── CompleteRegistrationPage.tsx
    │   │       ├── ForgotPasswordPage.tsx
    │   │       ├── ResetPasswordPage.tsx
    │   │       └── MfaVerifyPage.tsx
    │   │
    │   ├── dashboard/
    │   │   └── pages/
    │   │       └── DashboardPage.tsx
    │   │
    │   ├── settings/
    │   │   ├── components/
    │   │   │   ├── ProfileTab.tsx
    │   │   │   ├── SecurityTab.tsx       # MFA setup/disable
    │   │   │   ├── OAuthTab.tsx          # Google link/unlink
    │   │   │   └── ChangePasswordForm.tsx
    │   │   └── pages/
    │   │       └── SettingsPage.tsx
    │   │
    │   ├── organizations/
    │   │   ├── components/
    │   │   │   ├── OrganizationCard.tsx
    │   │   │   ├── CreateOrgModal.tsx
    │   │   │   ├── MembersList.tsx
    │   │   │   ├── InviteMemberModal.tsx
    │   │   │   └── TransferOwnershipModal.tsx
    │   │   └── pages/
    │   │       ├── OrganizationsListPage.tsx
    │   │       └── OrganizationDetailPage.tsx
    │   │
    │   ├── invitations/
    │   │   └── pages/
    │   │       └── AcceptInvitePage.tsx
    │   │
    │   └── admin/
    │       ├── context/
    │       │   └── AdminAuthContext.tsx
    │       ├── components/
    │       │   ├── AdminLoginForm.tsx
    │       │   ├── UserTable.tsx
    │       │   ├── OrgTable.tsx
    │       │   └── StatsCard.tsx
    │       └── pages/
    │           ├── AdminLoginPage.tsx
    │           ├── AdminDashboardPage.tsx
    │           ├── AdminUsersPage.tsx
    │           ├── AdminUserDetailPage.tsx
    │           ├── AdminOrgsPage.tsx
    │           └── AdminOrgDetailPage.tsx
    │
    ├── routes/
    │   ├── index.tsx               # Route definitions
    │   ├── ProtectedRoute.tsx      # Auth guard for users
    │   └── AdminRoute.tsx          # Auth guard for admins
    │
    └── lib/
        └── utils.ts                # cn() helper for tailwind
```

---

## Implementation Phases

### Phase 2.1: Project Setup
1. Initialize Vite with React + TypeScript template
2. Install dependencies:
   - `react-router-dom`
   - `@tanstack/react-query`
   - `react-hook-form`
   - `@hookform/resolvers`
   - `tailwindcss`, `postcss`, `autoprefixer`
3. Initialize Tailwind CSS
4. Initialize shadcn/ui
5. Add `@auth-boilerplate/shared` as dependency
6. Create base folder structure

### Phase 2.2: Core Infrastructure
1. Create API client (`src/api/client.ts`)
2. Set up React Query provider
3. Create base layouts (Public, Protected, Admin)
4. Set up React Router with basic route structure
5. Add LoadingSpinner and ErrorMessage components

### Phase 3: Authentication
1. Create AuthContext with:
   - `user` state
   - `isLoading`, `isAuthenticated` flags
   - `mfaRequired` state for login flow
   - `login()`, `logout()`, `verifyMfa()` methods
2. Create auth query hooks:
   - `useMe()` - fetch current user
   - `useLogin()` - login mutation
   - `useLogout()` - logout mutation
   - `useMfaLoginVerify()` - MFA verification mutation
3. Implement pages:
   - LoginPage with MFA redirect
   - MfaVerifyPage (TOTP + backup code toggle)
   - RegisterPage
   - VerifyEmailPage (token validation)
   - CompleteRegistrationPage (set password)
   - ForgotPasswordPage
   - ResetPasswordPage
4. Create ProtectedRoute component

### Phase 4: User Features

#### 4.1 Dashboard
- Simple welcome page with user info
- Quick links to organizations

#### 4.2 Settings Page (Tabbed)
**Profile Tab:**
- Display email
- Edit email form

**Security Tab:**
- MFA status badge
- MFA setup flow:
  1. Click "Enable MFA"
  2. Show QR code from API
  3. Enter TOTP code to verify
  4. Display backup codes (save warning)
- Disable MFA (requires TOTP)
- Regenerate backup codes

**Password Tab:**
- Change password form (current + new + confirm)

**OAuth Tab:**
- Google linked status
- Link/unlink buttons

#### 4.3 Organizations
**List Page:**
- Grid of organization cards
- Role badge on each card
- Create organization button + modal

**Detail Page (tabbed):**
- Overview tab: name, slug, member count
- Members tab: list with role badges, add/remove/change role
- Invitations tab: pending invites, send new
- Settings tab (owner/admin): rename, delete, transfer ownership
- Leave button (non-owners)

### Phase 5: Invitations
**Accept Invite Page (`/invitations/:token`):**
1. Fetch invitation details via token
2. Display: org name, role, inviter
3. If existing user: show password field
4. If new user: show password field (creates account)
5. Submit -> redirect to organization

### Phase 6: Admin Panel

#### 6.1 Admin Auth
- Separate AdminAuthContext
- Admin login page at `/admin/login`
- Admin MFA flow (same as user)

#### 6.2 Admin Pages
**Dashboard:**
- User stats card
- Organization stats card
- Recent activity (optional)

**Users Page:**
- Table with search/filter
- Create user modal
- Columns: email, status, verified, MFA, created

**User Detail Page:**
- Edit form
- Reset password action
- Activate/deactivate toggle
- Organization memberships list

**Organizations Page:**
- Table with search
- Create organization modal
- Columns: name, slug, owner, members, created

**Organization Detail Page:**
- Edit form
- Members management
- Delete button

---

## API Endpoints Used

### User Auth
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/register` | Start registration |
| GET | `/api/auth/verify/:token` | Validate token |
| POST | `/api/auth/complete-registration` | Complete registration |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password` | Reset password |
| PUT | `/api/auth/change-password` | Change password |
| PUT | `/api/auth/profile` | Update profile |
| POST | `/api/auth/mfa/login-verify` | MFA TOTP verify |
| POST | `/api/auth/mfa/login-backup` | MFA backup code |
| POST | `/api/auth/set-password` | Set password (OAuth users) |

### User MFA
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/mfa/setup` | Start MFA setup |
| POST | `/api/auth/mfa/verify-setup` | Complete MFA setup |
| POST | `/api/auth/mfa/disable` | Disable MFA |
| POST | `/api/auth/mfa/backup-codes` | Regenerate backup codes |

### User Organizations
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/organizations` | List user's orgs |
| POST | `/api/organizations` | Create org |
| GET | `/api/organizations/:id` | Get org details |
| PUT | `/api/organizations/:id` | Update org |
| DELETE | `/api/organizations/:id` | Delete org |
| GET | `/api/organizations/:id/members` | List members |
| POST | `/api/organizations/:id/members` | Add member |
| PUT | `/api/organizations/:id/members/:userId` | Update role |
| DELETE | `/api/organizations/:id/members/:userId` | Remove member |
| POST | `/api/organizations/:id/transfer-ownership` | Transfer |
| POST | `/api/organizations/:id/leave` | Leave org |
| POST | `/api/organizations/:id/invite` | Send invite |
| GET | `/api/organizations/:id/invitations` | List invites |
| DELETE | `/api/organizations/:id/invitations/:inviteId` | Cancel |

### Invitations
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/invitations/:token` | Get invite details |
| POST | `/api/invitations/:token/accept` | Accept invite |

### Admin Auth
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/admin/auth/login` | Admin login |
| POST | `/api/admin/auth/logout` | Admin logout |
| GET | `/api/admin/auth/me` | Get current admin |
| POST | `/api/admin/auth/mfa/login-verify` | Admin MFA |
| POST | `/api/admin/auth/mfa/login-backup` | Admin backup |

### Admin Users
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/admin/users` | List users |
| POST | `/api/admin/users` | Create user |
| GET | `/api/admin/users/stats` | User stats |
| GET | `/api/admin/users/:id` | Get user |
| PUT | `/api/admin/users/:id` | Update user |
| DELETE | `/api/admin/users/:id` | Delete user |
| PUT | `/api/admin/users/:id/reset-password` | Reset password |

### Admin Organizations
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/admin/organizations` | List orgs |
| POST | `/api/admin/organizations` | Create org |
| GET | `/api/admin/organizations/stats` | Org stats |
| GET | `/api/admin/organizations/:id` | Get org |
| PUT | `/api/admin/organizations/:id` | Update org |
| DELETE | `/api/admin/organizations/:id` | Delete org |
| GET | `/api/admin/organizations/:id/members` | Members |
| POST | `/api/admin/organizations/:id/members` | Add member |
| PUT | `/api/admin/organizations/:id/members/:userId` | Update |
| DELETE | `/api/admin/organizations/:id/members/:userId` | Remove |

---

## shadcn Components to Install

```bash
# Core
npx shadcn@latest add button input label form card

# Layout
npx shadcn@latest add tabs separator navigation-menu

# Feedback
npx shadcn@latest add alert toast skeleton

# Data
npx shadcn@latest add table badge avatar

# Overlays
npx shadcn@latest add dialog dropdown-menu alert-dialog

# Selection
npx shadcn@latest add select checkbox
```

---

## Key Patterns

### API Client
```typescript
// src/api/client.ts
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}
```

### Auth Context Pattern
```typescript
// Check auth on mount
const { data: user, isLoading } = useQuery({
  queryKey: ['me'],
  queryFn: () => api.get('/auth/me'),
  retry: false,
});

// Provide to app
<AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user }}>
```

### Protected Route Pattern
```typescript
function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" />;
  return <Outlet />;
}
```

### Form Pattern
```typescript
const form = useForm<LoginDto>({
  resolver: zodResolver(loginUserSchema),
});

const mutation = useMutation({
  mutationFn: (data: LoginDto) => api.post('/auth/login', data),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
});
```

---

## Environment Variables

```env
VITE_API_URL=http://localhost:3000/api
```

---

## Route Structure

```typescript
// Public routes
/login
/register
/verify-email/:token
/complete-registration
/forgot-password
/reset-password/:token
/mfa-verify
/invitations/:token

// Protected user routes
/dashboard
/settings
/organizations
/organizations/:id

// Admin routes
/admin/login
/admin/mfa-verify
/admin (dashboard)
/admin/users
/admin/users/:id
/admin/organizations
/admin/organizations/:id
```
