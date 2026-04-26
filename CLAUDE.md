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
- **Frontend**: React, React Router v6, Tailwind CSS v3, Lucide React, Recharts
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
| `src/utils/formatters.js` | Date/currency formatting helpers |
| `firestore.rules` | Firestore security rules (tenant isolation) |
| `firebase.json` | Firebase hosting + rules + functions config |
| `functions/index.js` | All Cloud Functions |

### Folder structure
```
src/
├── components/
│   ├── auth/         LoginPage
│   ├── layout/       AppShell, Sidebar, TopBar
│   ├── trips/        TripList, TripForm, TripDetail, sectors/   ← Phase 4
│   ├── passengers/   PassengerList, PassengerForm               ← Phase 5
│   ├── hotels/       HotelSearch, HotelCard, RoomSelector       ← Phase 6
│   ├── invoices/     InvoiceGenerator                           ← Phase 7
│   ├── reports/      Four report components                     ← Phase 8
│   ├── admin/        ClientManager, ClientForm, UserManager
│   └── shared/       Modal, Toggle, TagInput, PermissionGate
├── contexts/         AuthContext, TenantContext, PermissionsContext
├── hooks/            useTrips (Ph4), usePassengers (Ph5), useNuitee (Ph6)
├── pages/            One file per route
├── services/         (Phase 4+)
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
| `stx_admin` | Everything — create tenants, manage all users, delete users, view all data |
| `stx_ops` | View/manage trips across all clients, approve, generate invoices |
| `client_ops` | Create/edit trips and passengers within own client only |
| `client_approver` | Approve/decline trips within own client only |
| `client_traveller` | Read-only view of own client's trips |

### Firestore collections
- `/clients/{clientId}` — tenant root (name, active status)
- `/clients/{clientId}/config/settings` — full tenant config
- `/clients/{clientId}/trips/{tripId}` — trips
- `/clients/{clientId}/passengers/{passengerId}` — passenger profiles
- `/clients/{clientId}/invoices/{invoiceId}` — invoices
- `/users/{userId}` — user profiles with role + clientId

### Cloud Functions (functions/index.js)
| Function | Trigger | Purpose |
|----------|---------|---------|
| `syncUserClaims` | Firestore write on `/users/{uid}` | Sets role+clientId as JWT custom claims |
| `refreshUserClaims` | HTTPS callable | Force-refresh claims (stx_admin only) |
| `createClientUser` | HTTPS callable | Create user in Auth + Firestore (stx_admin/ops) |
| `updateClientUser` | HTTPS callable | Update user profile + sync to Auth (stx_admin) |
| `deleteClientUser` | HTTPS callable | Remove user from Auth + Firestore (stx_admin) |
| `sendPasswordReset` | HTTPS callable | Generate password reset link (stx_admin) |

### Firebase projects
- **Dev/Staging**: `stx-corporate-dev` — used during development, `.env.development`
- **Production**: `stx-corporate` — live environment, `.env.production`

### CI/CD
- `main` branch → auto-deploys to `stx-corporate-dev` (GitHub Actions)
- `prod` branch → auto-deploys to `stx-corporate`

### Current status
**Phase 3 complete. Phase 4 (Trip Management) in progress.**
See `PROGRESS.md` for full phase breakdown.
