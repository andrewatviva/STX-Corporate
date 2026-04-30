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
│   ├── layout/       AppShell, Sidebar, TopBar (client selector for STX), AccessibilityToolbar
│   ├── trips/        TripList, TripForm, TripDetail, Attachments
│   ├── passengers/   PassengerList, PassengerForm, PassengerDetail    ← Phase 5
│   ├── invoices/     InvoiceBuilder, InvoiceDetail                   ← Phase 7 ✅
│   ├── reports/      (stub — Phase 8)
│   ├── admin/        ClientManager, ClientForm, UserManager, FeedbackManager, OnboardingManager
│   └── shared/       Modal, Toggle, TagInput, PermissionGate, PermissionOverridesEditor
├── contexts/         AuthContext, TenantContext, PermissionsContext
├── hooks/            useTrips, useTeamScope, useApprovalScope, usePassengers (Ph5), useInvoices (Ph7)
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
| `client_ops` | Create/edit/approve trips + view all team trips; manage passengers and team — all within own client |
| `client_approver` | Approve/decline trips — scoped by `approveScope` field |
| `client_traveller` | Own data only (or team data if they have direct reports via `managerId`) |

**Per-user permission overrides** (`permissionOverrides` map on user doc):
- Any permission in `CLIENT_CONFIGURABLE_PERMISSIONS` can be explicitly granted (`true`) or denied (`false`) for an individual user
- Overrides take priority over role defaults in `PermissionsContext.hasPermission()`
- Invoice permissions are handled separately via the existing `invoiceAccess` boolean field
- Managed by STX (always) or by `client_ops` if `features.customPermissions` is enabled for the client
- `firestore.rules` blocks users from self-updating `permissionOverrides`

### User hierarchy fields (stored on `/users/{uid}`)
| Field | Type | Purpose |
|-------|------|---------|
| `managerId` | `string \| null` | UID of direct manager; drives dashboard/trip scoping |
| `approveScope` | `'all' \| 'select' \| 'reports'` | Approval scope mode; absent = inferred from `approveFor` (backward compat) |
| `approveFor` | `string[]` | UIDs to approve for when `approveScope === 'select'` (empty = all for backward compat) |
| `approveReportsDepth` | `1 \| 2 \| 3` | Hierarchy depth when `approveScope === 'reports'` (1=direct, 2=+once removed, 3=+twice removed) |
| `permissionOverrides` | `Record<string, boolean>` | Per-permission grant/deny map; keys are from `CLIENT_CONFIGURABLE_PERMISSIONS` |
| `invoiceAccess` | `boolean \| undefined` | Invoice permission override; `undefined` = use role default |
| `costCentre` | `string \| null` | Default cost centre for this user (auto-fills on new trips) |
| `travellerId` | — | Stored on **trips** (not users) — links a trip to a user UID |

