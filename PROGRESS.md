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
| 5 | Passenger profiles | ✅ Complete |
| — | Post-phase enhancements (cost fixes, filters, cities, reporting city, history) | ✅ Complete |
| — | Email notifications + user preferences + notification badge | ✅ Complete (✅ SendGrid confirmed working) |
| — | Account settings, password reset, CI/CD service account auth | ✅ Complete |
| — | Lead time indicator, Travel Policy report (flights + ex-GST + flags), feedback form, itinerary email, badge tooltip | ✅ Complete |
| — | Feedback & Fault Manager, cost centre gating, hotel booking gates, policy variance, Active/Completed tabs, accessibility toolbar | ✅ Complete |
| — | WCAG 2.1 AA accessibility implementation (all 4 phases) | ✅ Complete |
| 6 | Hotel booking (Nuitee) | ⏸ Deferred |
| 7 | Invoice generation | ✅ Complete |
| 8 | Reports | ✅ Complete |
| 9 | QA, security testing + production deploy | ⏳ Next |

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

### Phase 5 — Passenger Profiles ✅

**Files built:**
- `src/hooks/usePassengers.js` — real-time Firestore listener at `/clients/{clientId}/passengers/`
- `src/components/passengers/PassengerForm.jsx` — full profile form (personal, emergency, identity docs, accessibility, travel prefs, portal account link)
- `src/components/passengers/PassengerDetail.jsx` — read-only profile view with completeness bar and edit button
- `src/pages/Profiles.jsx` — searchable list with team scope, create/edit modal, detail view, delete confirm

**Key features:**
- Profile completeness indicator (% of 10 key fields filled; green/amber/red badge)
- Accessibility tags in list view (disability needs, mobility aids, carer, dietary)
- Wheelchair details: transfer method (4 options), model, dimensions, weight, battery model (power wheelchair only)
- Loyalty programs: Airline, Hotel/Accommodation, Car Rental, Rail, Other (replaces frequentFlyer — migration code included)
- Team scope: `filterPassengersByScope()` applied — managers see team, individuals see own only
- STX staff see passengers for active client; "select a client" prompt when none selected
- Identity documents: configurable types from `clientConfig.dropdowns.idTypes`; multiple docs supported
- TripForm traveller autocomplete now searches passenger profiles first, then team members; deduplicates entries
- `travellerId` set from passenger's linked `userId` when matched by name
- Passenger profile button per Team member row (pre-fills name/email from user data)
- "Reports to" manager shown read-only in PassengerDetail when linked user has a manager

---

### Post-Phase 5 Enhancements ✅

These improvements were built across multiple sessions after Phases 0–5 were complete.

#### Trip Cost Calculation Fixes
- **GST consistency**: all three cost functions now consistent:
  - `calcTripCost` (Dashboard "Incl. GST") = sectors + fees at `amount × (1 + gstRate)`
  - `calcTripExGST` (TripList "Ex-GST") = sectors back-calculated ÷ 1.1 + fees at ex-GST `amount`
  - `sectorGross()` helper extracted; accommodation = `cost × nights`
- **Accommodation sector**: was displaying nightly rate as total — fixed to show `cost × nights` in sector card
- **TripDetail estimated total**: now includes fees at incl-GST value and shows ex-GST breakdown beneath it

#### Amendment History Improvements
- `diffTrip()` rewritten to track field-level changes **within** existing sectors (index-matched), not just sector count changes:
  - Flight: route, date, airline, flight number, cabin class
  - Accommodation: property name, check-in/out dates, reporting city
  - Car hire: route, vehicle type; Parking: facility; Transfers: transfer type
  - All types: per-sector cost change
- Added `originCity` + `destinationCity` to top-level field tracking
- `changes[]` entries always stored as strings (fixed legacy object format; rendering code has backward-compat guard)

#### Trip Origin / Destination Cities
- `src/data/cities.js` — canonical list of ~150 cities (all Australian + major international) sorted A–Z
- `originCity` + `destinationCity` fields added to TripForm (datalist autocomplete from canonical list)
- TripList: "Destination" column shows `Origin → Destination` route; destination city filter added
- TripDetail: "Route" field in trip header when cities are set

#### Travel Management Filters (TripList)
- Filter row: Status · Trip type · Cost centre · Destination city (all derived from actual trip data; dropdowns only appear if data exists)
- Date range row: quick pills — This month / Last month / This quarter / Last quarter / This FY / Last FY — plus custom From / To date inputs; active pill highlighted blue
- "Clear filters" link; result count shows "X of Y trips · filters active"
- Search also matches `originCity` and `destinationCity`

