# STX Corporate Portal — Feature Roadmap & Implementation Plan

> **Document purpose:** Detailed technical implementation plan for all recommended features.
> **Created:** 1 May 2026
> **Context:** Built for corporate travel management at disability organisations. NDIS is explicitly out of scope — this platform covers organisational staff travel only.

---

## Overview

The platform is feature-complete for core corporate travel management. The recommendations in this plan fall into four phases:

| Phase | Theme | Items | Est. Effort |
|-------|-------|-------|-------------|
| A | Disability-specific enhancements | 6 features | ~30–40 hrs |
| B | Operational efficiency | 6 features | ~25–35 hrs |
| C | Reporting enhancements | 5 features | ~20–25 hrs |
| D | Platform maturity | 4 features | ~40–60 hrs |

Each item includes: the problem being solved, the full data model changes, the files to modify, and step-by-step implementation notes.

---

## Phase A — Disability-Specific Enhancements

*These features have the highest strategic value — they differentiate this product from generic corporate travel tools and directly serve the disability sector context.*

---

### A1 — Accessibility Summary Card on Trips

**Problem:** A traveller's accessibility needs (wheelchair model, carer requirements, dietary needs, mobility aid details) are stored in their passenger profile but are invisible during trip creation and on the trip detail view. STX staff must navigate away from the trip to find this information when booking.

**Why it matters:** A missed wheelchair requirement or dietary need discovered at check-in is a serious service failure. The trip record should surface everything relevant to the booking at the moment it's needed.

**Files to modify:**
- `src/components/trips/TripForm.jsx` — show card when a traveller is selected
- `src/components/trips/TripDetail.jsx` — show card in trip header area
- `src/hooks/usePassengers.js` — already provides passenger data; TripForm needs to query it

**Data model:** No schema changes. Reads from existing `/clients/{clientId}/passengers/{passengerId}`.

**Implementation steps:**

1. **Create `src/components/trips/TravellerAccessibilityCard.jsx`** — a reusable read-only component:
   ```jsx
   // Props: passenger (object from Firestore), collapsible (bool)
   // Shows: disability/support needs, mobility aids, carer requirements, dietary
   // If all fields empty: shows "No accessibility requirements on file"
   // Collapsed by default in TripForm; expanded by default in TripDetail
   ```

2. **In `TripForm.jsx`** — when `travellerId` is set from autocomplete, load the matching passenger profile via `getDoc(doc(db, 'clients', cid, 'passengers', passengerId))` and store in state as `travellerPassenger`. Render `<TravellerAccessibilityCard passenger={travellerPassenger} collapsible />` below the traveller row.

3. **In `TripDetail.jsx`** — in the trip header section (below traveller name / trip type), load the passenger profile using `trip.travellerId` cross-referenced against passengers, and render `<TravellerAccessibilityCard passenger={...} />`.

4. **Card content:**
   - If `passenger.disabilityNeeds`: show as tag list
   - If `passenger.mobilityAids` / `passenger.wheelchairModel` / `passenger.wheelchairDimensions`: show in a structured row (type + model + weight + dimensions)
   - If `passenger.batteryType` (power wheelchair): show battery model — airlines need this
   - If `passenger.requiresCarer`: show carer flag with note
   - If `passenger.dietaryRequirements`: show
   - Show link: "View full profile →" navigating to Profiles page with that passenger selected

5. **UX:** Use an amber `AlertTriangle` banner header ("Accessibility requirements on file") so it's never overlooked. If no requirements, show a subtle gray "No accessibility requirements recorded" with a link to update the profile.

---

### A2 — Support Worker / Carer Flag on Additional Passengers

**Problem:** The `additionalPassengers[]` array on a trip treats all co-travellers identically. A support worker accompanying a traveller is an organisational cost category that should be distinguishable from a colleague on the same trip.

**Why it matters:** Disability organisations need to report separately on how much is spent on support worker travel — for grants, funding acquittals, and service costing.

**Files to modify:**
- `src/components/trips/TripForm.jsx` — add role selector to additional passenger rows
- `src/components/trips/TripDetail.jsx` — display role badge on passengers
- `src/components/reports/AllTravelReport.jsx` — add support worker flag to CSV export
- New report: `src/components/reports/SupportWorkerReport.jsx` (see C3)

**Data model change:**
```js
// additionalPassengers[] items gain a new field:
{
  name: string,
  passengerId: string,
  costCentre: string,
  role: 'traveller' | 'support_worker' | 'carer',  // NEW — default 'traveller'
}
```

**Implementation steps:**

1. **In `TripForm.jsx`** — in the additional passengers section, add a `<select>` per row:
   ```jsx
   <select value={p.role || 'traveller'} onChange={...}>
     <option value="traveller">Co-traveller</option>
     <option value="support_worker">Support worker</option>
     <option value="carer">Carer</option>
   </select>
   ```

2. **In `TripDetail.jsx`** — render a badge next to each additional passenger name:
   - "Support worker" → amber badge
   - "Carer" → blue badge
   - "Co-traveller" → no badge (default, no visual noise)