### Firestore collections
- `/clients/{clientId}` — tenant root (name, active status)
- `/clients/{clientId}/config/settings` — full tenant config
- `/clients/{clientId}/config/travelPolicy` — `{ rates: {city: rateInclGST}, flightRates: {city: rateInclGST} }` — always save with `{ merge: true }`
- `/clients/{clientId}/config/settings` also stores `policyVariance: { accommodation: { enabled, type ('percent'|'dollar'), value, action ('warn'|'approve') }, flight: { … } }`
- `/clients/{clientId}/trips/{tripId}` — trips (includes `travellerId`, `createdBy`, `amendments[]`, `fees[]`, `attachments[]`)
- `/clients/{clientId}/passengers/{passengerId}` — passenger profiles ← Phase 5
- `/clients/{clientId}/invoices/{invoiceId}` — invoices ← Phase 7 ✅
- `/users/{userId}` — user profiles with role, clientId, managerId, approveScope, approveFor, approveReportsDepth, permissionOverrides, invoiceAccess, costCentre
- `/onboarding/{token}` — client onboarding forms; `token` is 32-char hex; `allow read: if true` (token = access control); status: `pending` → `submitted` → `applied`
- `/emailQueue/{id}` — email dispatch queue (`type`, `recipientId`, `clientId`, `tripId`, `scheduledFor`, `status`)
- `/portalFeedback/{id}` — portal feedback/fault reports; create: any auth user; read: STX only

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
  policyVarianceBreached, // boolean — true if any sector exceeded client policy variance threshold
  varianceBreaches[],     // [{ sectorIndex, sectorType, city, actual, policy, threshold, action }]
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
| `onEmailQueued` | Firestore onCreate `/emailQueue/{id}` | Dispatches email immediately if `scheduledFor` ≤ now; skips if deferred |
| `sweepEmailQueue` | Cloud Scheduler (daily) | Processes pending deferred emailQueue items |
| `sendOnboardingForm` | HTTPS callable | Generates 32-char token, creates `/onboarding/{token}` doc, emails invite to client |
| `onOnboardingSubmitted` | Firestore onUpdate `/onboarding/{token}` | Fires when status → `submitted`; emails all STX staff |
| `portal_feedback` email type | (dispatched by onEmailQueued) | Sends feedback/fault report to all `stx_admin` + `stx_ops` users |
| `feedback_response` email type | (dispatched by onEmailQueued) | Sends STX reply to feedback originator; routed via `recipientId` |
| `trip_itinerary_added` email type | (dispatched by onEmailQueued) | Sent to traveller when digital itinerary link first added to a trip |
| `trip_cancelled_by_client` email type | (dispatched by onEmailQueued) | Sent to all STX staff when a non-STX user cancels a trip |
| `trip_submitted` email type | (dispatched by onEmailQueued) | Notifies all users with effective `trip:approve` permission scoped to this traveller; respects `approveScope` (all/select/reports hierarchy) |

### Email notifications (SendGrid)
- Secret: `SENDGRID_API_KEY` stored in Firebase Secret Manager (both projects)
- From: `noreply@supportedtravelx.com.au`
- Queue collection: `/emailQueue/{id}` — `{ type, recipientId, clientId, tripId, tripTitle, scheduledFor, status, createdAt }`
- Types: `trip_submitted` (to approvers), `trip_approved`, `trip_declined`, `trip_booked`, `trip_itinerary_added`, `trip_pre_departure` (3 days before), `trip_rating_request` (2 days after), `portal_feedback` (to all STX staff), `feedback_response` (to originator), `trip_cancelled_by_client` (to all STX staff)
- Mandatory types (bypass preferences): `trip_approved`, `trip_declined`
- User preferences stored at `/users/{uid}.emailPreferences.{type}` — `undefined` = opted in, `false` = opted out
- Queued from `TripDetail.jsx` act() function on status transitions
- **Status**: ✅ SendGrid confirmed working — secret set via `firebase functions:secrets:set SENDGRID_API_KEY` and functions redeployed
- To rotate the key: `firebase functions:secrets:set SENDGRID_API_KEY` then answer Y to redeploy (destroys stale version automatically)

### Firebase projects
- **Dev/Staging**: `stx-corporate-dev` — used during development, `.env.development`
- **Production**: `stx-corporate` — live environment, `.env.production`

### CI/CD
- `main` branch → auto-deploys to `stx-corporate-dev` (GitHub Actions)
- `prod` branch → auto-deploys to `stx-corporate`

### Important implementation notes
- `getDisplayStatus(trip)` — derives `travelling`/`completed` from `booked` + dates; use this for all status display. Travel dashboard splits trips by this: Active tab = everything except `completed`/`cancelled`; Completed tab = `completed` + `cancelled`
- **Cost centre editing** — restricted to STX staff and `client_approver`/`client_ops` roles; always requires a reason (stored in amendment history); `originalCostCentre` is tracked as state in TripForm (updates when traveller auto-fills)
- **Hotel booking visibility** — STX always sees hotel booking button regardless of client config; clients gated by `features.hotelBooking` + `hotelBooking.selfManagedHotelBooking` (the latter gates Self-Managed trip type only)
- **Policy variance** — `findPolicyRate(city, rates)` does case-insensitive lookup with "All Cities" fallback; `varianceBreaches` useMemo in TripForm; breaches with `action: 'approve'` force `status = 'pending_approval'` on save
- **Accessibility toolbar** — `src/components/layout/AccessibilityToolbar.jsx`; 11 features; CSS injected via `<style>` tag; body `filter` computed from active colour options (stacked CSS filter functions); images re-corrected to avoid double-inversion; Lexend font lazy-loaded; persists to `localStorage` under key `stx_a11y_prefs`
- **Admin Panel tabs** — Clients, Users, Feedback & Faults; `useSearchParams` for `?tab=feedback&id=` deep-link from email CTAs
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
| Travel Policy | `TravelPolicy.jsx` | Two-tab report (Accommodation / Flights); per-client rates at `clients/{clientId}/config/travelPolicy` (`rates` + `flightRates`); comparison all ex-GST; seeded from DEFAULT_RATES (~80 AU cities, TD 2025/4); controlled by `features.accommodationPolicy` + `features.flightPolicy` flags |

