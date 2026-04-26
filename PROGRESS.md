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
| 3 | Tenant config + Admin Panel + Team Management | ✅ Complete |
| 4 | Trip management + Dashboard + STX client context | ✅ Complete |
| 5 | Passenger profiles | 🔜 Next |
| 6 | Hotel booking (Nuitee) | ⏳ Pending |
| 7 | Invoice generation | ⏳ Pending |
| 8 | Reports | ⏳ Pending |
| 9 | QA, security testing + production deploy | ⏳ Pending |

---

## Completed Phases

### Phase 0 — Project Bootstrap ✅
- React app scaffolded at `C:/Users/andre/stx-corporate`
- Tailwind CSS v3, React Router v7, Firebase, Lucide React, Recharts installed
- GitHub repo: `github.com/andrewatviva/STX-Corporate`
- Two Firebase projects connected:
  - Dev: `stx-corporate-dev` (`.env.development`)
  - Prod: `stx-corporate` (`.env.production`)
- GitHub Actions CI/CD: `main` → dev, `prod` branch → production
- App live at `stx-corporate-dev.web.app`

---

### Phase 1 — Core Architecture ✅
- `AuthContext` — Firebase auth state + user profile loaded from Firestore on login
- `TenantContext` — loads `/clients/{clientId}/config/settings`; STX staff get global access
- `PermissionsContext` — derives permission set from user role
- Full PBAC system (`ROLE_PERMISSIONS` map in `src/utils/permissions.js`)
- React Router v7 with 8 routes: `/dashboard`, `/travel`, `/profiles`, `/invoices`, `/reports`, `/team`, `/admin`, `/contact`
- `AppShell` layout with permission-filtered sidebar and tenant-aware top bar
- Login page with email/password + forgot password
- `PermissionGate` component for conditional rendering by permission
- Stub pages for all routes

---

### Phase 2 — Security Rules + Custom Claims ✅
- Firestore security rules written and deployed
  - Client users strictly isolated to their own tenant's data
  - STX staff have cross-tenant read/write access
  - Unauthenticated users denied everything
- `syncUserClaims` Cloud Function — fires on user profile write; sets role + clientId as JWT custom claims
- `refreshUserClaims` Cloud Function — force-refresh claims (stx_admin only)
- First STX admin user created: `andrew@travelwithviva.com`

---

### Phase 3 — Tenant Config + Admin Panel + Team Management ✅
- **Admin Panel** (visible to `stx_admin` only) with two tabs: Clients and Users
- **Client Manager** — list all tenants, create/edit clients
- **Client Form** — full config UI:
  - Identity (name, auto-generated clientId, active toggle)
  - Branding (logo URL, portal title, primary/secondary colours)
  - Cost centres (tag-based list)
  - Trip and sector types (configurable lists)
  - Fees (management fee, amendment fee, GST rate — each with enable toggle and trip-type scope)
  - Approval workflow (requires approval toggle, email notifications toggle)
  - Feature flags (hotel booking, invoicing, reports, accessibility toolbar, group events, file attachments, self-managed trips)
  - Hotel booking config (Nuitee feed selector, booking password toggle)
- **User Manager** — list all users, create/edit/delete with role and client assignment
- **Team Management** page (`/team`) — visible to `client_ops` and STX staff:
  - **Members tab** — table with name, role badge, "Reports to" column, active/inactive status
  - **Hierarchy tab** — tree view of the reporting structure with approver delegations shown inline
  - Edit modal includes:
    - Reports To dropdown (assigns `managerId` on user)
    - Approves For checklist (for `client_approver` role — assigns `approveFor[]` list of UIDs)
  - STX admins can permanently delete members; all others can deactivate only
- **Cloud Functions added:**
  - `createClientUser`, `updateClientUser`, `deleteClientUser`, `sendPasswordReset`
- **Shared components:** `Modal`, `Toggle`, `TagInput`

---

### Phase 4 — Trip Management + Dashboard + STX Client Context ✅

