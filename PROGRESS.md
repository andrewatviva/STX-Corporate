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
| 3 | Tenant config + Admin Panel | 🔜 Next |
| 4 | Trip management | ⏳ Pending |
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
- Stub pages for all routes (placeholders until each phase builds them out)

### Phase 2 — Security Rules + Custom Claims ✅
- Firestore security rules written and deployed to `stx-corporate-dev`
  - Client users strictly isolated to their own tenant's data
  - STX staff have cross-tenant read/write access
  - Unauthenticated users denied everything
- `syncUserClaims` Cloud Function — fires automatically when a user profile is written to Firestore; sets `role` + `clientId` as JWT custom claims
- `refreshUserClaims` Cloud Function — HTTPS callable; STX admin can force-refresh a user's claims after a role change
- First STX admin user created: `andrew@travelwithviva.com` (role: `stx_admin`)
- Login → Dashboard flow confirmed working

---

## Coming Up

### Phase 3 — Tenant Configuration + Admin Panel 🔜
**What gets built:**
- STX Admin Panel page (only visible to `stx_admin`)
- Create and configure client tenants through the UI (no code changes needed to add a new client)
- Fields: branding (logo, colours, portal title), cost centres, fees, workflow rules, feature flags
- User management: create users, assign roles, assign to clients
- Two seeded mock tenants to demonstrate the multi-tenant system working

**Why this matters:** After Phase 3, onboarding a new corporate client is just a few clicks.

### Phase 4 — Trip Management
Full trip lifecycle: create, submit, approve, amend, complete. All dropdowns and fees driven by tenant config.

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
| `src/components/layout/AppShell.jsx` | Main layout wrapper |
| `src/components/layout/Sidebar.jsx` | Permission-filtered nav |
| `src/components/layout/TopBar.jsx` | Tenant branding + user menu |
| `src/components/auth/LoginPage.jsx` | Login + forgot password |
| `src/components/shared/PermissionGate.jsx` | Conditional render by permission |
| `firestore.rules` | Firestore security rules |
| `functions/index.js` | Cloud Functions (custom claims) |
| `scripts/createAdminUser.js` | One-off script to create first admin |
| `.github/workflows/deploy-dev.yml` | CI/CD → dev on push to main |
| `.github/workflows/deploy-prod.yml` | CI/CD → prod on push to prod branch |
| `Commercialisation/IMPLEMENTATION_PLAN.md` | Full technical plan (in stx-portal repo) |

---

## Firebase Projects

| Environment | Project ID | URL |
|-------------|------------|-----|
| Dev | `stx-corporate-dev` | stx-corporate-dev.web.app |
| Prod | `stx-corporate` | stx-corporate.web.app |

*Last updated: 26 April 2026 — Phase 2 complete*