**Shared utilities**: `src/utils/reportHelpers.js` — `toISO`, `getQuickRange`, `QUICK_PERIODS`, `BILLABLE_STATUSES`, `getDisplayStatus`, `sectorExGST`, `tripInclGST`, `tripExGST`, `accomCity`, `toDate`, `exportCSV`, `nightsBetween`.

**V2 schema** used in all reports:
- Sector types lowercase: `accommodation`, `flight`, `car-hire`, `parking`, `transfers`, `meals`, `other`
- `sector.propertyName` (not `details`); `sector.checkIn`/`checkOut` (not `date`/`endDate`)
- `trip.destinationCity`/`originCity` (not `destination`/`departureCity`); `trip.tripType` (not `type`)
- `sector.international === true` (not `sector.region === 'International'`)
- Status lowercase: `approved`, `booked`, `travelling`, `completed`; use `getDisplayStatus()` for derived states

**Booking window / Lead time** (All Travel report + TripList + TripDetail): `leadTimeDays(trip)` = days from `createdAt` to `startDate`; groups 0–3 (red), 4–10 (amber), 11–20 (yellow), 21+ (green). Exported from `TripList.jsx` as `leadTimeDays` + `LeadTimeBadge`.

**Travel Policy report**: stored rates are incl. GST (TD 2025/4 values); report converts to ex-GST (`rate / 1.1`) for comparison. Accommodation tab: avg nightly spend vs policy rate. Flights tab: avg total flight cost per trip by destination vs policy rate. Both tabs controlled by feature flags (`accommodationPolicy` defaults true, `flightPolicy` defaults false). Tab toggle hidden if both on; entire report tab hidden if both off.

**Policy report flow**: load rates from Firestore on mount → generate button → compare avg ex-GST spend against `findPolicyRate(destination, rates) / 1.1` → variance $ and %.

### Hooks
| Hook | Purpose |
|------|---------|
| `useTrips` | Real-time trips listener (collectionGroup for STX global, scoped for client) |
| `usePassengers` | Real-time passengers listener |
| `useInvoices` | Real-time invoices listener + createInvoice (atomic counter) |
| `useTeamScope` | Derives all/team/self scope from `trip:view_all` permission (role + overrides); queries Firestore for direct reports when not 'all' |
| `useApprovalScope` | Returns `null` (approve all), `Set<uid>` (specific), or `'none'` (no permission); queries members for 'reports' scope |
| `useAttentionCount` | Returns `{ count, tooltip }` for sidebar badge — STX/ops: pending_approval + approved; approvers (scoped): pending_approval; travellers: declined |

### Account Settings
- `src/components/account/AccountSettings.jsx` — modal launched from TopBar Settings button
- Password reset via `sendPasswordResetEmail(auth, currentUser.email)`
- Email notification preferences per type — saved to `/users/{uid}.emailPreferences`
- Notification types: `trip_submitted`, `trip_approved`, `trip_declined`, `trip_booked`, `trip_itinerary_added`, `trip_pre_departure`, `trip_rating_request`
- Approver-only preferences (e.g. `trip_submitted`) hidden from traveller roles

### Current status
**Phases 0–5, 7–8 complete. Recent additions: Feedback & Fault Manager (Admin Panel), cost centre permission gating + mandatory reason, self-managed hotel booking gate per client, policy variance thresholds (warn/approve), Active/Completed trip dashboard tabs, accessibility toolbar (11 features). Phase 6 (Hotel Booking) deferred. Phase 9 (QA + Production) next.**
See `PROGRESS.md` for full phase breakdown.