#### Accommodation Reporting City Override
- Each accommodation sector has `reportingCity` field (blank = use `trip.destinationCity`)
- In TripForm AccommodationFields: shows "Using trip destination: [city]" with Override button
- Override reveals city selector (same canonical list); "Use trip destination" clears it
- **Reporting query pattern**: `sector.reportingCity || trip.destinationCity`
- TripDetail shows "Reporting city: X (override)" in sector rows when set

#### Cost Centre Enhancements
- **User cost centre field**: Team page and UserManager now include cost centre dropdown (loaded from client config); saved via direct `updateDoc` (not CF — outside CF allowlist)
- **Trip cost centre**: always visible in TripDetail (previously hidden when blank); inline edit with pencil icon for `stx_admin`, `stx_ops`, `client_ops`
- **Cost centre change requires reason**: validation in TripForm + inline edit in TripDetail; reason recorded in amendment history
- **Auto-default from traveller profile**: when selecting a traveller in TripForm, `costCentre` auto-fills from matched user's profile

#### Other Fixes
- React error #31 crash when viewing trips where cost centre had been changed — fixed: `changes[]` now always strings
- Legacy `{ field, from, to }` object entries in `changes[]` render gracefully with backward-compat guard

---

### Phase 6 — Hotel Booking ⏸ Deferred
Nuitee API integration (`api.liteapi.travel/v3.0`) for hotel search, availability, and booking.
Per-tenant Nuitee feed configuration already stored in client config (`hotelBooking.nuiteeFeed`).
Deferred to focus on invoicing — to be revisited after Phase 8.

---

### Phase 7 — Invoice Generation ✅

**Files built:**
- `src/hooks/useInvoices.js` — real-time Firestore listener at `/clients/{clientId}/invoices/`; `createInvoice` (with atomic Firestore counter for invoice number), `updateInvoice`, `deleteInvoice`
- `src/components/invoices/InvoiceBuilder.jsx` — full invoice creation/editing UI
- `src/components/invoices/InvoiceDetail.jsx` — read-only view with inline editing, PDF/CSV export, mark as paid, delete
- `src/pages/Invoices.jsx` — list/builder/detail navigation; permission-gated; STX client selector aware

**Key features:**
- **Invoice numbering**: auto-incremented per client using Firestore `runTransaction` on a counter in the client doc; format `INV-{PREFIX}-{NNN}` where prefix is derived from `clientId`
- **Invoice name**: free-text label (e.g. "April 2026") saved on the invoice document; shown in list and detail header
- **Invoice status flow**: `draft` → `finalised` → `paid`; edits locked once paid
- **Period selector**: quick-pick buttons (This/Last Month, Quarter, FY) + custom From/To date inputs; date arithmetic uses local calendar (not UTC) to avoid timezone shift for Australian users
- **Scan for unbilled items** (`scanForUnbilledItems`):
  - Builds `invoiced` Set from all finalised/paid invoice dedup keys (incl. `extraDedupKeys`)
  - Builds `billedSectorTotals` Map per trip for cost delta detection
  - New trip (created in period, sectors not yet billed): one combined line item = sector costs + in-period fees bundled; fee dedup keys stored in `extraDedupKeys` so future scans skip them
  - Already-billed trip: new in-period fees as standalone line items + **cost adjustment item** if current sector gross exceeds previously billed total
  - Old-format invoice items (pre `sectorAmount` field): fee amounts reconstructed from `extraDedupKeys` to correctly isolate sector-only cost for delta calculation
  - `BILLABLE_STATUSES` matches dashboard `SPEND_STATUSES` (both exclude `pending_approval`) to keep totals consistent
