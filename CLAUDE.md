# CLAUDE.md — STX Corporate Portal V2 (Phase 0 complete)

## Commands

```bash
npm start        # Dev server (port 3000) — uses .env.development (stx-corporate-dev Firebase)
npm run build    # Production build → /build
npm test         # Run tests
```

Firebase deploy (requires `firebase login` first):
```bash
firebase use dev   # Switch to stx-corporate-dev
firebase deploy    # Deploy rules + hosting

firebase use prod  # Switch to stx-corporate
firebase deploy
```

## Architecture

**STX Corporate Portal V2** — multi-tenant corporate travel management platform.
React 19 + Firebase. All client-specific configuration is stored in Firestore, not hardcoded.

### Stack
- **Frontend**: React 19, React Router v6, Tailwind CSS v3, Lucide React, Recharts
- **Backend**: Firebase Auth + Firestore + Storage + Cloud Functions (Node 22)
- **External APIs**: Nuitee (`api.liteapi.travel/v3.0`) for hotel bookings

### Key files
| File | Purpose |
|------|---------|
| `src/App.js` | Router + context provider tree |
| `src/firebase.js` | Firebase initialisation (reads from env vars) |
| `src/contexts/AuthContext.jsx` | Firebase auth state + user profile from Firestore |
| `src/contexts/TenantContext.jsx` | Loads `/clients/{clientId}/config/settings` on login |
| `src/contexts/PermissionsContext.jsx` | Derives permission set from user role |
| `src/utils/permissions.js` | PERMISSIONS constants + ROLE_PERMISSIONS map |
| `firestore.rules` | Firestore security rules (tenant isolation) |
| `firebase.json` | Firebase hosting + rules config |

### Folder structure
```
src/
├── components/
│   ├── auth/         LoginPage, ForgotPassword
│   ├── layout/       AppShell, Sidebar, TopBar
│   ├── trips/        TripList, TripForm, TripDetail, sectors/
│   ├── passengers/   PassengerList, PassengerForm
│   ├── hotels/       HotelSearch, HotelCard, RoomSelector
│   ├── invoices/     InvoiceGenerator
│   ├── reports/      Four report components
│   ├── admin/        ClientManager, UserManager, GlobalTripView
│   └── shared/       Modal, PermissionGate, StatusBadge, etc.
├── contexts/         AuthContext, TenantContext, PermissionsContext
├── hooks/            useTrips, usePassengers, useNuitee, etc.
├── pages/            One file per route
├── services/         firestore.js, auth.js, nuitee.js
└── utils/            permissions.js, formatters.js
```

### Multi-tenant architecture
- Each corporate client has a `clientId` (e.g. `"dana"`, `"acme"`)
- All tenant data lives under `/clients/{clientId}/` in Firestore
- Tenant config (branding, cost centres, fees, workflow, feature flags) is at `/clients/{clientId}/config/settings`
- Firebase Custom Claims encode `{ role, clientId }` in the JWT — security rules enforce isolation
- STX staff (`stx_admin`, `stx_ops`) have `clientId: null` and can access all tenants

### Roles
| Role | Access |
|------|--------|
| `stx_admin` | Everything — create tenants, manage all users, view all data |
| `stx_ops` | View/manage trips across all clients, approve, generate invoices |
| `client_ops` | Create/edit trips and passengers within own client only |
| `client_approver` | Approve trips within own client only |
| `client_traveller` | Read-only view of own client's trips |

### Firestore collections
- `/clients/{clientId}/config/settings` — tenant config
- `/clients/{clientId}/trips/{tripId}` — trips
- `/clients/{clientId}/passengers/{passengerId}` — passenger profiles
- `/clients/{clientId}/invoices/{invoiceId}` — invoices
- `/users/{userId}` — user profiles with role + clientId

### Firebase projects
- **Dev/Staging**: `stx-corporate-dev` — used during development, accessed via `.env.development`
- **Production**: `stx-corporate` — live environment, accessed via `.env.production`

### CI/CD
- `main` branch → auto-deploys to `stx-corporate-dev`
- `prod` branch → auto-deploys to `stx-corporate`
- Secrets required in GitHub repo settings (see SETUP_CHECKLIST.md)

### Implementation phases
See `Commercialisation/IMPLEMENTATION_PLAN.md` in the stx-portal repo for full plan.
Current status: Phase 0 complete (skeleton running), Phase 1 in progress (auth + routing).
