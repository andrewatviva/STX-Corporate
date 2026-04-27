# CLAUDE.md — STX Corporate Portal V2

## Commands

```bash
npm start        # Dev server (port 3000) — uses .env.development (stx-corporate-dev Firebase)
npm run build    # Production build → /build
npm test         # Run tests
```

Firebase deploy (requires `firebase login --reauth` if credentials expired):
```bash
firebase use dev                        # Switch to stx-corporate-dev
firebase deploy --only firestore:rules  # Deploy security rules
firebase deploy --only functions --force # Deploy Cloud Functions
firebase deploy                         # Deploy everything

firebase use prod                       # Switch to stx-corporate (production)
```

## Architecture

**STX Corporate Portal V2** — multi-tenant corporate travel management platform.
React + Firebase. All client-specific configuration is stored in Firestore, not hardcoded.

### Stack
- **Frontend**: React 19, React Router v7, Tailwind CSS v3, Lucide React, Recharts
- **Backend**: Firebase Auth + Firestore + Storage + Cloud Functions (Node 22)
- **External APIs**: Nuitee (`api.liteapi.travel/v3.0`) for hotel bookings

### Key files
| File | Purpose |
|------|---------|
| `src/App.js` | Router + context provider tree |
| `src/firebase.js` | Firebase initialisation (reads from env vars) |
| `src/contexts/AuthContext.jsx` | Firebase auth state + user profile from Firestore (`getDoc` on login) |
| `src/contexts/TenantContext.jsx` | Loads client config; STX working-client selector state; exposes `clientName` + `activeClientName` |
| `src/contexts/PermissionsContext.jsx` | Derives permission set from user role |
| `src/utils/permissions.js` | PERMISSIONS constants + ROLE_PERMISSIONS map |
| `src/utils/formatters.js` | Date/currency formatting helpers |
| `src/data/cities.js` | Canonical city list (~150 AU + international) — used for trip origin/destination autocomplete |
| `firestore.rules` | Firestore security rules (tenant isolation) |
| `firebase.json` | Firebase hosting + rules + functions config |
| `functions/index.js` | All Cloud Functions |

### Folder structure
```
src/
├── components/
│   ├── auth/         LoginPage
│   ├── layout/       AppShell, Sidebar, TopBar (client selector for STX)
│   ├── trips/        TripList, TripForm, TripDetail, Attachments
│   ├── passengers/   PassengerList, PassengerForm, PassengerDetail    ← Phase 5
│   ├── invoices/     InvoiceBuilder, InvoiceDetail                   ← Phase 7 ✅
│   ├── reports/      (stub — Phase 8)
│   ├── admin/        ClientManager, ClientForm, UserManager
│   └── shared/       Modal, Toggle, TagInput, PermissionGate
├── contexts/         AuthContext, TenantContext, PermissionsContext
├── hooks/            useTrips, useTeamScope, usePassengers (Ph5), useInvoices (Ph7)
├── pages/            One file per route
└── utils/            permissions.js, formatters.js
```

### Multi-tenant architecture
- Each corporate client has a `clientId` (e.g. `"dana"`, `"acme"`)
- All tenant data lives under `/clients/{clientId}/` in Firestore
- Tenant config (branding, cost centres, fees, workflow, feature flags) is at `/clients/{clientId}/config/settings`
- Firebase Custom Claims encode `{ role, clientId }` in the JWT — security rules enforce isolation
- STX staff (`stx_admin`, `stx_ops`) have `clientId: null` and can access all tenants
- STX staff can select a **working client** via the TopBar dropdown (`activeClientId` in TenantContext) to scope all views to one client

### Roles
| Role | Access |
|------|--------|
| `stx_admin` | Everything — create tenants, manage all users, delete, view all data |
| `stx_ops` | View/manage trips across all clients, approve, generate invoices |
| `client_ops` | Create/edit trips and passengers within own client; manage team |
| `client_approver` | Approve/decline trips — can be scoped to specific travellers via `approveFor[]` |
| `client_traveller` | Own data only (or team data if they have direct reports via `managerId`) |

### User hierarchy fields (stored on `/users/{uid}`)
| Field | Type | Purpose |
|-------|------|---------|
| `managerId` | `string \| null` | UID of direct manager; drives dashboard/trip scoping |
| `approveFor` | `string[]` | UIDs this approver can approve for (empty = all in client) |
| `travellerId` | — | Stored on **trips** (not users) — links a trip to a user UID |

### Firestore collections
- `/clients/{clientId}` — tenant root (name, active status)
- `/clients/{clientId}/config/settings` — full tenant config
- `/clients/{clientId}/trips/{tripId}` — trips (includes `travellerId`, `createdBy`, `amendments[]`, `fees[]`, `attachments[]`)
- `/clients/{clientId}/passengers/{passengerId}` — passenger profiles ← Phase 5
- `/clients/{clientId}/invoices/{invoiceId}` — invoices ← Phase 7 ✅
- `/users/{userId}` — user profiles with role, clientId, managerId, approveFor