#### Trip Management (`/travel`)
- `useTrips` hook — real-time Firestore listener; uses `collectionGroup` for STX global view, filtered collection for client view or STX working-client
- **TripList** — searchable + filterable table; columns: trip, traveller, client (STX only), type, dates, ex-GST cost, status; attachment icon; `initialStatusFilter` from URL param
- **TripForm** — full trip creation/edit form:
  - All dropdowns driven by tenant config (cost centres, trip types)
  - Sector sub-forms: Flight, Accommodation, Car Hire, Parking, Transfers, Meals, Other
  - Each sector has International checkbox (GST-free flag)
  - Accommodation: cost × nights auto-calculation
  - Traveller name autocomplete from team members; auto-sets `travellerId` (UID) when matched
  - Client_traveller role auto-fills own name + UID on new trip
  - STX users can assign trip to any client
  - Save as draft or submit for approval in one click
- **TripDetail** — full trip view with:
  - Status badge, approve/decline/book/cancel/submit buttons (PBAC gated)
  - Amend vs Edit distinction: draft/declined → Edit; other statuses → Amend (with fee prompt)
  - Amendment fee prompt: checks client fee config, offers include/waive choice
  - Fees section: management fee (auto-applied on create), amendment fee (applied on amend); STX admin can delete fees
  - Attachments (Firebase Storage): upload/download/delete with 10 MB limit
  - Amendment history: full audit trail showing field-level diffs per save (what changed)
  - Internal notes (STX-only field)
  - Self-managed trips: client_ops/client_approver/client_traveller can mark as booked
- **Amendment/Edit flow:**
  - `diffTrip()` compares old vs new: title, trip type, traveller, dates, cost centre, purpose, notes, sector count changes, total cost change
  - `SECTOR_LABELS` and `calcSectorCost` are module-level constants (not inside component) — critical for diff correctness
- **Fee auto-application:**
  - Management fee applied on new trip creation if enabled in client config and trip type matches
  - Amendment fee prompted when STX amends a client trip

#### Dashboard (`/dashboard`)
- Status stat cards (8 statuses) — all clickable → navigate to filtered trip list; Pending Approval highlighted amber for approvers
- Expenditure section:
  - Australian FY (Jul–Jun) grouping by `createdAt` date
  - Incl. GST total + Ex-GST total (incl. fees) + GST-free (international sectors) pill
  - Monthly bar chart (current FY blue vs previous FY gray) using Recharts
  - Year-on-year % change indicator
  - Cost centre horizontal bar chart (top 8, current FY)
- Upcoming trips panel (next 60 days, approved/booked)
- Recent trips panel (last 8)
- All panels scoped by team hierarchy (`useTeamScope`)

#### STX Working-Client Context
- **TopBar client selector** — STX staff see a searchable dropdown to pick a client
- Selecting a client scopes: dashboard, trip list, new trips, team management, fee config loading
- Active client's branding (logo/name) shown in TopBar when selected
- Clear (×) button returns to global view
- `TenantContext` additions: `activeClientId`, `setActiveClientId`, `activeClientConfig`, `clientsList`

#### Team Hierarchy & Trip Scoping
- `managerId` field on users — who a person reports to
- `approveFor[]` field on `client_approver` users — which travellers they approve for (empty = all)
- `useTeamScope` hook — derives `all/team/self` scope from direct reports query
- `filterTripsByScope()` — filters trips by `travellerId` (primary) or `createdBy`/name match (fallback)
- Applied in Dashboard and TravelManagement — managers see team's data, individuals see own only
- TripDetail: `client_approver` approve button only shown if trip's `travellerId` is in their `approveFor` list

#### Firebase Storage rules (`src/storage.rules`)
- Tenant-isolated rules at `clients/{clientId}/trips/{tripId}/{filename}`
- 10 MB file size limit enforced

---

## Coming Up

### Phase 5 — Passenger Profiles 🔜
**Goal:** Accessibility-aware passenger profiles, tenant-scoped, linked to traveller user accounts.

**What gets built:**
- `usePassengers` hook — real-time Firestore listener at `/clients/{clientId}/passengers/`
- **PassengerList** — searchable table; scoped by team hierarchy (consistent with trips)
- **PassengerForm** — full profile form with sections:
  - Personal details (name, DOB, preferred name, gender)
  - Contact details (phone, emergency contact name/phone/relationship)
  - Identity documents (ID type, number, expiry, issuing country) — multiple IDs supported
  - Accessibility needs (disability type, mobility aids, dietary requirements, medical notes, care requirements)
  - Travel preferences (seat preference, meal type, frequent flyer numbers)
  - Portal user link (`userId` field — links profile to a `/users/{uid}`)
