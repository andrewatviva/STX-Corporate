# STX Corporate Travel Portal — App Summary for Pitch Deck

---

## The Company

**Supported Travel X (STX)** is an Australian travel coordination company specialising in travel for people with disabilities. STX acts as a managed travel coordinator — handling bookings, compliance, and logistics on behalf of corporate clients whose staff or participants have complex travel needs. STX's platform brings that coordination capability online as a purpose-built SaaS product.

- **Website**: supportedtravelx.com.au
- **Phone**: 1300 200 789
- **Email**: enquiries@supportedtravelx.com.au

---

## The Problem

Coordinating travel for people with disabilities is fundamentally different from standard corporate travel. It involves:

- **Deep accessibility knowledge**: wheelchair specifications, transfer methods, carer requirements, dietary and allergy profiles, medical notes — all of which must be communicated correctly to every supplier.
- **Multi-stakeholder coordination**: travellers, carers, operations managers, approvers, finance teams, and STX coordinators all play a role. Keeping everyone aligned without dropping details is operationally complex.
- **Complex itinerary structures**: a single trip may involve accessible vehicle transfers, specific airline accessibility requests, accommodation with roll-in showers, parking, and meals — each with its own supplier, cost, and booking reference.
- **Compliance and audit requirements**: NDIS-managed clients need traceable records of every booking decision, every cost change, and every approval — for both compliance and dispute resolution.
- **Billing complexity**: managing fees, handling domestic vs international GST, generating correct invoices, and ensuring no costs fall through the cracks when trips are amended after invoicing.

Existing corporate travel tools ignore all of this. They are built for standard point-A-to-point-B business travel and offer no meaningful support for accessibility needs. STX was managing these requirements manually across spreadsheets, email, and generic tools — creating inefficiency and risk.

---

## The Solution

The **STX Corporate Travel Portal** is a purpose-built, multi-tenant SaaS platform that digitises the full lifecycle of disability-aware travel coordination — from trip request through to invoice and payment.

It gives STX a scalable, repeatable operating model, and gives corporate clients a transparent, self-service window into their travel programme.

---

## Target Audience

### Primary: Corporate clients of STX
Organisations that employ or support people with disabilities and rely on STX to coordinate their travel. Examples:
- Disability service providers (NDIS registered)
- Government agencies
- Large corporates with accessibility commitments

Within each client organisation:
- **Operations managers** — create and manage travel requests
- **Approvers** — authorise spend before booking
- **Travellers** — view their own trips and profiles

### Secondary: STX internal staff
- **STX Coordinators** — manage bookings across all clients from a single interface
- **STX Admins** — onboard new clients, manage users, generate invoices, run reports

---

## Core Features

### 1. Accessibility-First Passenger Profiles
The most detailed passenger profile system built specifically for disability travel:
- **9 disability categories**: Physical/Mobility, Intellectual/Developmental, Sensory (Vision), Sensory (Hearing), Psychosocial/Mental Health, Neurological, Chronic Illness/Pain, Autism Spectrum, Other
- **Mobility aids**: Manual Wheelchair, Power Wheelchair, Rollator, Crutches, Mobility Scooter, Prosthetic Limb
- **Wheelchair specifications**: model, dimensions, weight, battery model (for power chairs)
- **Transfer methods**: 4 levels from self-transfer through to hoist-required — communicated directly to airlines and accommodation providers
- **Carer tracking**: carer required flag + carer name
- **Medical and allergy notes**, support notes, dietary requirements (10+ options)
- **Emergency contacts** with relationship and contact details
- **Identity documents**: configurable document types per client (Passport, Drivers Licence, etc.)
- **Loyalty programs**: Airline, Hotel, Car Rental, Rail, Other
- **Profile completeness indicator**: visual percentage bar so coordinators know what's missing before booking
- **Portal account linking**: profiles can be linked to user accounts for single sign-on scoping

### 2. Trip Management
Full trip lifecycle management with sector-level granularity:

**Trip-level fields**: traveller, trip type (Self-Managed / STX-Managed / Group Event), cost centre, origin and destination city, purpose, internal notes

**7 sector types**, each with purpose-specific fields:
- **Flight**: route, airline, flight number, departure/arrival times, cabin class, baggage allowance, booking reference, per-sector accessibility notes
- **Accommodation**: property name, check-in/out dates, room type, booking reference, city override for reporting
- **Car Hire**: pickup/drop-off locations, vehicle type
- **Parking**: facility, dates
- **Transfers**: transfer type including Accessible Vehicle option
- **Meals**: meal type (Breakfast through Event Catering)
- **Other**: free-form