- **Line item types**: `trip` (sector costs + bundled fees), `fee` (standalone amendment/management fee), `adjustment` (cost delta after amendment), manual (STX-only free-form)
- **Mixed-GST line items**: trip/adjustment items have `gstRate: null` (domestic + international sectors mixed); both `amount` (ex-GST) and `inclGST` (gross) editable independently in inline edit mode
- **Inline editing**: available in both InvoiceBuilder (before save) and InvoiceDetail (after save, while not paid); pencil icon per line item
- **PDF export**: `window.open + document.write + window.print()` — no extra dependencies; two-column header (STX logo left, client logo if configured, invoice number/name/status right)
- **CSV export**: client name, period, all line items, totals
- **Mark as paid**: `stx_admin` only; locks invoice from further editing
- **Delete invoice**: `stx_admin` only; available at any status
- **Client name resolution**: `TenantContext` now loads client display name from root `clients/{id}` document (not from `config/settings` which has no name field); exposed as `clientName` (non-STX) and `activeClientName` (STX working-client)
- **STX logo URL**: `https://www.supportedtravelx.com.au/wp-content/uploads/STX-Logo-Transparent-min-1024x434-1.png`
- **Client logo**: `clientConfig.branding.logo` URL (set in ClientForm); `onerror` fallback hides it if unavailable
- **Access control**: all edits/deletions restricted to `stx_admin`; clients can view only

**Dedup key design:**
- `${tripId}_sectors` — marks that a trip's sector costs have been invoiced
- `${tripId}_${fee.type}_${fee.appliedAt}` — marks a specific fee as invoiced
- `extraDedupKeys[]` — additional keys bundled into a trip line item; future scans add these to the `invoiced` Set
- `sectorAmount` / `sectorInclGST` — stored on `lineType: 'trip'` items to allow accurate cost delta calculations in future invoices without including bundled fee amounts in the baseline

---

### Phase 8 — Reports ✅ Complete
5 analytics reports, all tenant-scoped (STX must select a working client first).

**Shared utilities**: `src/utils/reportHelpers.js`
- `QUICK_PERIODS`, `getQuickRange(key)` — 7 date presets (This/Last Month, Quarter, FY, All Time)
- `BILLABLE_STATUSES` — Set of `approved`, `booked`, `travelling`, `completed`
- `getDisplayStatus(trip)` — derives `travelling`/`completed` from `booked` + dates
- `sectorExGST(sector)`, `tripInclGST(trip)`, `tripExGST(trip)` — cost calculations
- `accomCity(sector, trip)` — `sector.reportingCity || trip.destinationCity`
- `nightsBetween(checkIn, checkOut)`, `toDate(val)`, `exportCSV(rows, filename)`

**Reports** (`src/components/reports/`):

| Report | File | Key behaviour |
|--------|------|---------------|
| All Travel | `AllTravelReport.jsx` | Reactive filters (no generate button) — date, status, trip type, cost centre, search; booking window column (days from `createdAt` to `startDate`); highlights ≤7 days red, ≤21 amber; CSV |
| Avg Spend by Destination | `AvgSpendByDestination.jsx` | Grouped by `destinationCity`; expandable per-sector breakdown cards; per-night rate for accommodation; generate button |
| Spend by Departure City | `SpendByDepartureCity.jsx` | Grouped by `originCity`; toggle to exclude international trips; generate button |
| Hotel Popularity | `HotelPopularity.jsx` | Reactive; grouped by `accomCity(sector,trip)` → `propertyName`; expandable hotel list with rank badges, mini bar chart, avg nightly rate |
| Travel Policy | `TravelPolicy.jsx` | Two-tab (Accommodation / Flights); per-client rates at `clients/{clientId}/config/travelPolicy` (`rates` + `flightRates`); comparison all ex-GST; rate editor in Admin Panel; controlled by `features.accommodationPolicy` + `features.flightPolicy` flags; tab hidden if both off |

**V2 schema applied** in all reports (vs V1 legacy):
- Sector types lowercase; `sector.propertyName` / `sector.checkIn` / `sector.checkOut`
- `trip.destinationCity` / `trip.originCity` / `trip.tripType` / `trip.travellerName`
- `sector.international === true` (not `sector.region === 'International'`)

---

### Post-Phase 8 Enhancements (Session 3) ✅

#### Admin Panel — Feedback & Fault Manager
- `src/components/admin/FeedbackManager.jsx` — new component added as third tab "Feedback & Faults" in Admin Panel
- Real-time `onSnapshot` on `/portalFeedback` collection ordered by `createdAt` desc
- List view: clickable count cards (Open / In Progress / Resolved), status filter buttons, submission cards
- Detail view: original submission, response thread (blue left-border), reply box with status selector, metadata sidebar
- On send reply: `arrayUnion` response to doc + queue `feedback_response` email to `recipientId: selected.userId`
- `feedback_response` email type added to Cloud Function — routes via existing `else` branch (recipientId lookup), skips STX roles
- Deep-link support: `useSearchParams` reads `?tab=feedback&id=` from URL — auto-opens specific submission (e.g. from "View in Admin Panel" email CTA)
- `portal_feedback` email CTA now includes `feedbackId` for deep-linking: `Contact.jsx` captures `feedbackRef.id` from `addDoc`
- `AdminPanel.jsx` updated: imports `FeedbackManager`, `MessageSquare`, `useSearchParams`; reads `initialId` from `?id=` param