3. **Cost attribution:** In `calcTripExGST` and Dashboard cost calculations, no change needed — costs are still sector-level, not passenger-level. The role field is informational and for reporting only.

4. **In `TravelManagement.jsx` `diffTrip()`** — add `role` to the per-passenger change tracking.

5. **Feature flag:** No flag needed — always available.

---

### A3 — Flight Special Assistance Request (SSR) Codes

**Problem:** Airlines require advance notification of passengers with disability-related needs. These are standardised as SSR (Special Service Request) codes. Currently there's no way to record what's been requested on a flight sector.

**Why it matters:** Missing an SSR code means a traveller with a power wheelchair may be stranded at the gate, or a traveller who can't transfer to an aircraft seat isn't seated appropriately. Recording SSR codes on the sector creates accountability.

**Files to modify:**
- `src/components/trips/TripForm.jsx` — add SSR section to flight sector sub-form
- `src/components/trips/TripDetail.jsx` — display SSR codes on flight sector cards
- `src/components/trips/TripDetail.jsx` — booking checklist gating (see A6)

**Data model change:**
```js
// Flight sector gains:
sector {
  type: 'flight',
  // ...existing fields...
  specialAssistance: string[],   // NEW — SSR codes selected
  specialAssistanceOther: string, // NEW — free text for 'other'
}
```

**SSR codes to include:**
```js
const FLIGHT_SSR_OPTIONS = [
  { code: 'WCHR', label: 'Wheelchair — can walk short distances (to/from gate)' },
  { code: 'WCHP', label: 'Wheelchair — can walk to seat but not long distances' },
  { code: 'WCHC', label: 'Wheelchair — cannot walk at all (requires full assistance)' },
  { code: 'WCBD', label: 'Dry-cell battery wheelchair (cabin storage)' },
  { code: 'WCBW', label: 'Wet-cell battery wheelchair (hold only)' },
  { code: 'WCMP', label: 'Manual collapsible wheelchair' },
  { code: 'BLND', label: 'Blind / visually impaired traveller' },
  { code: 'DEAF', label: 'Deaf / hearing impaired traveller' },
  { code: 'DPNA', label: 'Traveller with intellectual or developmental disability requiring assistance' },
  { code: 'PETC', label: 'Emotional support or assistance animal in cabin' },
  { code: 'UMNR', label: 'Unaccompanied minor' },
  { other: true, label: 'Other — specify below' },
];
```

**Implementation steps:**

1. **In `TripForm.jsx`** flight sector sub-form — add a collapsible "Special assistance" section at the bottom:
   - Checkbox list from `FLIGHT_SSR_OPTIONS`
   - If 'Other' checked, show free-text input
   - Collapsed by default; expands to show selected codes even when collapsed

2. **In `TripDetail.jsx`** flight sector cards — show selected SSR codes as small blue tags below the flight route/date row. If none selected, show nothing (no empty state clutter).

3. **Booking gate (see A6):** If a trip's passenger has `wheelchairModel` set but no WCHR/WCHP/WCHC SSR on any flight sector, flag this in the pre-booking checklist.

---

### A4 — Accessible Accommodation Requirements

**Problem:** When booking accommodation, there's no way to specify what accessibility the room needs to provide. STX must remember to ask separately, creating a risk of inaccessible rooms being confirmed.

**Files to modify:**
- `src/components/trips/TripForm.jsx` — add requirements section to accommodation sector sub-form
- `src/components/trips/TripDetail.jsx` — display requirements on accommodation sector cards

**Data model change:**
```js
// Accommodation sector gains:
sector {
  type: 'accommodation',
  // ...existing fields...
  accessibilityRequirements: string[], // NEW — list of requirement keys
  accessibilityNotes: string,          // NEW — free text
}
```

**Requirement options:**
```js
const ACCOM_ACCESSIBILITY_OPTIONS = [
  { key: 'roll_in_shower',      label: 'Roll-in shower' },
  { key: 'grab_rails',          label: 'Grab rails / bathroom support' },
  { key: 'bath_hoist',          label: 'Bath hoist / shower chair' },
  { key: 'ground_floor',        label: 'Ground floor or lift access required' },
  { key: 'wide_doorways',       label: 'Wide doorways / turning circle (≥ 900mm)' },
  { key: 'hearing_loop',        label: 'Hearing loop / visual fire alarm' },
  { key: 'accessible_parking',  label: 'Accessible parking at property' },
  { key: 'carer_bed',           label: 'Carer / attendant bed in same room' },
  { key: 'adjustable_bed',      label: 'Height-adjustable or profiling bed' },
  { key: 'no_steps',            label: 'No steps at entry / throughout property' },
];
```

**Implementation steps:**

1. **In `TripForm.jsx`** accommodation sub-form — add a collapsible "Accessibility requirements" section below check-in/out dates.

2. **Display in TripDetail** — show selected requirements as tags in the accommodation sector card. If requirements are set, use a small `Accessibility` icon as a visual flag so they're never missed at a glance.

3. **Provider ratings linkage (A5):** When a trip is rated, pre-fill the prompt "Were your accessibility requirements met?" based on whether any requirements were specified.

---