Each sector has an **International flag** for GST-free cost tracking, and a **cost field** in AUD.

**Approval workflow**: Draft → Pending Approval → Approved → Booked → Travelling → Completed (with Declined and Cancelled states). Configurable per client — approval can be required or bypassed.

**Amend vs Edit distinction**: live trips require an Amendment (with optional amendment fee prompt); draft/declined trips use a simpler Edit flow.

**File attachments**: supporting documents uploaded to Firebase Storage (10 MB limit), accessible from the trip record.

**Full audit trail**: every save records what changed — field-level diffs including per-sector cost changes, route changes, date changes, and reporting city changes.

### 3. Approval Workflow & Team Hierarchy
- Role-based access: Traveller → Approver → Operations Manager → STX Coordinator → STX Admin
- **Manager/direct-report structure**: managers automatically see their team's trips and profiles — no manual scoping needed
- **Approver delegation**: approvers can be scoped to specific travellers (e.g. a plan manager who only approves for their participants)
- Approval, decline, booking, cancellation, and submission buttons are each permission-gated to the correct role

### 4. Fee Management
- **Management fees**: auto-applied when a trip is created, configurable per client (amount, label, applicable trip types)
- **Amendment fees**: prompted when STX amends a client's trip; STX coordinator can choose to apply or waive
- **GST handling**: fees stored ex-GST; display calculates incl-GST at the configured rate (default 10%)
- All fees tracked on the trip record with who applied them and when

### 5. Invoice Generation
Sophisticated billing engine that handles the real-world complexity of managed travel:
- **Period selector** with quick presets (This Month, Last Month, This Quarter, Last Quarter, This FY, Last FY) plus custom date range
- **Automated unbilled item scanning**: finds all trips created in the period that haven't been invoiced, plus new fees and price changes since the last invoice
- **Cost delta detection**: if a trip's accommodation cost increases after an amendment, the next invoice scan automatically generates a "Cost adjustment" line item for the difference — no manual reconciliation needed
- **Deduplication system**: every line item carries a dedup key; the scanner never double-bills, even across multiple invoice periods
- **Mixed GST handling**: a single trip may include domestic sectors (10% GST) and international sectors (GST-free); both are calculated correctly and presented with separate ex-GST and incl-GST columns
- **Invoice naming**: each invoice can be given a human-readable name (e.g. "April 2026") alongside the auto-generated invoice number
- **Inline line item editing**: descriptions and amounts can be corrected before or after saving
- **Invoice status flow**: Draft → Finalised → Paid; edits locked once paid
- **PDF export**: branded with STX logo and client logo, formatted for printing or emailing to clients
- **CSV export**: structured data for import into accounting software (Xero integration placeholder built in)
- **Access control**: only STX Admins can finalise, mark paid, edit line items, or delete invoices

### 6. Financial Dashboard
- **Trip status overview**: 8 status categories, each clickable to filter the trip list
- **Expenditure tracking**: Australian FY grouping (July–June), incl-GST total, ex-GST total, and GST-free (international) spend
- **Monthly bar chart**: current FY vs prior FY comparison using Recharts
- **Year-on-year % change** indicator
- **Cost centre breakdown**: horizontal bar chart of top 8 cost centres by spend
- **Upcoming trips panel**: next 60 days, approved or booked status
- **Recent trips panel**: last 8 trips
- All data scoped to the user's team hierarchy automatically

### 7. Multi-Tenant Administration
STX can onboard a new corporate client in minutes with zero code changes:
- **Client management panel**: create clients, assign a clientId, configure everything
- **Per-client configuration**:
  - Branding: logo URL, portal title, primary/secondary colours
  - Cost centres: custom list per client
  - Trip and sector types: configurable
  - Document types: configurable
  - Fee structure: management fee and amendment fee amounts, labels, applicable trip types
  - Approval workflow: required or bypass
  - Feature flags: hotel booking, invoicing, reports, group events, file attachments, self-managed trips