#### Trip Form — Cost Centre Permission Gating
- Cost centre field restricted: only `isSTX`, `client_approver`, `client_ops` can edit
- Mandatory reason field always required when cost centre changes (no new-trip exemption)
- `originalCostCentre` tracked as `useState` (not `const`) so it updates when traveller auto-fills — required to correctly detect a user-initiated change vs auto-fill

#### Hotel Booking — Self-Managed Gate
- `selfManagedHotelBooking` toggle added to `hotelBooking` section of ClientForm and `CONFIG_DEFAULTS` in TenantContext
- In TripForm: `hotelBookingAllowedForTripType` = `features.hotelBooking && (tripType !== 'Self-Managed' || selfManagedHotelBooking)`
- STX users bypass all client permission gates — hotel booking button always shown when logged in as STX regardless of client config or trip type

#### Policy Variance Thresholds
- Per-client config in ClientForm: toggle to enable, type selector (% or $), value input, action selector (Warn / Require Approval) — separate settings for Accommodation and Flights
- `policyVariance` section added to `CONFIG_DEFAULTS` and `mergeWithDefaults` in TenantContext
- `travelPolicy` loaded from Firestore in TripForm; `findPolicyRate(city, rates)` with case-insensitive match + "All Cities" fallback
- `varianceBreaches` useMemo in TripForm — recomputes on every sector/cost/policy change
- On save: if any breach has `action: 'approve'`, status forced to `pending_approval`; `policyVarianceBreached` + `varianceBreaches[]` saved on trip document
- TripDetail: breach notice block above amend prompt showing each sector breach (cost vs policy rate, % over, threshold); approval-required message when status is `pending_approval` due to variance

#### Travel Dashboard — Active / Completed Tab Split
- `TravelManagement.jsx`: `COMPLETED_STATUSES = new Set(['completed', 'cancelled'])` defined at module level
- `activeTrips` / `completedTrips` split via `useMemo` using `getDisplayStatus(trip)` from TripList
- Tab switcher UI above the list: Active and Completed tabs with live count badges
- `key={activeTab}` on TripList resets all filters when switching tabs
- New Trip button hidden on Completed tab
- If arriving via `?status=cancelled` URL param, Completed tab is pre-selected

#### Accessibility Toolbar
- `src/components/layout/AccessibilityToolbar.jsx` — fixed floating button (bottom-right); panel opens upward
- 11 features across 4 sections:
  - **Text size**: `−` / `{n}%` / `+` buttons (10% steps, 80–160%); applied as `html.style.fontSize` to scale all `rem` units
  - **Colour** (chip toggles): High Contrast (`filter: contrast(1.5)`), Dark Contrast (smart invert: `filter: invert(1) hue-rotate(180deg)`), Light Background (white `main` bg), Grayscale (`filter: grayscale(1)`), Invert Colours (`filter: invert(1)`)
  - **Reading** (toggle rows): Readable Font (Lexend, lazy-loaded from Google Fonts), Underline Links, Increase Line Spacing
  - **Navigation** (toggle rows): Enhanced Focus Indicators (4px blue `outline` on `:focus-visible`), Reduce Motion (disables animations/transitions)
- Colour filters stacked as a single `body.style.filter` value computed from all active options — avoids CSS specificity conflicts
- Image correction: `a11y-invert-imgs` / `a11y-smart-imgs` CSS classes on `html` re-invert images to prevent double-inversion artifacts
- CSS injected via `<style id="a11y-styles">` tag on first mount; Lexend injected as `<link id="a11y-lexend">` only when enabled
- Active preference count badge on floating button; Reset All button appears in panel header when anything is active
- Persists to `localStorage` under key `stx_a11y_prefs`; restored on mount
- Respects `clientConfig.features.accessibilityToolbar` feature flag (STX always sees it)
- From email changed to `noreply@supportedtravelx.com.au` (was `notifications@...`)

---

### Post-Phase 8 Enhancements (Session 2) ✅