### A5 — Accessibility Dimension in Provider Ratings

**Problem:** The current `TripRatingModal` captures general star ratings per provider and free text. It doesn't explicitly ask about accessibility outcomes, which is the primary quality measure for this platform's clients.

**Files to modify:**
- `src/components/trips/TripRatingModal.jsx` — add accessibility fields
- `src/components/reports/ProviderRatings.jsx` — surface accessibility ratings
- New report: accessible provider summary (see C3)

**Data model change:**
```js
// tripFeedback document gains per-provider:
providerRating {
  name: string,
  type: string,
  stars: number,             // existing
  comment: string,           // existing
  accessibilityStars: number, // NEW — 0 if not rated
  accessibilityMet: boolean | null, // NEW — were stated requirements met?
  wouldUseAgain: boolean | null,    // NEW — would you use for similar traveller?
}
```

**Implementation steps:**

1. **In `TripRatingModal.jsx`** — for each provider card, add below the existing star input:
   - A second star row labelled "Accessibility" (show only if the trip has any accessibility requirements set — passenger profile has needs OR sector has SSR/accommodation requirements)
   - Two yes/no toggle buttons: "Were your accessibility requirements met?" + "Would you recommend for a traveller with similar needs?"

2. **If trip has no accessibility requirements** — don't show the accessibility section at all (no clutter for trips where it's irrelevant).

3. **In `ProviderRatings.jsx`** — add an "Accessibility" column to the provider table showing the average accessibility star rating where available. Add filter: "Show only providers with accessibility ratings."

4. **New aggregate view:** A leaderboard of providers sorted by accessibility rating (see C3 for the dedicated report).

---

### A6 — Pre-Booking Accessibility Checklist (STX-side)

**Problem:** Before confirming a booking, STX needs to verify that all accessibility arrangements have been put in place. This is currently informal — no structured process, no record of what was checked.

**Why it matters:** An unchecked accessibility requirement discovered after booking is a serious incident. A logged checklist creates accountability and a paper trail.

**Files to modify:**
- `src/components/trips/TripDetail.jsx` — main implementation
- `src/pages/TravelManagement.jsx` — gate on status change to 'booked'

**Data model change:**
```js
// Trip document gains:
trip {
  // ...existing fields...
  bookingChecklist: {
    items: [
      {
        key: string,            // e.g. 'mobility_aid_airline'
        label: string,          // human description
        checked: boolean,
        checkedBy: string,      // uid
        checkedByName: string,
        checkedAt: string,      // ISO timestamp
        waived: boolean,        // STX can waive an item with a reason
        waivedReason: string,
      }
    ],
    generatedAt: string,        // when the checklist was auto-generated
    completedAt: string | null, // when all items were ticked/waived
  }
}
```

**Checklist auto-generation rules:**
```js
function generateChecklist(trip, passengerProfile) {
  const items = [];

  // Always present for STX-managed trips
  items.push({ key: 'itinerary_sent',      label: 'Digital itinerary sent to traveller' });
  items.push({ key: 'contact_confirmed',   label: 'Traveller contact details confirmed' });

  // If passenger has wheelchair / mobility aid
  if (passengerProfile?.mobilityAids?.length || passengerProfile?.wheelchairModel) {
    items.push({ key: 'mobility_aid_airline',    label: 'Mobility aid notified to airline — dimensions and battery type confirmed' });
    items.push({ key: 'mobility_aid_handling',   label: 'Ground handling instructions confirmed with airline' });
  }

  // If any flight sector has WCHR/WCHP/WCHC SSR
  const hasWheelchairSSR = trip.sectors.some(s => s.type === 'flight' &&
    (s.specialAssistance || []).some(code => ['WCHR','WCHP','WCHC'].includes(code)));
  if (hasWheelchairSSR) {
    items.push({ key: 'wheelchair_assist_confirmed', label: 'Airport wheelchair assistance confirmed at origin and destination' });
  }

  // If accommodation has accessibility requirements
  const accomWithReqs = trip.sectors.filter(s =>
    s.type === 'accommodation' && (s.accessibilityRequirements || []).length > 0);
  accomWithReqs.forEach((s, i) => {
    items.push({
      key: `accom_access_${i}`,
      label: `Accessible room requirements confirmed with ${s.propertyName || 'accommodation provider'}`
    });
  });

  // If passenger requires carer / additional passenger is support worker
  const hasSupportWorker = (trip.additionalPassengers || []).some(
    p => ['support_worker', 'carer'].includes(p.role));
  const requiresCarer = passengerProfile?.requiresCarer;
  if (hasSupportWorker || requiresCarer) {
    items.push({ key: 'carer_seating',  label: 'Carer / support worker seated adjacent to traveller on all flights' });
    items.push({ key: 'carer_rooming',  label: 'Carer / support worker room booked adjacent or in same room' });
  }

  // If any flight has DPNA or assistance animal SSR
  const hasDPNA = trip.sectors.some(s =>
    s.type === 'flight' && (s.specialAssistance || []).includes('DPNA'));
  if (hasDPNA) {
    items.push({ key: 'dpna_briefed', label: 'Airline briefed on traveller support needs — ground and cabin crew notified' });
  }

  // If international travel
  const isInternational = trip.sectors.some(s => s.international);
  if (isInternational) {
    items.push({ key: 'insurance_confirmed',  label: 'Travel insurance confirmed and policy details recorded on trip' });
    items.push({ key: 'visa_confirmed',       label: 'Visa / entry requirements checked for destination country' });
    items.push({ key: 'emergency_contacts',   label: 'In-country emergency contacts confirmed' });
  }

  return items.map(item => ({ ...item, checked: false, waived: false }));
}
```