- **User management**: create, edit, deactivate, delete users; assign roles and client; trigger password resets
- **STX working-client context**: STX coordinators can switch between clients from the top bar — the entire interface (trips, team, invoices, dashboard) scopes to the selected client

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, React Router v7, Tailwind CSS v3 |
| Icons | Lucide React |
| Charts | Recharts |
| Backend | Firebase Auth, Firestore (real-time), Firebase Storage, Cloud Functions (Node 22) |
| Auth model | Firebase Custom Claims encode `{ role, clientId }` in JWT — enforced in Firestore security rules |
| CI/CD | GitHub Actions — `main` → dev environment, `prod` branch → production |
| Environments | `stx-corporate-dev` (staging) and `stx-corporate` (production) on Firebase Hosting |
| Hotel API | Nuitee (`api.liteapi.travel/v3.0`) — integrated in per-client config, booking flow deferred |

---

## Architecture

**True multi-tenancy with data isolation**: Every client's data lives under `/clients/{clientId}/` in Firestore. Security rules enforce that client users can only ever access their own tenant's data, regardless of how the application is called. STX staff have cross-tenant access controlled by JWT claims.

**Configuration-driven, not code-driven**: Adding a new corporate client, changing their fee structure, enabling or disabling features, or updating their cost centres all happen through the admin UI — zero deployments required.

**Real-time by default**: Firestore listeners mean trip status changes, new bookings, and invoice updates are reflected instantly across all users without page refreshes.

**Audit-first design**: Every change to a trip is recorded as an amendment with a before/after diff. This is not a log — it's a first-class feature that coordinators and clients actively use to understand what changed and when.

---

## Unique Value Propositions

### 1. Built for disability travel — not adapted from standard travel tools
Every part of the passenger profile, trip form, and booking flow was designed around the real requirements of disability travel. Wheelchair transfer methods, carer flags, accessible vehicle transfer types, and per-sector accessibility notes are native features — not workarounds.

### 2. Reflects STX's actual business model
The platform doesn't just digitise trip records — it digitises STX's operating model. The fee structure (management fees auto-applied at booking, amendment fees prompted on change), the coordinator/client relationship, the approval hierarchy, and the invoice billing cycle all map directly to how STX runs its business. The software is the service.

### 3. True multi-tenant SaaS — not a multi-client workaround
Client isolation is enforced at the database and JWT level, not just in the application layer. Each client has their own configuration, their own branding, their own user base, and their own data. STX can serve dozens of corporate clients from one deployment.

### 4. Invoice intelligence that eliminates manual reconciliation
The billing engine handles the hard parts automatically: it knows what's been billed, detects when trip costs change after invoicing, handles domestic vs international GST correctly, and never double-bills across periods. A coordinator can run a billing period scan and have a ready-to-send invoice in minutes rather than hours of spreadsheet work.

### 5. Compliance-grade audit trail
Every field change on every trip is recorded with timestamps, the name of the person who made the change, and what specifically changed. This level of traceability is essential for NDIS-registered providers and for any dispute resolution with suppliers or participants.

### 6. Scales without headcount
Today STX coordinates travel manually. With this platform, each coordinator can manage a much larger client portfolio because the workflow — request, approve, book, invoice, report — is fully structured and self-service for the client side. New clients are onboarded in minutes, not weeks.

---

## Current Build Status

| Phase | Description | Status |
|-------|-------------|--------|
| 0–3 | Bootstrap, architecture, security, admin panel | ✅ Complete |
| 4 | Trip management, dashboard, workflow | ✅ Complete |
| 5 | Passenger profiles | ✅ Complete |
| — | Cost calculation fixes, filters, city data, audit enhancements | ✅ Complete |
| 7 | Invoice generation | ✅ Complete |
| 8 | Analytics reports | ⏳ Next |
| 6 | Hotel booking (Nuitee) | ⏸ Deferred |
| 9 | QA + production deploy | ⏳ Pending |

The core operational platform — trip management, passenger profiles, approval workflow, fee management, and invoicing — is production-ready. Analytics reports and hotel booking integration remain on the roadmap.

---

## The Opportunity

STX currently serves corporate clients in the NDIS and disability services space. The platform positions STX to:

1. **Scale its managed travel business** without proportionally scaling headcount — the coordination work is handled in the platform, not in inboxes and spreadsheets.

2. **License the platform** to other disability travel coordinators or plan managers who face the same coordination complexity but lack the technology.

3. **Differentiate on compliance** — as NDIS auditing requirements increase, having a full digital audit trail of every booking decision becomes a competitive advantage, not just a nice-to-have.

4. **Own the data** — over time, the platform accumulates rich data on disability travel patterns, supplier performance, and cost benchmarks that no general corporate travel tool will ever have.

---

*Document generated from codebase analysis — STX Corporate Travel Portal V2*
*Last updated: 27 April 2026*