#### Lead Time Indicator
- `leadTimeDays(trip)` — days between `createdAt` and `startDate`; exported from `TripList.jsx`
- `LeadTimeBadge` component — colour-coded pill: 0–3 days (red), 4–10 (amber), 11–20 (yellow), 21+ (green)
- **TripList**: "Booking Window" column (hidden below `lg` breakpoint) showing label; `showDays` prop for compact form
- **TripDetail**: lead time shown in trip header alongside dates
- **All Travel report**: uses `leadTimeDays` + `LeadTimeBadge`

#### Travel Policy Report (full rebuild)
- Renamed from "Accommodation Policy" → "Travel Policy" (tab label + component)
- Component moved: `AccommodationPolicy.jsx` → `TravelPolicy.jsx`
- **Ex-GST comparison**: stored rates (incl. GST TD 2025/4) divided by 1.1 for all comparisons; incl-GST column removed
- **Flights tab**: groups trips by `destinationCity`, sums all flight sector costs per trip, compares avg ex-GST vs `flightRates[dest] / 1.1`
- **Feature flags**: `accommodationPolicy` (defaults true) + `flightPolicy` (defaults false) in `clientConfig.features`
  - Tab toggle only shown when both enabled; individual tab hidden when its flag is off; entire report tab hidden when both off
- **Rate editor in Admin Panel** (`ClientForm.jsx`): accommodation + flights tabs; `{ merge: true }` on all saves to preserve both `rates` and `flightRates`
- Two new feature toggles in ClientForm Features section: "Accommodation policy" + "Flight cost policy"

#### Digital Itinerary Email Notification
- `TravelManagement.jsx`: after saving a trip, detects when `digitalItineraryLink` is first added (was blank, now has value)
- Queues `trip_itinerary_added` email to all trip travellers via `/emailQueue`
- Cloud Function `onEmailQueued` handles new `trip_itinerary_added` type
- AccountSettings: new `trip_itinerary_added` preference ("Digital itinerary ready") between booked and pre-departure

#### Contact Page — Feedback & Fault Form
- `src/pages/Contact.jsx` rewritten: preserves original contact info + adds feedback/fault form
- Form fields: type toggle (Feedback / Report a fault), subject, description
- On submit: saves to `/portalFeedback/{id}` collection + queues `portal_feedback` email
- `portal_feedback` email type: Cloud Function queries all `stx_admin` + `stx_ops` users and sends to each
- Firestore rules: `portalFeedback` — create: any authenticated user; read: STX only
- Success state with "Send another" link

#### Sidebar Badge Tooltip
- `useAttentionCount` now returns `{ count, tooltip }` instead of a plain number
- Tooltip breakdown for STX/ops/client_ops: `"N pending approval · N to book"` on hover
- `client_approver`: `"N pending your approval"`; `client_traveller`: `"N trips declined"`
- `Badge` component in `Sidebar.jsx` accepts `tooltip` prop, renders as native `title` attribute

---

### Post-Phase 8 Enhancements (Session 1) ✅

#### Email Notifications (SendGrid)
- Cloud Functions: `onEmailQueued` (immediate dispatch) + `sweepEmailQueue` (daily scheduled)
- `/emailQueue` collection as dispatch queue; `scheduledFor` field for deferred delivery
- Templates: trip_submitted (to approvers), trip_approved, trip_declined, trip_booked, trip_itinerary_added, trip_pre_departure (3 days before), trip_rating_request (2 days after), portal_feedback (STX staff), trip_cancelled_by_client (STX staff)
- Mandatory emails (approved/declined) bypass user preference checks
- Queued from `TripDetail.jsx` on each status transition
- Pre-departure email scheduled 3 days before `startDate`; rating request 2 days after `endDate`
- **✅ SendGrid confirmed working** — API key stored in Firebase Secret Manager (`SENDGRID_API_KEY`); rotate with `firebase functions:secrets:set SENDGRID_API_KEY` then Y to redeploy

#### User Email Preferences (Account Settings)
- `src/components/account/AccountSettings.jsx` — modal from TopBar Settings button
- Toggle per notification type; approver-only types hidden for non-approver roles
- Preferences stored at `/users/{uid}.emailPreferences.{type}`
- Password reset via `sendPasswordResetEmail`

#### Sidebar Notification Badge
- `src/hooks/useAttentionCount.js` — targeted Firestore queries by role:
  - STX/client_ops: `pending_approval` + `approved` trips
  - client_approver: `pending_approval` trips (filtered by `approveFor[]`)
  - client_traveller: `declined` trips for own trips