- **PassengerDetail** — read-only view of full profile with edit button
- TripForm integration — traveller name lookup searches passenger profiles (replaces/extends team member datalist)
- Profile completeness indicator (% of key fields filled)
- STX staff see passengers for active client; client users see own client's passengers
- Team scope applied — managers see their team's profiles; individuals see only their own

**Firestore path:** `/clients/{clientId}/passengers/{passengerId}`

---

### Phase 6 — Hotel Booking
Nuitee API integration (`api.liteapi.travel/v3.0`) for hotel search, availability, and booking.
Per-tenant Nuitee feed configuration (already stored in client config `hotelBooking.nuiteeFeed`).

---

### Phase 7 — Invoice Generation
PDF invoice generation with tenant branding, logos, and fee structures.
Invoices stored at `/clients/{clientId}/invoices/{invoiceId}`.

---

### Phase 8 — Reports
Four analytics reports, tenant-scoped for clients, aggregate/cross-tenant for STX.

---

### Phase 9 — QA + Production Deploy
Security rules testing, full regression checklist, deploy to `stx-corporate` production.

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/App.js` | Router + all context providers |
| `src/firebase.js` | Firebase init (reads from env vars) |
| `src/contexts/AuthContext.jsx` | Auth state + user profile (getDoc on login) |
| `src/contexts/TenantContext.jsx` | Tenant config + STX working-client state |
| `src/contexts/PermissionsContext.jsx` | Permission set from role |
| `src/utils/permissions.js` | All permissions + role mappings (incl. team:manage) |
| `src/utils/formatters.js` | Date/currency formatting helpers |
| `src/components/layout/AppShell.jsx` | Main layout wrapper |
| `src/components/layout/Sidebar.jsx` | Permission-filtered nav |
| `src/components/layout/TopBar.jsx` | Tenant branding + STX client selector |
| `src/components/auth/LoginPage.jsx` | Login + forgot password |
| `src/components/shared/Modal.jsx` | Reusable modal wrapper |
| `src/components/shared/Toggle.jsx` | Reusable toggle switch |
| `src/components/shared/TagInput.jsx` | Add/remove tag list input |
| `src/components/shared/PermissionGate.jsx` | Conditional render by permission |
| `src/components/admin/ClientManager.jsx` | List + create/edit tenants |
| `src/components/admin/ClientForm.jsx` | Full tenant config form |
| `src/components/admin/UserManager.jsx` | List + create/edit/delete users (STX Admin Panel) |
| `src/components/trips/TripList.jsx` | Trip table; exports calcTripExGST, StatusBadge, getDisplayStatus |
| `src/components/trips/TripForm.jsx` | Trip creation/edit form with sector sub-forms |
| `src/components/trips/TripDetail.jsx` | Trip detail view with workflow actions + history |
| `src/components/trips/Attachments.jsx` | Firebase Storage upload/download/delete |
| `src/hooks/useTrips.js` | Real-time trips listener; supports filterClientId param |
| `src/hooks/useTeamScope.js` | Team hierarchy scope; filterTripsByScope() |
| `src/pages/Dashboard.jsx` | Dashboard with stats, charts, upcoming/recent trips |
| `src/pages/TravelManagement.jsx` | Trip CRUD orchestration page |
| `src/pages/Team.jsx` | Team hierarchy + approver delegation management |
| `src/pages/AdminPanel.jsx` | STX-only admin panel (clients + users tabs) |
| `firestore.rules` | Firestore security rules |
| `src/storage.rules` | Firebase Storage rules |
| `functions/index.js` | All Cloud Functions |
| `.github/workflows/deploy-dev.yml` | CI/CD → dev on push to main |
| `.github/workflows/deploy-prod.yml` | CI/CD → prod on push to prod branch |

---

## Firebase Projects

| Environment | Project ID | URL |
|-------------|------------|-----|
| Dev | `stx-corporate-dev` | stx-corporate-dev.web.app |
| Prod | `stx-corporate` | stx-corporate.web.app |

*Last updated: 26 April 2026 — Phases 0–4 complete, Phase 5 (Passenger Profiles) next*