**Implementation steps:**

1. **In `TripDetail.jsx`** — add a "Pre-booking checklist" section visible only to `isSTX`, shown when trip status is `approved` (i.e., ready to be booked):
   - Auto-generate checklist items when section first opens (call `generateChecklist()`)
   - Save the generated checklist to Firestore via `updateDoc` on first open
   - Each item: checkbox + label + "Waive" button (with reason input)
   - Checked items show who checked it and when (timestamp + name)
   - Progress indicator: "4 of 6 items complete"

2. **Gate on "Mark as Booked":** In `TripDetail.jsx`, before allowing the status change to `booked`:
   - If `bookingChecklist.items` exist and any are unchecked and not waived → show a warning modal listing the outstanding items
   - Not a hard block — STX can confirm and proceed — but the override is logged in the amendment history

3. **When checklist is fully complete:** Show a green "All checks complete" banner; "Mark as Booked" button becomes primary (no warning modal).

4. **Re-generate trigger:** If trip sectors change after checklist is generated, show a "Trip has been amended — checklist may need review" notice.

---

## Phase B — Operational Efficiency

---

### B1 — Trip Duplication

**Problem:** Many organisations make the same trip repeatedly (quarterly board meetings, recurring training, regular client sites). Currently each trip must be built from scratch.

**Files to modify:**
- `src/components/trips/TripDetail.jsx` — add "Duplicate trip" button
- `src/pages/TravelManagement.jsx` — handle the duplicate action

**Implementation steps:**

1. **In `TripDetail.jsx`** — add a "Duplicate" button to the action bar (visible to users with trip:create permission):
   ```jsx
   <button onClick={() => onDuplicate(trip)}>
     <Copy size={14} /> Duplicate trip
   </button>
   ```

2. **In `TravelManagement.jsx`** — add `handleDuplicate(trip)`:
   ```js
   const handleDuplicate = (trip) => {
     const { id, tripRef, createdAt, updatedAt, amendments, status,
             fees, bookingChecklist, policyVarianceBreached, varianceBreaches,
             startDate, endDate, ...rest } = trip;
     // Clear dates, reset status, clear history
     setFormTrip({
       ...rest,
       startDate: '',
       endDate: '',
       status: 'draft',
       // Clear sector dates too
       sectors: (rest.sectors || []).map(s => ({
         ...s,
         date: '', checkIn: '', checkOut: '',
       })),
     });
   };
   ```

3. The form opens pre-filled (traveller, cost centre, trip type, sector types and costs from the original). User adjusts dates and submits as a new trip.

4. Amendment history on the new trip gets a single entry: "Duplicated from trip [ref]".

---

### B2 — Calendar Export (iCal)

**Problem:** Approved and booked trips have travel dates that should be in the traveller's calendar. Currently there's no way to export this without manual entry.

**Files to modify:**
- `src/components/trips/TripDetail.jsx` — add export button

**Implementation steps:**

1. **Add `generateICS(trip)` utility function** in `src/utils/formatters.js`:
   ```js
   export function generateICS(trip) {
     const fmt = iso => iso.replace(/-/g, '');
     const lines = [
       'BEGIN:VCALENDAR',
       'VERSION:2.0',
       'PRODID:-//STX Corporate Portal//EN',
       'BEGIN:VEVENT',
       `UID:${trip.id}@stx-portal`,
       `DTSTART;VALUE=DATE:${fmt(trip.startDate)}`,
       `DTEND;VALUE=DATE:${fmt(trip.endDate || trip.startDate)}`,
       `SUMMARY:${trip.title || 'Business Travel'}`,
       `DESCRIPTION:${trip.originCity ? `${trip.originCity} → ` : ''}${trip.destinationCity || ''} · ${trip.tripType || ''}`,
       `LOCATION:${trip.destinationCity || ''}`,
       'END:VEVENT',
       'END:VCALENDAR',
     ];
     return lines.join('\r\n');
   }
   ```

2. **In `TripDetail.jsx`** — add a "Add to calendar" button for trips with status `approved`, `booked`, or travelling:
   ```js
   const handleCalendarExport = () => {
     const ics = generateICS(trip);
     const blob = new Blob([ics], { type: 'text/calendar' });
     const url = URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
     a.download = `${trip.title || 'trip'}.ics`;
     a.click();
     URL.revokeObjectURL(url);
   };
   ```

3. Optionally add sector-level events (one VEVENT per flight, one per accommodation check-in) for a more detailed calendar entry.

---

### B3 — Budget Management by Cost Centre