- Red badge on Travel Management sidebar link; disappears at 0, shows `99+` above 99

#### CI/CD Fix
- Replaced deprecated `FIREBASE_TOKEN` with `google-github-actions/auth@v2` using `firebase-adminsdk` service account
- Both `deploy-dev.yml` and `deploy-prod.yml` updated
- Service account: `firebase-adminsdk-fbsvc@stx-corporate-dev.iam.gserviceaccount.com` (Firebase Admin + Storage Admin roles)

---

### Post-Phase 8 Enhancements (Session 4) ✅

#### Client Onboarding Form System
- `src/pages/OnboardingForm.jsx` (NEW) — public token-gated form at `/onboarding/:token`; no portal login required
- `src/components/admin/OnboardingManager.jsx` (NEW) — STX tab in Admin Panel to generate, track, and apply onboarding forms
- **Admin Panel** — new "Onboarding" tab added between Users and Feedback (uses `ClipboardList` icon)
- **10-section form:** Portal Identity, Cost Centres, Types of Travel (incl. sector types), Approval Workflow, Email Notifications, Portal Features (incl. self-managed hotel booking sub-toggle), Travel Spend Limits (accommodation + flight rates), Policy Compliance Rules (variance), Tax Settings, Questions & Notes
- **Onboarding flow:**
  1. STX sends a tokenised link (32-char hex token via `crypto.randomBytes`) to client email
  2. Client completes the form without any portal login — token serves as access control
  3. STX notified on submission (email to all STX staff + admin notify email)
  4. STX reviews responses and applies to an existing client OR creates a new client directly from the review modal
- `sendOnboardingForm` callable Cloud Function — generates token, stores `/onboarding/{token}` doc, sends invite email via SendGrid
- `onOnboardingSubmitted` Firestore trigger — fires on status → `submitted`; emails all STX staff
- **Firestore rules** — `allow read: if true` (token IS the access control); update allows `pending → submitted` transition without auth
- **Bug fix:** `buildUpdatePatch()` uses `updateDoc` with dot-notation for existing clients; `buildFullConfig()` uses `setDoc` for new clients — fixes cost centres and trip types not applying on initial review
- **Bitdefender false positive:** dev environment domain reputation issue; custom domain (`portal.supportedtravelx.com.au`) is the permanent fix

#### Per-User Permission Override System
- `src/components/shared/PermissionOverridesEditor.jsx` (NEW) — shared component showing all 8 configurable permissions as rows with role-default badge + grant/deny/role-default selector
- `src/utils/permissions.js` — `CLIENT_CONFIGURABLE_PERMISSIONS` array (8 permissions): `trip:create`, `trip:edit`, `trip:approve`, `trip:view_all`, `trip:delete`, `passenger:edit`, `report:view`, `team:manage`
- `src/contexts/PermissionsContext.jsx` — `hasPermission()` now checks `permissionOverrides` map on user doc first (explicit grant/deny wins over role default); falls through to `invoiceAccess` then role
- `src/components/admin/UserManager.jsx` — `PermissionOverridesEditor` shown in EditUserForm for client users; saved via direct `updateDoc` (not CF)
- `src/pages/Team.jsx` — `PermissionOverridesEditor` shown in EditMemberForm when STX OR when `features.customPermissions` is enabled for the client
- `src/components/admin/ClientForm.jsx` — `customPermissions: false` feature flag added; toggle in Features section
- `firestore.rules` — `permissionOverrides` added to blocked self-update fields (users cannot grant themselves permissions)
- Backward compatible — existing users with no `permissionOverrides` field behave exactly as before

#### Flexible Approval Scope System
- `src/hooks/useApprovalScope.js` (NEW) — returns `null` (approve all), `Set<uid>` (specific UIDs), or `'none'` (no permission); subscribes to members collection only when `approveScope === 'reports'`
- `matchesApprovalScope(scope, trip)` exported helper — used by TripDetail and useAttentionCount
- `client_ops` role gains `trip:approve` AND `trip:view_all` by default (both deniable via permissionOverrides)
- **Three approval scope modes** (stored as `approveScope` on `/users/{uid}`):
  - `all` — approve any trip in the client (default)
  - `select` — approve only for specific named members (`approveFor[]` list)
  - `reports` — approve for staff in reporting hierarchy; depth configurable (1=direct reports, 2=+once removed, 3=+twice removed) via `approveReportsDepth`
