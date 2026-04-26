# STX Corporate Portal V2 — Build Progress

**Repo:** github.com/andrewatviva/STX-Corporate  
**Dev app:** stx-corporate-dev.web.app  
**Prod app:** stx-corporate.web.app (not yet deployed)

---

## Phase Summary

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Project bootstrap | ✅ Complete |
| 1 | Core architecture | ✅ Complete |
| 2 | Security rules + custom claims | ✅ Complete |
| 3 | Tenant config + Admin Panel | ✅ Complete |
| 4 | Trip management | 🔜 Next |
| 5 | Passenger profiles | ⏳ Pending |
| 6 | Hotel booking (Nuitee) | ⏳ Pending |
| 7 | Invoice generation | ⏳ Pending |
| 8 | Reports | ⏳ Pending |
| 9 | STX global view | ⏳ Pending |
| 10 | QA, security testing + production deploy | ⏳ Pending |

---

## Completed Phases

### Phase 0 — Project Bootstrap ✅
- React app scaffolded at `C:/Users/andre/stx-corporate`
- Tailwind CSS v3, React Router v6, Firebase, Lucide React, Recharts installed
- GitHub repo created: `github.com/andrewatviva/STX-Corporate`
- Two Firebase projects connected:
  - Dev: `stx-corporate-dev` (used via `.env.development`)
  - Prod: `stx-corporate` (used via `.env.production`)
- GitHub Actions CI/CD configured:
  - Push to `main` → auto-deploys to `stx-corporate-dev`
  - Push to `prod` → auto-deploys to `stx-corporate` (production)
- App live at `stx-corporate-dev.web.app`

### Phase 1 — Core Architecture ✅
- `AuthContext` — manages Firebase auth state and loads user profile from Firestore
- `TenantContext` — loads `/clients/{clientId}/config/settings` on login; STX staff get global access
- `PermissionsContext` — derives permission set from user role
- Full PBAC permission system (`ROLE_PERMISSIONS` map in `src/utils/permissions.js`)
- React Router v6 with 8 routes: `/dashboard`, `/travel`, `/profiles`, `/invoices`, `/reports`, `/team`, `/admin`, `/contact`
- `AppShell` layout with permission-filtered sidebar and tenant-aware top bar
- Login page with email/password + forgot password
- `PermissionGate` component for conditionally rendering UI by permission
- Stub pages for all routes

### Phase 2 — Security Rules + Custom Claims ✅
- Firestore security rules written and deployed to `stx-corporate-dev`
  - Client users strictly isolated to their own tenant's data
  - STX staff have cross-tenant read/write access
  - Unauthenticated users denied everything
- `syncUserClaims` Cloud Function — fires automatically when a user profile is written; sets `role` + `clientId` as JWT custom claims
- `refreshUserClaims` Cloud Function — HTTPS callable; STX admin can force-refresh claims after a role change
- First STX admin user created: `andrew@travelwithviva.com` (role: `stx_admin`)
- Login → Dashboard flow confirmed working

### Phase 3 — Tenant Configuration + Admin Panel ✅
- **Admin Panel** page with two tabs: Clients and Users (visible to `stx_admin` only)
- **Client Manager** — list all tenants, create new clients, edit existing config
- **Client Form** — full config UI covering:
  - Identity (name, auto-generated clientId)
  - Branding (logo URL, portal title, primary/secondary colours)
  - Cost centres (tag-based add/remove list)
  - Trip and sector types (configurable lists)
  - Fees (management fee, amendment fee, GST rate — each with enable toggle)
  - Approval workflow (requires approval toggle, email notifications toggle)
  - Feature flags (hotel booking, invoicing, reports, accessibility toolbar, group events, file attachments, self-managed trips)
  - Hotel booking config (Nuitee feed selector, booking password toggle)
- **User Manager** — list all users, sorted by email
  - Create user: first name, last name, email, password, role, client assignment
  - Edit user: update name, role, client, active/inactive status
  - Password reset: generates a Firebase reset link (copy and share manually until email provider is wired up)
  - Delete user: `stx_admin` only, with confirmation modal warning deletion is permanent