**Problem:** Policy compliance exists at the sector level (accommodation rate, flight rate per destination), but there's no concept of a total travel budget. Organisations can't track whether they're on track to spend within their annual travel allocation.

**Files to modify:**
- `src/components/admin/ClientForm.jsx` — new "Budgets" section
- `src/pages/Dashboard.jsx` — budget vs actual widget
- `src/contexts/TenantContext.jsx` — add budgets to CONFIG_DEFAULTS
- New Firestore path: `/clients/{clientId}/config/budgets`

**Data model:**
```js
// /clients/{clientId}/config/budgets
{
  financialYear: '2025-26',   // which FY these budgets apply to (AU FY: Jul–Jun)
  total: 50000,               // optional overall budget
  byCostCentre: {
    'Corporate': 20000,
    'Programs': 15000,
    'Management': 15000,
  },
  alertThreshold: 80,         // % — warn when a cost centre reaches this
  updatedAt: timestamp,
}
```

**Implementation steps:**

1. **In `ClientForm.jsx`** — add a "Travel Budgets" section (collapsed by default):
   - FY selector (current and next FY)
   - Overall budget input
   - Per-cost-centre budget inputs (dynamically generated from the configured cost centres list)
   - Alert threshold % slider
   - Save via `setDoc(doc(db, 'clients', clientId, 'config', 'budgets'), data, { merge: true })`

2. **In `Dashboard.jsx`** — new "Budget" section between the stat cards and the charts:
   - Load budget from `/clients/{clientId}/config/budgets`
   - Calculate YTD spend per cost centre from trips (using existing `calcTripExGST`)
   - For each cost centre with a budget: horizontal progress bar showing % consumed
   - Colour: green < 70%, amber 70–90%, red > 90%
   - If no budgets configured: show a subtle "Set up travel budgets →" prompt (STX only)

3. **Warning in TripForm:** When a trip is being created and a cost centre is selected, calculate whether adding this trip's estimated cost would push that cost centre over its budget threshold. If yes, show a yellow warning banner (not a block — just informational).

---

### B4 — Document Expiry Tracking

**Problem:** Passenger profiles store identity documents but don't capture expiry dates. An expired passport for international travel is a trip-ending failure discovered too late.

**Files to modify:**
- `src/components/passengers/PassengerForm.jsx` — add expiry date field
- `src/components/passengers/PassengerDetail.jsx` — show expiry + warning
- `src/components/trips/TripForm.jsx` — warn if traveller's document expires before trip end
- `src/pages/Dashboard.jsx` — expiry alert widget (STX-side)

**Data model change:**
```js
// Passenger profile — existing identityDocuments[] items gain:
{
  type: string,
  number: string,
  expiryDate: string,  // NEW — ISO date 'YYYY-MM-DD'
}
```

**Implementation steps:**

1. **In `PassengerForm.jsx`** — add an `expiryDate` date input to each identity document row.

2. **In `PassengerDetail.jsx`** — for each document, show expiry status:
   - Green: expires > 6 months away
   - Amber: expires within 6 months — "Renewal recommended"
   - Red: expires within 30 days or already expired — "Action required"

3. **In `TripForm.jsx`** — when a traveller is selected and the trip has international sectors, check if any of their documents expire before `trip.endDate`. If so, show: "Warning: [Traveller]'s [Passport] expires [date], before this trip ends. Confirm a valid document is held before booking."

4. **In `Dashboard.jsx`** — STX-only widget: "Documents expiring soon" — lists all travellers across the active client whose documents expire within 90 days. Clicking a name navigates to their profile.

5. **Cloud Function (optional):** Scheduled function that runs weekly and queues an email to `client_ops` for any traveller with a document expiring in exactly 90, 60, and 30 days.

---

### B5 — Approval Escalation & Reminders

**Problem:** There is no time pressure on approvers. Trips can sit in `pending_approval` indefinitely with no automated follow-up, blocking the booking process.

**Files to modify:**
- `src/components/admin/ClientForm.jsx` — escalation settings
- `functions/index.js` — new scheduled function
- `src/components/trips/TripList.jsx` — "Awaiting since" column
- `src/components/trips/TripDetail.jsx` — show pending duration

**Data model change:**
```js
// Client config gains:
workflow: {
  // ...existing...
  escalationEnabled: false,
  escalationReminderDays: 2,   // send reminder after N days
  escalationEscalateDays: 5,   // escalate to client_ops after N days
}
```

**Implementation steps:**

1. **In `ClientForm.jsx`** — in the Workflow section, add:
   - "Enable approval escalation" toggle
   - "Send reminder to approver after [N] days" number input
   - "Escalate to Operations after [N] days" number input

2. **In `functions/index.js`** — add `checkApprovalEscalation` scheduled function (runs daily):
   ```js
   // Query all trips in pending_approval status
   // For each: calculate days since submitted (last amendment with type 'status_change' to 'pending_approval')
   // If days >= escalationReminderDays: queue a 'trip_approval_reminder' email to approvers (if not already sent today)
   // If days >= escalationEscalateDays: queue a 'trip_approval_escalation' email to client_ops
   ```