### Trip data model (key fields)
```
trip {
  clientId, title, travellerName, travellerId,  // travellerId links to users/{uid}
  tripType, costCentre, startDate, endDate,
  originCity, destinationCity,   // from src/data/cities.js canonical list
  status,          // draft | pending_approval | approved | declined | booked | cancelled
  sectors[],       // flight | accommodation | car-hire | parking | transfers | meals | other
  fees[],          // management fee, amendment fee — stored ex-GST; incl-GST = amount × (1 + gstRate)
  attachments[],   // Firebase Storage refs
  amendments[],    // full audit trail with diff (changes[] — always strings, never objects)
  createdBy, createdAt, updatedAt
}

// Accommodation sector extra field:
sector {
  type: 'accommodation',
  reportingCity: '',   // blank = use trip.destinationCity; set only when hotel is in a different city
  cost: 0,            // TOTAL stay cost (incl. GST) — NOT nightly rate; do NOT multiply by nights
  ...
}
```
Note: `travelling` and `completed` are **derived** from `status === 'booked'` + travel dates — not stored.
Note: For hotel spend reporting: `sector.reportingCity || trip.destinationCity` — never use `sector.reportingCity` alone.

### Cloud Functions (functions/index.js)
| Function | Trigger | Purpose |
|----------|---------|---------|
| `syncUserClaims` | Firestore write on `/users/{uid}` | Sets role+clientId as JWT custom claims |
| `refreshUserClaims` | HTTPS callable | Force-refresh claims (stx_admin only) |
| `createClientUser` | HTTPS callable | Create user in Auth + Firestore |
| `updateClientUser` | HTTPS callable | Update user profile + sync to Auth |
| `deleteClientUser` | HTTPS callable | Remove user from Auth + Firestore |
| `sendPasswordReset` | HTTPS callable | Generate password reset link |

### Firebase projects
- **Dev/Staging**: `stx-corporate-dev` — used during development, `.env.development`
- **Production**: `stx-corporate` — live environment, `.env.production`

### CI/CD
- `main` branch → auto-deploys to `stx-corporate-dev` (GitHub Actions)
- `prod` branch → auto-deploys to `stx-corporate`

### Important implementation notes
- `getDisplayStatus(trip)` — derives `travelling`/`completed` from `booked` + dates; use this for all status display
- **Cost calculations (all three must be consistent):**
  - `calcTripCost(trip)` in `Dashboard.jsx` — sectors (raw `cost`, incl. GST as entered) + fees at `amount × (1 + gstRate)` → "Incl. GST" total
  - `calcTripExGST(trip)` in `TripList.jsx` — domestic sectors ÷ 1.1, international at face value, fees at `amount` (ex-GST) → "Ex-GST" total
  - `sectorGross(s)` in `TravelManagement.jsx` — raw `cost` for all sector types
  - **⚠️ Accommodation `sector.cost` is the TOTAL stay cost (incl. GST) — never multiply by nights.** The nights field is for display only. Multiplying by nights was a historical bug that has been fixed across all files.
- **Invoice billing must match dashboard SPEND_STATUSES** — `BILLABLE_STATUSES` in `InvoiceBuilder` and `SPEND_STATUSES` in Dashboard both exclude `pending_approval` so totals stay consistent
- `diffTrip()` in `TravelManagement.jsx` tracks: top-level field changes (incl. `originCity`, `destinationCity`), sector count add/remove, **and field-level changes within existing sectors** (index-matched): flight route/date/airline/number/class, accommodation property/dates/reportingCity, car hire route/vehicle, parking facility, transfer type, per-sector cost changes
- `amendments[].changes[]` entries must always be **strings** — never objects. Rendering code in TripDetail has a legacy guard but new entries must be strings.
- Amendment fee prompt lives in `TripDetail` (sets `pendingAmendFee`); amendment save logic lives in `TravelManagement.handleSave`
- Firestore client config path is `clients/{id}/config/settings` (subcollection), **not** `clients/{id}.config`
- `useTeamScope(userProfile, clientId)` returns `{ type: 'all' | 'team' | 'self', uids: Set<string> }` — apply with `filterTripsByScope()`
- **TripList filters** — status, trip type, cost centre, destination city (all derived from actual trip data), plus date range with quick picks (this/last month, this/last quarter, this/last FY) and custom date inputs. Date filter applies to `trip.startDate`.
- **Cost centre auto-default** — when selecting a traveller in TripForm, `costCentre` is auto-set from the matched passenger's linked user profile (`costCentre` field on `/users/{uid}`)
- User `costCentre` field is **not** in the `updateClientUser` CF allowlist — must be saved via direct `updateDoc` after CF call (applies in Team.jsx and UserManager.jsx)