- `src/components/trips/TripDetail.jsx` — `isApprover` now uses `useApprovalScope` + `matchesApprovalScope`; removed hardcoded `client_approver`-only check
- `src/hooks/useAttentionCount.js` — approver badge uses `useApprovalScope` for correct scope filtering; ops badge unchanged
- `src/pages/Team.jsx` — full approval scope UI in EditMemberForm: radio selector (all/select/reports), member checkbox list for select mode, depth dropdown for reports mode
- `src/components/admin/UserManager.jsx` — same approval scope UI in EditUserForm; loads client members for select mode via `useClientMembers` hook
- `src/hooks/useTeamScope.js` — `trip:view_all` check now uses permission system (role + overrides) instead of hardcoding `role === 'client_ops'`; STX always gets `type: 'all'`
- **HierarchyView** tree node updated to show approval scope label for any user with approve permission
- **Cloud Function `trip_submitted`** handler updated — now notifies all users with effective `trip:approve` permission (both `client_approver` and `client_ops` by default); respects `approveScope` including reporting hierarchy traversal for `'reports'` scope
- Backward compatible — existing users with no `approveScope` field and `approveFor: []` treated as `'all'`; non-empty `approveFor` treated as `'select'`

---

### WCAG 2.1 AA Accessibility Implementation ✅ Complete

Full WCAG 2.1 Level AA compliance implemented across all four phases. Detailed implementation plan in `WCAG_IMPLEMENTATION_PLAN.md`.

**Phase 1 — Critical Blockers**
- **Colour contrast**: all text upgraded to `text-gray-700` minimum on light backgrounds; `text-gray-600` for secondary text; `text-gray-500` for placeholders — applied across ~25 files. Dark-background contexts (Sidebar) handled separately.
- **Skip navigation**: `<a href="#main-content">` as first focusable element in AppShell; visually hidden until keyboard-focused (sr-only / focus:not-sr-only pattern)
- **Modal focus trap**: `Modal.jsx` fully rewritten — manual focus trap (Tab/Shift+Tab cycling), stores `document.activeElement` on open and restores on close; `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
- **Form error ARIA**: `role="alert"` / `aria-live="assertive"` on error messages in LoginPage, TripForm, PassengerForm; `aria-invalid` and `aria-describedby` patterns added
- **Icon-only buttons**: all icon-only buttons have `aria-label`; all decorative icons have `aria-hidden="true"` — full audit across every component file
- **TopBar dropdown**: ClientSelector rebuilt with full ARIA — `aria-haspopup="listbox"`, `aria-expanded`, `role="listbox"`, `role="option"`, `aria-selected`, keyboard navigation (ArrowUp/Down, Enter, Escape)

**Phase 2 — Level AA**
- **Dynamic page titles**: every route sets `document.title` in `useEffect`; TripDetail updates dynamically when trip data loads; LoginPage title added
- **Focus indicators**: global `:focus-visible` CSS in `App.css` — 3px blue outline, 2px offset, 4px border-radius; hides for mouse via `:focus:not(:focus-visible)`. Works alongside AccessibilityToolbar's Enhanced Focus mode.
- **Status announcements**: `src/hooks/useAnnounce.js` created — writes to global `#status-announcer` `aria-live="polite"` region in AppShell via `requestAnimationFrame`; wired into TripList for filter result counts
- **Landmark regions**: `<nav aria-label="Main navigation">` in Sidebar; `<main id="main-content" tabIndex={-1}>` in AppShell; `role="status"` on loading states

**Phase 3 — Structural**
- **Sidebar list semantics**: navigation links wrapped in `<ul>/<li>` structure; badge count moved to `aria-hidden` with count surfaced in NavLink `aria-label`
- **Table scope attributes**: `scope="col"` added to all `<th>` elements — InvoiceBuilder, InvoiceDetail, AllTravelReport, UserManager, ClientManager, Team, Invoices pages
- **`prefers-reduced-motion`**: CSS media query in `App.css` disables all animations/transitions/scroll-behavior when OS motion reduction preference is set; complements AccessibilityToolbar's manual Reduce Motion toggle
- **Decorative icon audit**: `aria-hidden="true"` added to every Lucide icon across all components — TripForm, TripList, TripDetail, PassengerForm, PassengerDetail, AccountSettings, HotelBookingFlow (27 icons), admin components, reports; interactive star buttons (TripRatingModal) given `aria-label` + `aria-pressed`; star display (ProviderRatings) wrapped in `role="img" aria-label="N out of 5 stars"`