3. **New email types in Cloud Function:**
   - `trip_approval_reminder` — "A trip has been awaiting your approval for N days" — sent to approvers
   - `trip_approval_escalation` — "A trip has been awaiting approval for N days and has been escalated" — sent to client_ops

4. **In `TripList.jsx`** — add an "Awaiting" column on the Active tab that shows how long a `pending_approval` trip has been waiting (e.g., "3 days"). Colour-code: green < reminder threshold, amber between reminder and escalation, red beyond escalation threshold.

5. **In `TripDetail.jsx`** — for `pending_approval` trips, show "Pending approval for X days" in the status area.

---

### B6 — Post-Trip Cost Reconciliation

**Problem:** Sectors capture estimated/quoted costs at booking time. Actual costs (e.g., hotel extended stay, taxi overrun, airline change fee) can differ. There's no mechanism to record actuals and understand the variance.

**Files to modify:**
- `src/components/trips/TripDetail.jsx` — "Record actuals" section
- `src/components/reports/AllTravelReport.jsx` — actual vs estimated columns
- New report: Estimated vs Actual (see Phase C)

**Data model change:**
```js
// Trip document gains:
trip {
  // ...existing...
  actualsRecorded: boolean,
  actualsRecordedAt: string,
  actualsRecordedBy: string,
  sectors: [
    {
      // ...existing...
      actualCost: number | null,  // NEW — null = not yet recorded; 0 is a valid actual
    }
  ]
}
```

**Implementation steps:**

1. **In `TripDetail.jsx`** — for trips with status `completed` (display status), show a "Record actual costs" section (visible to STX and client_ops):
   - One actual cost input per sector, pre-filled with the estimated cost
   - "Mark as complete" button saves actuals and sets `actualsRecorded: true`
   - Once recorded, show a summary: "Estimated: $X · Actual: $Y · Variance: +$Z (N%)"

2. **In `AllTravelReport.jsx`** — add optional "Actual cost" column to the CSV export when actuals have been recorded.

3. **Variance indicator in TripList** (optional enhancement): small delta icon on trips where actuals differ from estimates by > 10%.

---

## Phase C — Reporting Enhancements

---

### C1 — Approval Turnaround Time Report

**What it shows:** How long trips spend in `pending_approval` before being actioned. Identifies slow approval patterns, bottlenecks, and approvers who respond quickly vs those who delay bookings.

**File:** `src/components/reports/ApprovalTurnaroundReport.jsx`

**Data source:** Trip `amendments[]` array — find the amendment where `type === 'status_change'` and `to === 'pending_approval'`, then the next amendment where `type === 'status_change'` and `to` is either `approved` or `declined`. The difference is the turnaround time.

**Report structure:**
- Date range filter (same quick presets as other reports)
- Summary cards: Average turnaround (days), Fastest (days), Slowest (days), % actioned within 1 day
- Table: grouped by approver name — count of approvals, avg days, min/max days
- Table: by trip type — which trip types get actioned fastest?
- CSV export

---

### C2 — Booking Lead Time Trend Report

**What it shows:** Whether the organisation is improving its booking lead time month-over-month. Short lead times (< 7 days) cost more and create booking risk; this report provides the data to advocate for earlier submissions.

**File:** `src/components/reports/LeadTimeTrendReport.jsx`

**Data source:** `leadTimeDays(trip)` from `TripList.jsx` — already calculated per trip.

**Report structure:**
- Line chart: average lead time per month (current FY vs previous FY)
- Distribution pie: % of trips in each lead time band (0–3 / 4–10 / 11–20 / 21+)
- Table: trips with lead time < 7 days (for discussion with client)
- Compare by trip type (self-managed vs STX-managed — are self-managed trips booked earlier?)

**Add to:** `src/pages/Reports.jsx` — new tab "Lead Time Trend"

---

### C3 — Support Worker Cost Report

**What it shows:** Total spend on support worker and carer travel, separately from traveller costs. Required by disability organisations for grant acquittals and service costing.

**File:** `src/components/reports/SupportWorkerReport.jsx`

**Data source:** Trips where `additionalPassengers[].role === 'support_worker' || 'carer'`. Since costs are sector-level (not per-passenger), the report calculates:
- Total trips with support worker accompanying
- Estimated support worker cost = `tripExGST / totalPassengers × supportWorkerCount` (proportional split — documented as an estimate)
- By cost centre, by trip type, by period

**Report structure:**
- Summary: total trips with support, estimated support cost, % of total travel spend
- Bar chart: support worker travel by month
- Table: all trips with support workers — traveller, support worker name, destination, cost estimate
- Note clearly that costs are proportionally estimated (not tracked per person) — exact tracking would require sector-level cost splitting which is not in scope

---

### C4 — Carbon Footprint Estimation

**What it shows:** Estimated CO2 equivalent emissions from flights, by trip and by period. No API required — uses published emission factors.

**File:** `src/components/reports/CarbonReport.jsx`