### Invoice data model (`/clients/{clientId}/invoices/{invoiceId}`)
```
invoice {
  invoiceNumber,    // auto-incremented, e.g. "INV-DISA-004" (from Firestore counter in client doc)
  name,             // human label, e.g. "April 2026"
  status,           // draft | finalised | paid
  periodFrom,       // ISO date string "YYYY-MM-DD"
  periodTo,         // ISO date string "YYYY-MM-DD"
  subtotalExGST, totalGST, totalInclGST,
  lineItems[],      // see below
  notes,
  createdBy, createdAt, updatedAt
}

lineItem {
  dedupKey,         // "${tripId}_sectors" for trip items; "${tripId}_${feeType}_${appliedAt}" for fees; null for adjustments
  extraDedupKeys[], // fee dedup keys bundled into a trip line item — future scans check these too
  tripId, tripRef, travellerName, costCentre,
  description,
  amount,           // ex-GST
  inclGST,          // gross (incl. GST)
  gstRate,          // null for mixed-GST trip/adjustment items; 0.1 or 0 for fees
  sectorAmount,     // sector-only ex-GST (stored on 'trip' items for future delta calculations)
  sectorInclGST,    // sector-only gross (stored on 'trip' items for future delta calculations)
  lineType,         // 'trip' | 'fee' | 'adjustment' | undefined (manual)
  isManual,         // true for manually added items
}
```

**Invoice scan logic** (`InvoiceBuilder.scanForUnbilledItems`):
- Builds `invoiced` Set from all finalised/paid invoice dedup keys (incl. `extraDedupKeys`)
- Builds `billedSectorTotals` Map (tripId → `{ exGST, inclGST }`) using `sectorAmount`/`sectorInclGST` on new-format items, or reconstructing from `extraDedupKeys` fee subtraction on old-format items
- New trip (created in period, not yet billed): one combined line item = sectors + in-period fees; fee dedup keys stored in `extraDedupKeys`
- Already-billed trip: new in-period fees as standalone items + cost delta item if `currentGross > billedSectorTotals`
- Date arithmetic uses local calendar (`getFullYear/getMonth/getDate`) — not `toISOString()` which shifts to UTC

### Reports (Phase 8)
5 reports, all in `src/components/reports/`, rendered via `src/pages/Reports.jsx`.

| Report | File | Description |
|--------|------|-------------|
| All Travel | `AllTravelReport.jsx` | Filterable trip table — status, type, cost centre, date, search; booking window (days from creation to start); CSV export |
| Avg Spend by Destination | `AvgSpendByDestination.jsx` | Grouped by `destinationCity`, expandable sector breakdown, per-night rate for accommodation |
| Spend by Departure City | `SpendByDepartureCity.jsx` | Grouped by `originCity`, excludes international option |
| Hotel Popularity | `HotelPopularity.jsx` | Grouped by `accomCity(sector,trip)` → `propertyName`, avg nightly rate, expandable |
| Accommodation Policy | `AccommodationPolicy.jsx` | Per-client rates at `clients/{clientId}/config/travelPolicy`; seeded from DEFAULT_RATES (~80 AU cities, TD 2025/4); editable by STX only |

**Shared utilities**: `src/utils/reportHelpers.js` — `toISO`, `getQuickRange`, `QUICK_PERIODS`, `BILLABLE_STATUSES`, `getDisplayStatus`, `sectorExGST`, `tripInclGST`, `tripExGST`, `accomCity`, `toDate`, `exportCSV`, `nightsBetween`.

**V2 schema** used in all reports:
- Sector types lowercase: `accommodation`, `flight`, `car-hire`, `parking`, `transfers`, `meals`, `other`
- `sector.propertyName` (not `details`); `sector.checkIn`/`checkOut` (not `date`/`endDate`)
- `trip.destinationCity`/`originCity` (not `destination`/`departureCity`); `trip.tripType` (not `type`)
- `sector.international === true` (not `sector.region === 'International'`)
- Status lowercase: `approved`, `booked`, `travelling`, `completed`; use `getDisplayStatus()` for derived states

**Booking window** (All Travel report): `toDate(trip.createdAt)` → days until `trip.startDate`; red ≤ 7 days, amber ≤ 21 days.

**Policy report flow**: load rates from Firestore on mount → generate button → compare `avgPerNightInc` against `findPolicyRate(destination, rates)` → variance $ and %.

### Current status
**Phases 0–5, 7–8 complete. Phase 6 (Hotel Booking) deferred. Phase 9 (QA + Production) next.**
See `PROGRESS.md` for full phase breakdown.