- **Cloud Functions added:**
  - `createClientUser` — server-side user creation with proper error handling
  - `updateClientUser` — updates profile + syncs displayName to Firebase Auth
  - `deleteClientUser` — removes from Auth + Firestore, cannot delete own account
  - `sendPasswordReset` — generates a password reset link
- **Shared components added:** `Modal`, `Toggle`, `TagInput`
- Firestore rules updated to cover client root documents

---

## Coming Up

### Phase 4 — Trip Management 🔜
**What gets built:**
- `useTrips` hook — real-time Firestore listener, automatically tenant-scoped for client users, global for STX
- Trip list page — searchable, filterable table with status badges
- Trip creation form — all dropdowns driven by tenant config (cost centres, trip types, sector types)
- Sector sub-forms — separate component for each sector type: Flight, Accommodation, Car Hire, Parking, Transfers, Meals, Other
- Approval workflow — submit → pending approval → approved/declined (behaviour driven by `clientConfig.workflow`)
- Trip detail view — full trip info, amendment history, STX-only internal notes field
- File attachments — upload/download via Firebase Storage

### Phase 5 — Passenger Profiles
Accessibility-aware passenger profiles, tenant-scoped, linked to traveller user accounts.

### Phase 6 — Hotel Booking
Nuitee API integration for hotel search and booking, per-tenant configuration.

### Phase 7 — Invoice Generation
PDF invoice generation with tenant-specific branding, logos, and fee structures.

### Phase 8 — Reports
Four analytics reports, tenant-scoped for clients, aggregate view for STX.

### Phase 9 — STX Global View
Cross-tenant trip management dashboard for STX staff — see and manage all clients in one place.

### Phase 10 — QA + Production Deploy
Security rules testing, full regression checklist, deploy to `stx-corporate` production environment.

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/App.js` | Router + all context providers |
| `src/firebase.js` | Firebase init (reads from env vars) |
| `src/contexts/AuthContext.jsx` | Auth state + user profile |
| `src/contexts/TenantContext.jsx` | Tenant config loader |
| `src/contexts/PermissionsContext.jsx` | Permission set from role |
| `src/utils/permissions.js` | All permissions + role mappings |
| `src/utils/formatters.js` | Date/currency formatting helpers |
| `src/components/layout/AppShell.jsx` | Main layout wrapper |
| `src/components/layout/Sidebar.jsx` | Permission-filtered nav |
| `src/components/layout/TopBar.jsx` | Tenant branding + user menu |
| `src/components/auth/LoginPage.jsx` | Login + forgot password |
| `src/components/shared/PermissionGate.jsx` | Conditional render by permission |
| `src/components/shared/Modal.jsx` | Reusable modal wrapper |
| `src/components/shared/Toggle.jsx` | Reusable toggle switch |
| `src/components/shared/TagInput.jsx` | Add/remove tag list input |
| `src/components/admin/ClientManager.jsx` | List + create/edit tenants |
| `src/components/admin/ClientForm.jsx` | Full tenant config form |
| `src/components/admin/UserManager.jsx` | List + create/edit/delete users |
| `src/pages/AdminPanel.jsx` | Admin Panel page (Clients + Users tabs) |
| `firestore.rules` | Firestore security rules |
| `functions/index.js` | All Cloud Functions |
| `scripts/createAdminUser.js` | One-off script used to create first admin |
| `.github/workflows/deploy-dev.yml` | CI/CD → dev on push to main |
| `.github/workflows/deploy-prod.yml` | CI/CD → prod on push to prod branch |

---

## Firebase Projects

| Environment | Project ID | URL |
|-------------|------------|-----|
| Dev | `stx-corporate-dev` | stx-corporate-dev.web.app |
| Prod | `stx-corporate` | stx-corporate.web.app |

*Last updated: 26 April 2026 — Phase 3 complete*