**Calculation method:**
```js
// Emission factors (kg CO2e per passenger km) — DEFRA 2023 values
const EMISSION_FACTORS = {
  economy_short:      0.255,  // < 3,700 km
  economy_long:       0.195,  // >= 3,700 km
  business_short:     0.510,
  business_long:      0.391,
  first_short:        0.765,
  first_long:         0.585,
};

// Distance lookup: use a static JSON of city-pair distances for AU domestic routes
// International: approximate from lat/long using Haversine formula
```

**Feature flag:** `features.carbonTracking` (default false) — client must opt in.

**Report structure:**
- Total tCO2e for the period
- By trip type (flights only — accommodation and car hire are separate emission categories)
- Top 10 highest-emission routes
- Month-by-month trend

---

### C5 — Travel Insurance Tracking

**Problem:** International trips require travel insurance but there's no mechanism to record policy details against a trip.

**Files to modify:**
- `src/components/trips/TripForm.jsx` — insurance section (shown when any sector has `international: true`)
- `src/components/trips/TripDetail.jsx` — show insurance details prominently for travelling trips

**Data model change:**
```js
// Trip document gains:
trip {
  // ...existing...
  travelInsurance: {
    provider: string,
    policyNumber: string,
    coverFrom: string,  // ISO date
    coverTo: string,    // ISO date
    emergencyPhone: string,
    notes: string,
  } | null
}
```

**Implementation steps:**

1. **In `TripForm.jsx`** — when any sector has `international: true`, show a collapsible "Travel Insurance" section. Mark with a warning if international sectors exist but no insurance has been added (on submit, prompt — not a hard block).

2. **In `TripDetail.jsx`** — for international trips with status `approved`, `booked`, or `travelling`, show the insurance details as a prominent card with the emergency phone number in large text.

3. **Pre-booking checklist (A6) integration:** Add "Travel insurance confirmed and policy details recorded" as an auto-generated checklist item for all international trips.

---

## Phase D — Platform Maturity

---

### D1 — Progressive Web App (PWA)

**Problem:** The portal is web-only. Travellers in transit need offline access to their itinerary (accommodation address, emergency contacts, flight details) when internet is unreliable.

**Files to create/modify:**
- `public/manifest.json` — PWA manifest
- `public/sw.js` — service worker (cache strategy)
- `src/index.js` — register service worker
- `public/icons/` — app icons at required sizes (192×192, 512×512)

**Implementation steps:**

1. **`public/manifest.json`:**
   ```json
   {
     "name": "STX Corporate Travel",
     "short_name": "STX Travel",
     "start_url": "/",
     "display": "standalone",
     "background_color": "#ffffff",
     "theme_color": "#2563eb",
     "icons": [
       { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
       { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
     ]
   }
   ```

2. **Service worker caching strategy:**
   - Cache-first for app shell (JS, CSS, icons)
   - Network-first for Firestore data (falls back to cache for last-viewed trips)
   - The most recently viewed trip detail should always be available offline

3. **Offline indicator:** Show a subtle "Offline — viewing cached data" banner when `navigator.onLine === false`.

4. **Push notifications (after basic PWA is working):** Use Firebase Cloud Messaging to send pre-departure reminders as push notifications instead of (or in addition to) email. Requires user permission prompt.

---

### D2 — Two-Factor Authentication (2FA)

**Problem:** Email/password only. Disability organisations handle sensitive personal data (disability details, ID documents, travel patterns) — 2FA is a reasonable security expectation.

**Files to modify:**
- `src/components/account/AccountSettings.jsx` — 2FA setup/management
- `src/components/admin/ClientForm.jsx` — optional: make 2FA mandatory for a client
- `functions/index.js` — no change needed (Firebase Auth handles TOTP)

**Implementation steps:**

1. **Firebase Auth TOTP:** Firebase Auth supports TOTP (Google Authenticator, Authy) via `multiFactor`. No backend changes needed.

2. **In `AccountSettings.jsx`** — add "Two-Factor Authentication" section:
   - If not enrolled: "Set up 2FA" button → QR code display → verification code input → confirm
   - If enrolled: "2FA enabled ✓" + "Remove 2FA" option

3. **Mandatory 2FA per client** (optional): Add `features.require2FA: false` to client config. If true, users without 2FA enrolled are redirected to the 2FA setup flow on login.

4. **Recovery codes:** Generate 8 one-time recovery codes on enrolment; allow download/copy. Store as hashed values in Firestore.

---

### D3 — Single Sign-On (Microsoft Entra ID / Azure AD)

**Problem:** Many disability organisations run on Microsoft 365. A separate portal password is friction for adoption and a security gap (different password policies, no automatic deprovisioning).

**Files to modify:**
- `src/components/auth/LoginPage.jsx` — add "Sign in with Microsoft" button
- `src/firebase.js` — add OIDC provider configuration
- `src/components/admin/ClientForm.jsx` — SSO configuration section
- `functions/index.js` — handle post-SSO user provisioning

**Implementation steps:**