**Phase 4 — Testing & Hardening**
- **Placeholder contrast**: `placeholder:text-gray-500` added to the shared `inp` class constant in all form files (18 files) — browser default placeholder colour fails contrast
- **jest-axe**: installed (`npm install --save-dev jest-axe`); `src/__tests__/accessibility.test.js` created with 12 automated tests covering Modal, LoginPage, TripList (loaded/empty/loading states), StatusBadge (all statuses), LeadTimeBadge, TripRatingModal; runs in CI — axe violations fail the build

**WCAG 2.1 AA compliance tracker (post-implementation):**

| Criterion | Status |
|-----------|--------|
| 1.1.1 Non-text Content (A) | ✅ PASS |
| 1.3.1 Info & Relationships (A) | ✅ PASS |
| 1.4.3 Contrast — Minimum (AA) | ✅ PASS |
| 2.1.1 Keyboard (A) | ✅ PASS |
| 2.4.1 Bypass Blocks (A) | ✅ PASS |
| 2.4.2 Page Titled (A) | ✅ PASS |
| 2.4.7 Focus Visible (AA) | ✅ PASS |
| 3.3.1 Error Identification (A) | ✅ PASS |
| 4.1.2 Name, Role, Value (A) | ✅ PASS |
| 4.1.3 Status Messages (AA) | ✅ PASS |

**Remaining (manual only — no code changes needed):**
- Manual keyboard-only walkthrough + VoiceOver/NVDA screen reader test
- Lighthouse accessibility audit on 6 key pages before each production deploy (target 90+)

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
| `src/data/cities.js` | Canonical ~150-city list for trip origin/destination autocomplete |
| `src/components/trips/TripList.jsx` | Trip table with enhanced filters; exports calcTripExGST, StatusBadge, getDisplayStatus, leadTimeDays, LeadTimeBadge |
| `src/components/trips/TripForm.jsx` | Trip creation/edit form with sector sub-forms; origin/destination city fields |
| `src/components/trips/TripDetail.jsx` | Trip detail view with workflow actions + history; inline cost centre edit |
| `src/components/trips/Attachments.jsx` | Firebase Storage upload/download/delete |
| `src/hooks/useTrips.js` | Real-time trips listener; supports filterClientId param |
| `src/hooks/useTeamScope.js` | Team hierarchy scope; filterTripsByScope() |
| `src/hooks/useInvoices.js` | Real-time invoices listener; createInvoice (with atomic counter), updateInvoice, deleteInvoice |
| `src/components/invoices/InvoiceBuilder.jsx` | Invoice creation/edit UI with period selector, scan, inline editing |
| `src/components/invoices/InvoiceDetail.jsx` | Invoice view with inline editing, PDF/CSV export, mark paid, delete |
| `src/pages/Dashboard.jsx` | Dashboard with stats, charts, upcoming/recent trips |
| `src/pages/TravelManagement.jsx` | Trip CRUD orchestration page |
| `src/pages/Reports.jsx` | 5-tab reports page; loads trips via useTrips + useTeamScope; STX prompt if no client selected |
| `src/components/reports/AllTravelReport.jsx` | All Travel report |
| `src/components/reports/AvgSpendByDestination.jsx` | Avg Spend by Destination report |
| `src/components/reports/SpendByDepartureCity.jsx` | Spend by Departure City report |
| `src/components/reports/HotelPopularity.jsx` | Hotel Popularity report |
| `src/components/reports/TravelPolicy.jsx` | Travel Policy report — accommodation + flights tabs, ex-GST comparison, feature-flag controlled |
| `src/pages/Contact.jsx` | Contact page with STX details + feedback/fault submission form |
| `src/utils/reportHelpers.js` | Shared report utilities (date ranges, cost calcs, CSV export) |
| `src/pages/Invoices.jsx` | Invoice list/builder/detail navigation |
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

*Last updated: 30 April 2026 — Phases 0–5, 7–8 complete + major post-phase enhancements. Recent (Session 4): Client onboarding form system, per-user permission override system (CLIENT_CONFIGURABLE_PERMISSIONS + permissionOverrides on user doc), flexible approval scope (all/select/reports hierarchy) with useApprovalScope hook, trip:view_all and trip:approve added to client_ops defaults, Cloud Function approval email updated to notify all approvers with effective permission. Phase 6 (Hotel Booking) deferred. Phase 9 (QA + Production) next.*
