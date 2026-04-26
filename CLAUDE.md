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
| `src/contexts/TenantContext.jsx` | Loads client config; STX working-client selector state |
| `src/contexts/PermissionsContext.jsx` | Derives permission set from user role |
| `src/utils/permissions.js` | PERMISSIONS constants + ROLE_PERMISSIONS map |
| `src/utils/formatters.js` | Date/currency formatting helpers |
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
│   ├── hotels/       HotelSearch, HotelCard, RoomSelector             ← Phase 6
│   ├── invoices/     InvoiceGenerator                                 ← Phase 7
│   ├── reports/      Four report components                           ← Phase 8
│   ├── admin/        ClientManager, ClientForm, UserManager
│   └── shared/       Modal, Toggle, TagInput, PermissionGate
├── contexts/         AuthContext, TenantContext, PermissionsContext
├── hooks/            useTrips, useTeamScope, usePassengers (Ph5), useNuitee (Ph6)
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
- `/clients/{clientId}/invoices/{invoiceId}` — invoices ← Phase 7
- `/users/{userId}` — user profiles with role, clientId, managerId, approveFor

### Trip data model (key fields)
```
trip {
  clientId, title, travellerName, travellerId,  // travellerId links to users/{uid}
  tripType, costCentre, startDate, endDate,
  status,          // draft | pending_approval | approved | declined | booked | cancelled
  sectors[],       // flight | accommodation | car-hire | parking | transfers | meals | other
  fees[],          // management fee, amendment fee — stored ex-GST
  attachments[],   // Firebase Storage refs
  amendments[],    // full audit trail with diff (changes[])
  createdBy, createdAt, updatedAt
}
```
Note: `travelling` and `completed` are **derived** from `status === 'booked'` + travel dates — not stored.

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
- `calcTripExGST(trip)` — domestic sectors ÷ 1.1, international at face value, fees added directly (already ex-GST)
- `diffTrip()` and `calcSectorCost()` are **module-level** functions in `TravelManagement.jsx` (not inside the component) — important for closure correctness
- Amendment fee prompt lives in `TripDetail` (sets `pendingAmendFee`); amendment save logic lives in `TravelManagement.handleSave`
- Firestore client config path is `clients/{id}/config/settings` (subcollection), **not** `clients/{id}.config`
- `useTeamScope(userProfile, clientId)` returns `{ type: 'all' | 'team' | 'self', uids: Set<string> }` — apply with `filterTripsByScope()`

### Current status
**Phases 0–5 complete. Phase 6 (Hotel Booking) next.**
See `PROGRESS.md` for full phase breakdown.