1. **Firebase OIDC provider:** Configure Microsoft as an OIDC provider in Firebase Console (requires client's Azure AD tenant ID and app registration).

2. **In `LoginPage.jsx`** — add Microsoft SSO button (using `signInWithPopup` with the OidcAuthProvider):
   ```js
   const provider = new OAuthProvider('oidc.microsoft');
   provider.setCustomParameters({ tenant: clientTenantId });
   await signInWithPopup(auth, provider);
   ```

3. **Post-SSO user provisioning:** On first SSO login, the `syncUserClaims` Cloud Function needs to handle users who don't yet have a Firestore profile. Add logic to create a default profile if none exists, with role `client_traveller` and the correct `clientId` (derived from the OIDC tenant mapping).

4. **In `ClientForm.jsx`** — add "SSO Configuration" section: tenant ID input, whether SSO is required (password login disabled) or optional.

5. **Per-client OIDC configuration:** Store `ssoConfig: { provider: 'microsoft', tenantId: '...' }` in the client's Firestore config.

---

### D4 — Custom Fields on Trips

**Problem:** Different disability organisations have unique data capture requirements that don't fit the standard trip model — a funding source code, rostering reference, internal project number, client matter ID.

**Files to modify:**
- `src/components/admin/ClientForm.jsx` — custom fields configuration
- `src/components/trips/TripForm.jsx` — render custom fields
- `src/components/trips/TripDetail.jsx` — display custom fields
- `src/contexts/TenantContext.jsx` — add to CONFIG_DEFAULTS

**Data model:**
```js
// Client config gains:
customFields: [
  {
    key: 'funding_source',        // camelCase — used as Firestore field name
    label: 'Funding source',      // shown in form
    type: 'text' | 'select' | 'number',
    required: false,
    options: ['Option A', 'Option B'],  // only for type: 'select'
    showIn: ['form', 'detail', 'list'], // where to render
  }
]

// Trip document gains:
trip {
  // ...existing...
  customFields: {
    funding_source: 'Option A',
    project_code: '2024-PRJ-001',
  }
}
```

**Implementation steps:**

1. **In `ClientForm.jsx`** — new "Custom Fields" section:
   - Add field button: label input, key (auto-derived from label), type selector, required toggle, options (if select type)
   - Reorder fields via drag-handle (or up/down buttons)
   - Maximum 10 custom fields per client

2. **In `TripForm.jsx`** — after the standard fields, render `clientConfig.customFields` dynamically:
   ```jsx
   {(clientConfig.customFields || []).map(field => (
     <CustomFieldInput key={field.key} field={field} value={form.customFields?.[field.key] || ''} onChange={...} />
   ))}
   ```

3. **In `TripDetail.jsx`** — show custom fields in the trip details section with their configured labels.

4. **In `AllTravelReport.jsx`** — include custom fields in CSV export (one column per field).

---

## Implementation Priority Order

For each working session, suggested order based on impact-to-effort ratio:

```
Session 1: A1 (accessibility card) + B2 (calendar export)      — ~4 hrs
Session 2: A3 (SSR codes) + A4 (accessible accommodation)      — ~5 hrs
Session 3: A2 (support worker flag) + A5 (accessibility ratings) — ~5 hrs
Session 4: A6 (pre-booking checklist)                           — ~6 hrs
Session 5: B1 (trip duplication) + B5 (approval escalation)    — ~5 hrs
Session 6: B4 (document expiry) + C5 (travel insurance)        — ~5 hrs
Session 7: B3 (budget management)                               — ~6 hrs
Session 8: C1 + C2 (approval turnaround + lead time reports)    — ~5 hrs
Session 9: C3 (support worker report) + C4 (carbon footprint)   — ~5 hrs
Session 10: B6 (post-trip reconciliation)                        — ~4 hrs
Session 11: D2 (2FA)                                             — ~6 hrs
Session 12: D1 (PWA)                                             — ~8 hrs
Session 13: D4 (custom fields)                                   — ~8 hrs
Session 14: D3 (SSO — Microsoft)                                 — ~10 hrs
```

---

## Firestore Security Rules — Changes Required

As new collections/fields are added, the following rules additions will be needed:

```js
// Budget config (Phase B3)
match /clients/{clientId}/config/budgets {
  allow read: if isClientMember(clientId) || isSTX();
  allow write: if isSTX();
}

// Trip insurance and checklist fields (Phases A6, C5)
// — no new collection needed; added to existing trip document
// — existing rules cover; checklist write should be STX only:
// Add condition: checklist fields can only be written by STX roles

// Custom fields config (Phase D4)
// — stored in existing /clients/{clientId}/config/settings — no rule change needed
```

---

## Notes for Implementation

- **Feature flags:** All new disability-specific features (A3–A6) should default to `true` — they are always relevant for this platform's audience. Budget management (B3) and carbon tracking (C4) default to `false` — not all clients will have these configured.
- **Backward compatibility:** All new fields on existing documents should be optional with null/empty defaults. Existing trips without the new fields should render cleanly.
- **Testing:** For each Phase A feature, test with a passenger profile that has no accessibility data (should not show empty sections or errors) and one with full data.
- **Email types to add to Cloud Function:** `trip_approval_reminder`, `trip_approval_escalation`, `document_expiry_warning` (for B4/B5).

---

*Document version: 1 May 2026 — STX Corporate Portal V2 Feature Roadmap*
